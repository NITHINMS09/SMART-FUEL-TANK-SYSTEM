/**
 * ==============================================================================
 * SMART TANK CONTROL CENTER - MULTI-DEVICE SYNC SERVICE
 * ==============================================================================
 * Client-side real-time communication service leveraging native browser WebSockets
 * and HTTP fallbacks. Handles:
 *  - Automatic connection, heartbeat ping, and exponential backoff reconnection
 *  - Authoritative Gateway telemetry publishing with secret key authentication (Laptop A)
 *  - Remote telemetry consumption (Mobile B, Laptop C, etc.)
 *  - Authenticated command dispatching & physical hardware acknowledgement tracking
 *  - Strict sanitization of WebSocket URLs (purging invalid Vercel:4001 entries)
 *  - Comprehensive multi-tier diagnostic health checks
 * ==============================================================================
 */

import {
  SyncConnectionStatus,
  SyncDeviceRole,
  TelemetrySnapshot,
  RemoteControlAction,
  CapState,
} from '../types';

export const OFFICIAL_RENDER_WS_URL = 'wss://smart-fuel-tank-system.onrender.com';
export const OFFICIAL_RENDER_API_URL = 'https://smart-fuel-tank-system.onrender.com';

export interface CommandResponse {
  success: boolean;
  message: string;
  capState?: CapState;
}

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  statusText: string;
  backendReachable: boolean;
  backendStatusText: string;
  authEndpointAvailable: boolean;
  authStatusText: string;
  wsRelayAvailable: boolean;
  wsStatusText: string;
  testedWsUrl: string;
  testedHttpUrl: string;
  isInvalidConfig: boolean;
  configWarning?: string;
  details?: any;
}

export interface GatewayAuthResult {
  success: boolean;
  message?: string;
  error?: string;
}

type TelemetryListener = (snapshot: TelemetrySnapshot) => void;
type GatewayStatusListener = (online: boolean, message: string) => void;
type GatewayAuthListener = (result: GatewayAuthResult) => void;
type GatewayCommandListener = (cmd: { action: RemoteControlAction; requestId: string }) => void;
type StatusChangeListener = (status: SyncConnectionStatus) => void;
type AuthChangeListener = (isAuthenticated: boolean) => void;

class SyncServiceClass {
  private ws: WebSocket | null = null;
  private status: SyncConnectionStatus = 'DISCONNECTED';
  private role: SyncDeviceRole = 'CLIENT';
  private deviceId: string;
  private serverUrl: string = '';
  private apiUrl: string = '';
  private authToken: string | null = null;
  private gatewayKey: string = '';
  private reconnectTimeout: any = null;
  private reconnectAttempt: number = 0;
  private isExplicitDisconnect: boolean = false;
  private keepaliveTimer: any = null;

  // Pending remote command promises waiting for Gateway acknowledgement
  private pendingCommands = new Map<
    string,
    {
      resolve: (res: CommandResponse) => void;
      reject: (err: any) => void;
      timer: any;
    }
  >();

  // Event Listeners
  private telemetryListeners = new Set<TelemetryListener>();
  private gatewayStatusListeners = new Set<GatewayStatusListener>();
  private gatewayAuthListeners = new Set<GatewayAuthListener>();
  private gatewayCommandListeners = new Set<GatewayCommandListener>();
  private statusChangeListeners = new Set<StatusChangeListener>();
  private authChangeListeners = new Set<AuthChangeListener>();

  constructor() {
    // Generate or restore unique device identifier
    const storedId = localStorage.getItem('smart_tank_device_id');
    if (storedId) {
      this.deviceId = storedId;
    } else {
      this.deviceId = `dev_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('smart_tank_device_id', this.deviceId);
    }

    // Restore cached auth token if available (sessionStorage or localStorage fallback)
    this.authToken =
      sessionStorage.getItem('smart_tank_auth_token') ||
      localStorage.getItem('smart_tank_auth_token');

    // Restore configured Gateway Key or default
    const storedKey = localStorage.getItem('smart_tank_gateway_key');
    this.gatewayKey = storedKey && storedKey.trim() ? storedKey.trim() : 'smart_tank_gateway_secret_2026';

    // Determine initial server & API URLs (with auto-sanitization of stale vercel:4001 URLs)
    this.serverUrl = this.resolveInitialServerUrl();
    this.apiUrl = this.resolveInitialApiUrl();
  }

  /**
   * Check whether a WebSocket URL is invalid (e.g. contains vercel.app or port 4001 on non-localhost)
   */
  public isInvalidRelayUrl(url: string | null | undefined): boolean {
    if (!url || typeof url !== 'string') return true;
    const lower = url.toLowerCase().trim();
    if (!lower) return true;

    // Vercel serverless domains do NOT support persistent WebSockets
    if (lower.includes('vercel.app')) return true;

    // Port 4001 is only valid for local development; cloud platforms use standard SSL (443)
    if (lower.includes(':4001') && !lower.includes('localhost') && !lower.includes('127.0.0.1')) {
      return true;
    }

    return false;
  }

  /**
   * Strictly sanitize any WebSocket Relay URL
   */
  public sanitizeRelayUrl(url: string | null | undefined): string {
    if (!url || typeof url !== 'string') return OFFICIAL_RENDER_WS_URL;
    let trimmed = url.trim();
    if (!trimmed) return OFFICIAL_RENDER_WS_URL;

    // Reject Vercel domains for WebSocket connections
    if (trimmed.includes('vercel.app')) {
      return OFFICIAL_RENDER_WS_URL;
    }

    // Strip :4001 if non-localhost
    if (!trimmed.includes('localhost') && !trimmed.includes('127.0.0.1')) {
      trimmed = trimmed.replace(/:4001\/?$/, '').replace(/:4001\//, '/');
    }

    // Normalize protocol
    if (!trimmed.startsWith('ws://') && !trimmed.startsWith('wss://')) {
      if (trimmed.startsWith('http://')) {
        trimmed = trimmed.replace('http://', 'ws://');
      } else if (trimmed.startsWith('https://')) {
        trimmed = trimmed.replace('https://', 'wss://');
      } else {
        trimmed = `wss://${trimmed}`;
      }
    }

    return trimmed;
  }

  /**
   * Strictly sanitize any HTTP API URL
   */
  public sanitizeApiUrl(url: string | null | undefined): string {
    if (!url || typeof url !== 'string') return OFFICIAL_RENDER_API_URL;
    let trimmed = url.trim();
    if (!trimmed) return OFFICIAL_RENDER_API_URL;

    // Strip :4001 if non-localhost
    if (!trimmed.includes('localhost') && !trimmed.includes('127.0.0.1')) {
      trimmed = trimmed.replace(/:4001\/?$/, '').replace(/:4001\//, '/');
    }

    // Normalize protocol
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      if (trimmed.startsWith('ws://')) {
        trimmed = trimmed.replace('ws://', 'http://');
      } else if (trimmed.startsWith('wss://')) {
        trimmed = trimmed.replace('wss://', 'https://');
      } else {
        trimmed = `https://${trimmed}`;
      }
    }

    return trimmed.replace(/\/+$/, '');
  }

  /**
   * Determine default sync server WebSocket URL
   */
  public resolveInitialServerUrl(): string {
    const saved = localStorage.getItem('smart_tank_sync_url');
    if (saved && saved.trim()) {
      const trimmed = saved.trim();
      // Purge invalid URLs from localStorage immediately
      if (this.isInvalidRelayUrl(trimmed)) {
        console.warn(`[SYNC] Purging invalid stored WebSocket URL (${trimmed}). Resetting to official Render server.`);
        localStorage.removeItem('smart_tank_sync_url');
      } else {
        return this.sanitizeRelayUrl(trimmed);
      }
    }

    const envUrl = (import.meta as any).env?.VITE_SYNC_SERVER_URL;
    if (envUrl && envUrl.trim() && !this.isInvalidRelayUrl(envUrl.trim())) {
      return this.sanitizeRelayUrl(envUrl.trim());
    }

    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      // Local development default only
      if (host === 'localhost' || host === '127.0.0.1') {
        return `ws://${host}:4001`;
      }
    }
    // Production Cloud Backend default (WSS over standard 443 SSL)
    return OFFICIAL_RENDER_WS_URL;
  }

  /**
   * Determine default sync server HTTP API URL
   */
  public resolveInitialApiUrl(): string {
    const saved = localStorage.getItem('smart_tank_api_url');
    if (saved && saved.trim()) {
      const trimmed = saved.trim();
      if (trimmed.includes(':4001') && !trimmed.includes('localhost') && !trimmed.includes('127.0.0.1')) {
        localStorage.removeItem('smart_tank_api_url');
      } else {
        return this.sanitizeApiUrl(trimmed);
      }
    }

    const envUrl = (import.meta as any).env?.VITE_SYNC_API_URL;
    if (envUrl && envUrl.trim()) {
      return this.sanitizeApiUrl(envUrl.trim());
    }

    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return `http://${host}:4001`;
      }
    }
    return OFFICIAL_RENDER_API_URL;
  }

  public getStatus(): SyncConnectionStatus {
    return this.status;
  }

  public getRole(): SyncDeviceRole {
    return this.role;
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public getApiUrl(): string {
    return this.apiUrl;
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public getGatewayKey(): string {
    return this.gatewayKey;
  }

  public setGatewayKey(key: string): void {
    const trimmed = key.trim();
    if (!trimmed) return;
    this.gatewayKey = trimmed;
    localStorage.setItem('smart_tank_gateway_key', trimmed);

    // If currently acting as Gateway, re-authenticate immediately with new key
    if (this.role === 'GATEWAY' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.registerAsGateway(trimmed);
    }
  }

  public isAuthenticated(): boolean {
    return !!this.authToken;
  }

  /**
   * Reset WebSocket and API URLs to the official Render cloud backend
   */
  public resetToOfficialRender(): void {
    localStorage.removeItem('smart_tank_sync_url');
    localStorage.removeItem('smart_tank_api_url');
    this.serverUrl = OFFICIAL_RENDER_WS_URL;
    this.apiUrl = OFFICIAL_RENDER_API_URL;
    this.disconnect();
    this.connect();
  }

  /**
   * Update target sync server URL and reconnect cleanly
   */
  public setServerUrl(newUrl: string): void {
    const sanitized = this.sanitizeRelayUrl(newUrl);

    if (sanitized !== this.serverUrl) {
      this.serverUrl = sanitized;
      localStorage.setItem('smart_tank_sync_url', sanitized);

      const derivedApi = this.sanitizeApiUrl(sanitized);
      this.apiUrl = derivedApi;
      localStorage.setItem('smart_tank_api_url', derivedApi);

      this.disconnect();
      this.connect();
    }
  }

  /**
   * Connect to WebSocket Sync Server
   */
  public connect(url?: string): void {
    if (url) {
      this.setServerUrl(url);
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitDisconnect = false;
    this.setStatus('CONNECTING');

    // Make sure we connect using a sanitized URL
    this.serverUrl = this.sanitizeRelayUrl(this.serverUrl);

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.setStatus('CONNECTED');
        this.startKeepalive();

        // Register role with server (including gateway credentials if this device is Gateway)
        if (this.role === 'GATEWAY') {
          this.send({
            type: 'REGISTER_ROLE',
            role: 'GATEWAY',
            deviceId: this.deviceId,
            gatewayKey: this.gatewayKey,
            deviceName: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 30) : 'GatewayHost',
          });
        } else {
          this.send({
            type: 'REGISTER_ROLE',
            role: 'CLIENT',
            deviceId: this.deviceId,
            deviceName: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 30) : 'WebClient',
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingMessage(msg);
        } catch (err) {
          console.error('[SYNC] Failed to parse message', err);
        }
      };

      this.ws.onerror = () => {
        console.warn('[SYNC] WebSocket connection error on', this.serverUrl);
        this.setStatus('ERROR');
      };

      this.ws.onclose = () => {
        this.stopKeepalive();
        this.ws = null;
        if (!this.isExplicitDisconnect) {
          this.setStatus('DISCONNECTED');
          this.scheduleReconnect();
        } else {
          this.setStatus('DISCONNECTED');
        }
      };
    } catch (err) {
      console.error('[SYNC] Connection initialization failed', err);
      this.setStatus('ERROR');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect cleanly from Sync Server
   */
  public disconnect(): void {
    this.isExplicitDisconnect = true;
    this.stopKeepalive();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('DISCONNECTED');
  }

  /**
   * Start keepalive ping to maintain persistent WebSocket connection through proxies
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'PING', timestamp: Date.now() });
      }
    }, 15000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /**
   * Declare this browser as the authoritative Hardware Gateway (Laptop A connected to ESP32)
   */
  public registerAsGateway(key?: string): void {
    if (key && key.trim()) {
      this.gatewayKey = key.trim();
      localStorage.setItem('smart_tank_gateway_key', this.gatewayKey);
    }
    this.role = 'GATEWAY';

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'REGISTER_ROLE',
        role: 'GATEWAY',
        deviceId: this.deviceId,
        gatewayKey: this.gatewayKey,
        deviceName: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 30) : 'GatewayHost',
      });
    }
  }

  /**
   * Declare this browser as a Remote Client (Mobile B, Tablet, etc.)
   */
  public registerAsClient(): void {
    this.role = 'CLIENT';
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'REGISTER_ROLE',
        role: 'CLIENT',
        deviceId: this.deviceId,
        deviceName: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 30) : 'WebClient',
      });
    }
  }

  /**
   * Broadcast fresh hardware telemetry snapshot from Gateway to all clients
   */
  public broadcastTelemetry(snapshot: TelemetrySnapshot): void {
    if (this.role !== 'GATEWAY') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'TELEMETRY_BROADCAST',
        payload: snapshot,
      });
    }
  }

  /**
   * Gateway acknowledges a remote command execution back to the server
   */
  public sendGatewayAck(
    requestId: string,
    action: RemoteControlAction,
    success: boolean,
    message: string,
    capState?: CapState
  ): void {
    if (this.role !== 'GATEWAY') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'COMMAND_ACK',
        requestId,
        action,
        success,
        message,
        capState,
      });
    }
  }

  /**
   * Authenticate remote client with Security PIN using multi-tier fallback:
   *  Tier 1: Direct WebSocket authentication if connected.
   *  Tier 2: Primary HTTP API (/api/auth) on backend server (Render).
   *  Tier 3: Same-Origin API (/api/auth) on hosting provider (Vercel Serverless).
   */
  public async loginWithPin(pin: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const cleanPin = pin.trim();
    if (!cleanPin) {
      return { success: false, error: 'Please enter a PIN' };
    }

    // -------------------------------------------------------------
    // Tier 1: Try WebSocket authentication if connection is open
    // -------------------------------------------------------------
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const wsRes = await this.authenticateViaWebSocket(cleanPin);
        if (wsRes.success) {
          return wsRes;
        }
        if (wsRes.error && wsRes.error.toLowerCase().includes('pin')) {
          return wsRes;
        }
      } catch (wsErr) {
        console.warn('[SYNC AUTH] WebSocket auth attempt failed, trying HTTP fallback', wsErr);
      }
    }

    // -------------------------------------------------------------
    // Tier 2: Try Primary HTTP API (/api/auth) on Render
    // -------------------------------------------------------------
    const primaryApiUrl = this.sanitizeApiUrl(this.apiUrl);
    try {
      const res = await this.fetchWithTimeout(
        `${primaryApiUrl}/api/auth`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: cleanPin }),
        },
        5000
      );

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.token) {
        this.setAuthToken(data.token);
        return { success: true, token: data.token };
      }
      if (res.status === 401 || (data.error && data.error.toLowerCase().includes('pin'))) {
        return { success: false, error: data.error || 'Invalid Security PIN. Authorization rejected.' };
      }
    } catch (err: any) {
      console.warn(`[SYNC AUTH] Primary API (${primaryApiUrl}) unreachable:`, err?.message);
    }

    // -------------------------------------------------------------
    // Tier 3: Same-Origin Serverless API (/api/auth) fallback (Vercel)
    // -------------------------------------------------------------
    if (typeof window !== 'undefined' && window.location.origin) {
      const originApiUrl = window.location.origin.replace(/\/+$/, '');
      if (originApiUrl !== primaryApiUrl) {
        try {
          const res = await this.fetchWithTimeout(
            `${originApiUrl}/api/auth`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: cleanPin }),
            },
            5000
          );

          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success && data.token) {
            this.setAuthToken(data.token);
            return { success: true, token: data.token };
          }
          if (res.status === 401 || (data.error && data.error.toLowerCase().includes('pin'))) {
            return { success: false, error: data.error || 'Invalid Security PIN. Authorization rejected.' };
          }
        } catch (err: any) {
          console.warn(`[SYNC AUTH] Origin API (${originApiUrl}) unreachable:`, err?.message);
        }
      }
    }

    // Detailed descriptive diagnostic message if completely unreachable
    return {
      success: false,
      error: `Cannot reach authentication backend. If deploying on Render, the free instance may take ~30-50s to wake up from idle sleep. Please verify your server URL in Settings.`,
    };
  }

  /**
   * Helper to perform WebSocket authentication handshake
   */
  private authenticateViaWebSocket(pin: string): Promise<{ success: boolean; token?: string; error?: string }> {
    return new Promise((resolve) => {
      const requestId = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'WebSocket authentication timed out' });
      }, 4000);

      const oneTimeHandler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.requestId === requestId) {
            clearTimeout(timeout);
            this.ws?.removeEventListener('message', oneTimeHandler);

            if (msg.type === 'AUTH_SUCCESS' && msg.token) {
              this.setAuthToken(msg.token);
              resolve({ success: true, token: msg.token });
            } else {
              resolve({ success: false, error: msg.error || 'Invalid Security PIN' });
            }
          }
        } catch (e) {
          // ignore parse errors
        }
      };

      this.ws?.addEventListener('message', oneTimeHandler);

      this.send({
        type: 'AUTH_LOGIN',
        pin,
        requestId,
      });
    });
  }

  /**
   * Comprehensive multi-point diagnostic health test:
   *  1. Backend Web Service Check (Render HTTP /health or /api/health)
   *  2. Authentication Endpoint Check (/api/auth)
   *  3. WebSocket Relay Reachability Check (live handshake)
   */
  public async checkServerHealth(customUrl?: string): Promise<HealthCheckResult> {
    const rawInput = (customUrl || this.serverUrl).trim();
    const isInvalidConfig = this.isInvalidRelayUrl(rawInput);
    const configWarning = isInvalidConfig
      ? 'Vercel domain or port 4001 cannot host persistent WebSockets. Using official Render relay.'
      : undefined;

    const testedWsUrl = this.sanitizeRelayUrl(rawInput);
    const testedHttpUrl = this.sanitizeApiUrl(customUrl || this.apiUrl);
    const start = Date.now();

    let backendReachable = false;
    let backendStatusText = 'Backend Unavailable';
    let authEndpointAvailable = false;
    let authStatusText = 'Authentication Endpoint Unavailable';
    let wsRelayAvailable = false;
    let wsStatusText = 'WebSocket Relay Unavailable';
    let detailsData: any = null;

    // -------------------------------------------------------------
    // Test 1: Backend Web Service Reachability (Render /health or /api/health)
    // -------------------------------------------------------------
    try {
      const res = await this.fetchWithTimeout(`${testedHttpUrl}/api/health`, { method: 'GET' }, 5000);
      const latencyMs = Date.now() - start;

      if (res.ok) {
        backendReachable = true;
        backendStatusText = `ONLINE (${latencyMs}ms)`;
        detailsData = await res.json().catch(() => ({}));
      } else {
        backendReachable = false;
        backendStatusText = `HTTP ${res.status}: ${res.statusText || 'Error'} (Cold-starting)`;
      }
    } catch (err: any) {
      backendReachable = false;
      backendStatusText = err?.message?.includes('aborted')
        ? 'Timed out (Backend cold-starting ~30-50s)'
        : 'Backend Unavailable';
    }

    // -------------------------------------------------------------
    // Test 2: Authentication Endpoint Check (/api/auth)
    // -------------------------------------------------------------
    try {
      const res = await this.fetchWithTimeout(`${testedHttpUrl}/api/auth`, { method: 'OPTIONS' }, 4000);
      if (res.ok || res.status === 204 || res.status === 405) {
        authEndpointAvailable = true;
        authStatusText = 'Ready (Render Relay)';
      }
    } catch {
      // Try same-origin Vercel fallback
      if (typeof window !== 'undefined' && window.location.origin) {
        try {
          const originRes = await this.fetchWithTimeout(
            `${window.location.origin}/api/auth`,
            { method: 'OPTIONS' },
            4000
          );
          if (originRes.ok || originRes.status === 204 || originRes.status === 405) {
            authEndpointAvailable = true;
            authStatusText = 'Ready (Vercel Serverless Fallback)';
          }
        } catch {
          authEndpointAvailable = false;
        }
      }
    }

    // -------------------------------------------------------------
    // Test 3: WebSocket Relay Reachability Check (live handshake)
    // -------------------------------------------------------------
    wsRelayAvailable = await new Promise<boolean>((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            probeWs.close();
          } catch (e) {}
          resolve(false);
        }
      }, 4000);

      let probeWs: WebSocket;
      try {
        probeWs = new WebSocket(testedWsUrl);
        probeWs.onopen = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            try {
              probeWs.close();
            } catch (e) {}
            resolve(true);
          }
        };
        probeWs.onerror = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(false);
          }
        };
      } catch {
        clearTimeout(timer);
        resolve(false);
      }
    });

    if (wsRelayAvailable) {
      wsStatusText = 'WebSocket Relay Connected';
    } else {
      wsStatusText = 'WebSocket Relay Unavailable';
    }

    const overallOk = wsRelayAvailable && (backendReachable || authEndpointAvailable);
    const overallLatency = Date.now() - start;

    return {
      ok: overallOk,
      latencyMs: overallLatency,
      statusText: overallOk
        ? `SYSTEMS READY (${overallLatency}ms)`
        : wsRelayAvailable
        ? 'RELAY CONNECTED (Auth fallback active)'
        : 'RELAY UNAVAILABLE',
      backendReachable,
      backendStatusText,
      authEndpointAvailable,
      authStatusText,
      wsRelayAvailable,
      wsStatusText,
      testedWsUrl,
      testedHttpUrl,
      isInvalidConfig,
      configWarning,
      details: detailsData,
    };
  }

  /**
   * Safe fetch with AbortController timeout
   */
  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Log out of remote control authorization
   */
  public logout(): void {
    this.authToken = null;
    sessionStorage.removeItem('smart_tank_auth_token');
    localStorage.removeItem('smart_tank_auth_token');
    for (const listener of this.authChangeListeners) {
      listener(false);
    }
  }

  /**
   * Send remote motor command from Client to Gateway
   */
  public sendRemoteCommand(action: RemoteControlAction): Promise<CommandResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Sync server is disconnected. Waiting for connection to restore...'));
      }
      if (!this.authToken) {
        return reject(new Error('UNAUTHORIZED: Please enter security PIN to operate cap controls'));
      }

      const requestId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      // 10 second timeout for ESP32 hardware acknowledgement
      const timer = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new Error('Timeout: ESP32 hardware did not acknowledge command in time'));
      }, 10000);

      this.pendingCommands.set(requestId, { resolve, reject, timer });

      this.send({
        type: 'EXECUTE_COMMAND',
        action,
        token: this.authToken,
        requestId,
      });
    });
  }

  // -----------------------------------------------------------------
  // Internal Event Handling
  // -----------------------------------------------------------------

  private handleIncomingMessage(msg: any): void {
    switch (msg.type) {
      case 'SYNC_SNAPSHOT':
      case 'TELEMETRY_UPDATE': {
        if (msg.payload) {
          for (const listener of this.telemetryListeners) {
            listener(msg.payload);
          }
        }
        break;
      }

      case 'GATEWAY_STATUS': {
        for (const listener of this.gatewayStatusListeners) {
          listener(msg.online, msg.message || '');
        }
        break;
      }

      case 'GATEWAY_AUTH_SUCCESS': {
        console.log(`[SYNC GATEWAY] Registration verified: ${msg.message}`);
        for (const listener of this.gatewayAuthListeners) {
          listener({ success: true, message: msg.message });
        }
        break;
      }

      case 'GATEWAY_AUTH_FAILED': {
        console.warn(`[SYNC GATEWAY] Registration rejected: ${msg.error}`);
        for (const listener of this.gatewayAuthListeners) {
          listener({ success: false, error: msg.error });
        }
        break;
      }

      case 'GATEWAY_SUPERSEDED': {
        console.warn(`[SYNC GATEWAY] Gateway session superseded by newer connection: ${msg.message}`);
        this.role = 'CLIENT';
        for (const listener of this.gatewayAuthListeners) {
          listener({ success: false, error: msg.message });
        }
        break;
      }

      case 'DISPATCH_HARDWARE_COMMAND': {
        // Gateway receives command intended for physical ESP32
        if (this.role === 'GATEWAY') {
          for (const listener of this.gatewayCommandListeners) {
            listener({ action: msg.action, requestId: msg.requestId });
          }
        }
        break;
      }

      case 'COMMAND_ACK': {
        // Client receives execution confirmation from Gateway
        const pending = this.pendingCommands.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCommands.delete(msg.requestId);
          pending.resolve({
            success: msg.success,
            message: msg.message,
            capState: msg.capState,
          });
        }
        break;
      }

      case 'COMMAND_REJECTED': {
        const pending = this.pendingCommands.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCommands.delete(msg.requestId);
          pending.reject(new Error(msg.error || 'Command rejected by sync server'));
        }
        break;
      }

      case 'PONG':
        // Heartbeat response from server
        break;

      default:
        break;
    }
  }

  private setStatus(newStatus: SyncConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      for (const listener of this.statusChangeListeners) {
        listener(newStatus);
      }
    }
  }

  private setAuthToken(token: string): void {
    this.authToken = token;
    sessionStorage.setItem('smart_tank_auth_token', token);
    localStorage.setItem('smart_tank_auth_token', token);
    for (const listener of this.authChangeListeners) {
      listener(true);
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitDisconnect || this.reconnectTimeout) return;
    this.reconnectAttempt++;
    // Exponential backoff: 1s, 2s, 4s, up to 8s max
    const delay = Math.min(8000, 1000 * Math.pow(1.5, this.reconnectAttempt));

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private send(obj: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch (err) {
        console.error('[SYNC SEND ERROR]', err);
      }
    }
  }

  // -----------------------------------------------------------------
  // Subscriptions
  // -----------------------------------------------------------------

  public onTelemetryUpdate(cb: TelemetryListener): () => void {
    this.telemetryListeners.add(cb);
    return () => this.telemetryListeners.delete(cb);
  }

  public onGatewayStatus(cb: GatewayStatusListener): () => void {
    this.gatewayStatusListeners.add(cb);
    return () => this.gatewayStatusListeners.delete(cb);
  }

  public onGatewayAuthStatus(cb: GatewayAuthListener): () => void {
    this.gatewayAuthListeners.add(cb);
    return () => this.gatewayAuthListeners.delete(cb);
  }

  public onGatewayCommand(cb: GatewayCommandListener): () => void {
    this.gatewayCommandListeners.add(cb);
    return () => this.gatewayCommandListeners.delete(cb);
  }

  public onStatusChange(cb: StatusChangeListener): () => void {
    this.statusChangeListeners.add(cb);
    return () => this.statusChangeListeners.delete(cb);
  }

  public onAuthChange(cb: AuthChangeListener): () => void {
    this.authChangeListeners.add(cb);
    return () => this.authChangeListeners.delete(cb);
  }
}

export const SyncService = new SyncServiceClass();

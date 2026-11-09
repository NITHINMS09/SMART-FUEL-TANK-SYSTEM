/**
 * ==============================================================================
 * SMART TANK CONTROL CENTER - MULTI-DEVICE SYNC SERVICE
 * ==============================================================================
 * Client-side real-time communication service leveraging native browser WebSockets.
 * Handles:
 *  - Automatic connection and exponential backoff reconnection
 *  - Gateway telemetry publishing (Laptop A)
 *  - Remote telemetry consumption (Mobile B, Laptop C, etc.)
 *  - Authenticated command dispatching & acknowledgement tracking
 * ==============================================================================
 */

import {
  SyncConnectionStatus,
  SyncDeviceRole,
  TelemetrySnapshot,
  RemoteControlAction,
  CapState,
} from '../types';

export interface CommandResponse {
  success: boolean;
  message: string;
  capState?: CapState;
}

type TelemetryListener = (snapshot: TelemetrySnapshot) => void;
type GatewayStatusListener = (online: boolean, message: string) => void;
type GatewayCommandListener = (cmd: { action: RemoteControlAction; requestId: string }) => void;
type StatusChangeListener = (status: SyncConnectionStatus) => void;
type AuthChangeListener = (isAuthenticated: boolean) => void;

class SyncServiceClass {
  private ws: WebSocket | null = null;
  private status: SyncConnectionStatus = 'DISCONNECTED';
  private role: SyncDeviceRole = 'CLIENT';
  private deviceId: string;
  private serverUrl: string = '';
  private authToken: string | null = null;
  private reconnectTimeout: any = null;
  private reconnectAttempt: number = 0;
  private isExplicitDisconnect: boolean = false;

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

    // Restore cached auth token if available
    this.authToken = sessionStorage.getItem('smart_tank_auth_token');

    // Determine initial server URL
    this.serverUrl = this.resolveInitialServerUrl();
  }

  /**
   * Determine default sync server URL based on environment or storage
   */
  public resolveInitialServerUrl(): string {
    const saved = localStorage.getItem('smart_tank_sync_url');
    if (saved) return saved;

    const envUrl = (import.meta as any).env?.VITE_SYNC_SERVER_URL;
    if (envUrl) return envUrl;

    if (typeof window !== 'undefined') {
      const isSecure = window.location.protocol === 'https:';
      const host = window.location.hostname;
      // If running locally, default to port 4001
      if (host === 'localhost' || host === '127.0.0.1') {
        return `ws://${host}:4001`;
      }
      // In production, user can configure or connect to wss://
      return `${isSecure ? 'wss' : 'ws'}://${host}:4001`;
    }
    return 'ws://localhost:4001';
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

  public getDeviceId(): string {
    return this.deviceId;
  }

  public isAuthenticated(): boolean {
    return !!this.authToken;
  }

  /**
   * Update target sync server URL and reconnect
   */
  public setServerUrl(newUrl: string): void {
    const trimmed = newUrl.trim();
    if (trimmed && trimmed !== this.serverUrl) {
      this.serverUrl = trimmed;
      localStorage.setItem('smart_tank_sync_url', trimmed);
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Connect to WebSocket Sync Server
   */
  public connect(url?: string): void {
    if (url) {
      this.serverUrl = url;
      localStorage.setItem('smart_tank_sync_url', url);
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitDisconnect = false;
    this.setStatus('CONNECTING');

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.setStatus('CONNECTED');

        // Register role with server
        this.send({
          type: 'REGISTER_ROLE',
          role: this.role,
          deviceId: this.deviceId,
          deviceName: navigator.userAgent.slice(0, 30),
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingMessage(msg);
        } catch (err) {
          console.error('[SYNC] Failed to parse message', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[SYNC] WebSocket error on connection to', this.serverUrl);
        this.setStatus('ERROR');
      };

      this.ws.onclose = () => {
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
   * Declare this browser as the authoritative Hardware Gateway (Laptop A connected to ESP32)
   */
  public registerAsGateway(): void {
    this.role = 'GATEWAY';
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'REGISTER_ROLE',
        role: 'GATEWAY',
        deviceId: this.deviceId,
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
   * Authenticate remote client with Security PIN
   */
  public async loginWithPin(pin: string): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Fallback: Attempt HTTP POST /api/auth if WS is not open
      try {
        const httpBase = this.serverUrl.replace(/^ws(s?):\/\//, 'http$1://');
        const res = await fetch(`${httpBase}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = await res.json();
        if (data.success && data.token) {
          this.setAuthToken(data.token);
          return { success: true, token: data.token };
        }
        return { success: false, error: data.error || 'Authentication rejected' };
      } catch (err: any) {
        return { success: false, error: 'Cannot reach authentication server' };
      }
    }

    return new Promise((resolve) => {
      const requestId = `auth_${Date.now()}`;
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Authentication request timed out' });
      }, 5000);

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
              resolve({ success: false, error: msg.error || 'Invalid PIN' });
            }
          }
        } catch (e) {
          // ignore
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
   * Log out of remote control authorization
   */
  public logout(): void {
    this.authToken = null;
    sessionStorage.removeItem('smart_tank_auth_token');
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
        return reject(new Error('Sync server is disconnected'));
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
    for (const listener of this.authChangeListeners) {
      listener(true);
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitDisconnect || this.reconnectTimeout) return;
    this.reconnectAttempt++;
    // Exponential backoff: 1s, 2s, 4s, up to 10s max
    const delay = Math.min(10000, 1000 * Math.pow(1.5, this.reconnectAttempt));

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

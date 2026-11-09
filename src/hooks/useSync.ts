import { useState, useEffect, useCallback, useRef } from 'react';
import { SyncService, CommandResponse, GatewayAuthResult } from '../services/syncService';
import {
  ConnectionState,
  SyncConnectionStatus,
  TelemetrySnapshot,
  RemoteControlAction,
  CapState,
} from '../types';

interface UseSyncProps {
  localConnectionState: ConnectionState;
  localSnapshotProvider?: () => TelemetrySnapshot;
  onExecuteLocalCommand?: (
    action: RemoteControlAction,
    requestId: string
  ) => Promise<{ success: boolean; message: string; capState?: CapState }>;
}

export function useSync({
  localConnectionState,
  localSnapshotProvider,
  onExecuteLocalCommand,
}: UseSyncProps) {
  const [syncStatus, setSyncStatus] = useState<SyncConnectionStatus>(SyncService.getStatus());
  const [isGatewayOnline, setIsGatewayOnline] = useState<boolean>(false);
  const [gatewayMessage, setGatewayMessage] = useState<string>(
    'ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE'
  );
  const [gatewayAuthStatus, setGatewayAuthStatus] = useState<GatewayAuthResult | null>(null);
  const [remoteSnapshot, setRemoteSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(SyncService.isAuthenticated());
  const [serverUrl, setServerUrlState] = useState<string>(SyncService.getServerUrl());
  const [gatewayKey, setGatewayKeyState] = useState<string>(SyncService.getGatewayKey());

  const isThisDeviceGateway = localConnectionState === 'CONNECTED';
  const lastBroadcastTimeRef = useRef<number>(0);

  // Initialize connection on mount
  useEffect(() => {
    SyncService.connect();

    const unsubStatus = SyncService.onStatusChange((newStatus) => {
      setSyncStatus(newStatus);
    });

    const unsubGatewayStatus = SyncService.onGatewayStatus((online, msg) => {
      setIsGatewayOnline(online);
      setGatewayMessage(msg || (online ? 'Gateway Online' : 'ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE'));
    });

    const unsubGatewayAuth = SyncService.onGatewayAuthStatus((authResult) => {
      setGatewayAuthStatus(authResult);
      if (!authResult.success && authResult.error) {
        setGatewayMessage(authResult.error);
      }
    });

    const unsubTelemetry = SyncService.onTelemetryUpdate((snapshot) => {
      setRemoteSnapshot(snapshot);
      if (snapshot.gatewayOnline !== undefined) {
        setIsGatewayOnline(snapshot.gatewayOnline);
      }
    });

    const unsubAuth = SyncService.onAuthChange((auth) => {
      setIsAuthenticated(auth);
    });

    return () => {
      unsubStatus();
      unsubGatewayStatus();
      unsubGatewayAuth();
      unsubTelemetry();
      unsubAuth();
    };
  }, []);

  // Synchronize Device Role (Gateway vs Client) based on local Web Serial state
  useEffect(() => {
    if (isThisDeviceGateway) {
      SyncService.registerAsGateway();
      setIsGatewayOnline(true);
    } else {
      SyncService.registerAsClient();
    }
  }, [isThisDeviceGateway]);

  // Handle incoming remote commands if this device is the active Gateway
  useEffect(() => {
    if (!isThisDeviceGateway || !onExecuteLocalCommand) return;

    const unsubCommand = SyncService.onGatewayCommand(async ({ action, requestId }) => {
      console.log(`[GATEWAY EXECUTION] Received remote command ${action} (req: ${requestId})`);
      try {
        const result = await onExecuteLocalCommand(action, requestId);
        SyncService.sendGatewayAck(
          requestId,
          action,
          result.success,
          result.message,
          result.capState
        );
      } catch (err: any) {
        SyncService.sendGatewayAck(
          requestId,
          action,
          false,
          err?.message || 'Execution error on ESP32 gateway'
        );
      }
    });

    return () => {
      unsubCommand();
    };
  }, [isThisDeviceGateway, onExecuteLocalCommand]);

  // Periodic / Throttle Gateway Telemetry Broadcast
  const broadcastCurrentState = useCallback(() => {
    if (!isThisDeviceGateway || !localSnapshotProvider) return;
    const now = Date.now();
    // Throttle to max 10 updates per second (80ms) to ensure smooth real-time networking
    if (now - lastBroadcastTimeRef.current < 80) return;
    lastBroadcastTimeRef.current = now;

    const snapshot = localSnapshotProvider();
    SyncService.broadcastTelemetry(snapshot);
  }, [isThisDeviceGateway, localSnapshotProvider]);

  // Authentication Helpers
  const authenticate = useCallback(async (pin: string) => {
    const res = await SyncService.loginWithPin(pin);
    if (res.success) {
      setIsAuthenticated(true);
    }
    return res;
  }, []);

  const logout = useCallback(() => {
    SyncService.logout();
    setIsAuthenticated(false);
  }, []);

  const setServerUrl = useCallback((newUrl: string) => {
    SyncService.setServerUrl(newUrl);
    setServerUrlState(newUrl);
  }, []);

  const setGatewayKey = useCallback((newKey: string) => {
    SyncService.setGatewayKey(newKey);
    setGatewayKeyState(newKey);
  }, []);

  const checkServerHealth = useCallback(async (customUrl?: string) => {
    return await SyncService.checkServerHealth(customUrl);
  }, []);

  const resetToOfficialRender = useCallback(() => {
    SyncService.resetToOfficialRender();
    setServerUrlState(SyncService.getServerUrl());
  }, []);

  // Remote Action Dispatchers
  const triggerRemoteCapOpen = useCallback(async (): Promise<CommandResponse> => {
    return await SyncService.sendRemoteCommand('CAP_OPEN');
  }, []);

  const triggerRemoteCapClose = useCallback(async (): Promise<CommandResponse> => {
    return await SyncService.sendRemoteCommand('CAP_CLOSE');
  }, []);

  const triggerRemoteEmergencyStop = useCallback(async (): Promise<CommandResponse> => {
    return await SyncService.sendRemoteCommand('EMERGENCY_STOP');
  }, []);

  return {
    syncStatus,
    isGatewayOnline: isThisDeviceGateway || isGatewayOnline,
    isThisDeviceGateway,
    gatewayMessage,
    gatewayAuthStatus,
    remoteSnapshot,
    isAuthenticated,
    serverUrl,
    apiUrl: SyncService.getApiUrl(),
    gatewayKey,
    setGatewayKey,
    setServerUrl,
    resetToOfficialRender,
    checkServerHealth,
    authenticate,
    logout,
    broadcastCurrentState,
    triggerRemoteCapOpen,
    triggerRemoteCapClose,
    triggerRemoteEmergencyStop,
  };
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSerial } from './hooks/useSerial';
import { useCalibration } from './hooks/useCalibration';
import { useMotorProfiles } from './hooks/useMotorProfiles';
import { useLoadCell } from './hooks/useLoadCell';
import { useAutomation } from './hooks/useAutomation';
import { useSync } from './hooks/useSync';
import { StorageService } from './services/storageService';
import {
  DeviceSettings,
  MotorDirection,
  RemoteControlAction,
  CapState,
  TelemetrySnapshot,
  LoadCellStats,
  InterpolationResult,
  LastMotorOperation,
  RawReading,
  ConnectionState,
  MotorStatus,
} from './types';

// Common Components
import { Header } from './components/common/Header';
import { Sidebar, PageId } from './components/common/Sidebar';
import { SerialConsole } from './components/common/SerialConsole';
import { RemoteAuthModal } from './components/common/RemoteAuthModal';

// Pages
import { DriverDashboardPage } from './pages/DriverDashboardPage';
import { DashboardPage } from './pages/DashboardPage';
import { LiveMonitoringPage } from './pages/LiveMonitoringPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { CalibrationHistoryPage } from './pages/CalibrationHistoryPage';
import { MotorConfigPage } from './pages/MotorConfigPage';
import { MotorTestingPage } from './pages/MotorTestingPage';
import { AutomationPage } from './pages/AutomationPage';
import { DeviceSettingsPage } from './pages/DeviceSettingsPage';
import { DataBackupPage } from './pages/DataBackupPage';

export function App() {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [settings, setSettings] = useState<DeviceSettings>(() => StorageService.loadSettings());

  // Hardware Serial Hook (authoritative physical connection on Laptop A)
  const {
    connectionState,
    errorMessage,
    systemReady,
    hx711Status,
    motorStatus,
    lastOperation,
    messages,
    isWebSerialSupported,
    connect,
    disconnect,
    sendCommand,
    emergencyStop,
  } = useSerial();

  // Calibration Hook
  const {
    points,
    isCalibrating,
    calibrationError,
    lastSavedMessage,
    latestCalResult,
    calProcessingStatus,
    debugLogs,
    startCalibrationCapture,
    cancelCalibration,
    deletePoint,
    updatePoint,
    replaceAllPoints,
    clearDebugLogs,
  } = useCalibration();

  // Motor Profiles Hook
  const {
    profiles,
    isSaving: isMotorProfileSaving,
    profileMessage,
    profileError,
    saveProfile,
    deleteProfile,
    replaceAllProfiles,
    testRotation,
  } = useMotorProfiles();

  // Load Cell Hook
  const {
    readings,
    stats,
    volumeInterpolation,
    volumeHistory,
    stabilityThreshold,
    setStabilityThreshold,
    clearReadings,
  } = useLoadCell(points, settings.stabilityThreshold, settings.calibrationSampleCount);

  // Automation Hook
  const {
    mode,
    setMode,
    history: automationHistory,
    isRunning: isAutomationRunning,
    progress: autoCloseProgress,
    feedbackState: automationFeedbackState,
    updateConfig: updateAutomationConfig,
    triggerEmergencyStop,
    zeroMotorPosition,
    triggerCapClose,
    triggerCapOpen,
    clearHistory: clearAutomationHistory,
  } = useAutomation(
    readings,
    stats,
    volumeInterpolation,
    points,
    profiles,
    connectionState,
    testRotation
  );

  // Buffer for remote client live charts
  const [remoteReadings, setRemoteReadings] = useState<RawReading[]>([]);
  const [remoteVolumeHistory, setRemoteVolumeHistory] = useState<{ timestamp: number; volumeMl: number }[]>([]);

  // Telemetry Snapshot Provider for Gateway Broadcasting
  const getLocalSnapshot = useCallback((): TelemetrySnapshot => {
    const confirmedPoints = points.filter((p) => p.status === 'CONFIRMED');
    const maxVol =
      confirmedPoints.length > 0
        ? Math.max(...confirmedPoints.map((p) => p.volumeMl), 1000)
        : 1000;
    const currentVol = volumeInterpolation.volumeMl;
    const pct =
      currentVol !== null && maxVol > 0
        ? Math.min(100, Math.max(0, (currentVol / maxVol) * 100))
        : 0;

    return {
      timestamp: Date.now(),
      gatewayOnline: connectionState === 'CONNECTED',
      currentRaw: stats.currentRaw,
      filteredRaw: stats.filteredRaw !== null ? stats.filteredRaw : stats.average,
      average: stats.average,
      minimum: stats.minimum,
      maximum: stats.maximum,
      range: stats.range,
      stability: stats.stability,
      sampleCount: stats.sampleCount,
      volumeMl: currentVol,
      percentage: pct,
      maxCapacity: maxVol,
      isCalibrated: volumeInterpolation.isCalibrated,
      calibrationPointCount: confirmedPoints.length,
      capState: automationFeedbackState?.capState || 'OPEN',
      systemState:
        automationFeedbackState?.systemState ||
        (automationFeedbackState?.capState === 'CLOSED'
          ? 'CAP CLOSED — AUTOMATION ACTIVE'
          : 'CAP OPEN — AUTOMATION DISABLED'),
      motorStatus,
      isMotorRunning: motorStatus === 'RUNNING',
      selectedProfileName: automationFeedbackState?.selectedProfileName || null,
      selectedDegrees: automationFeedbackState?.targetMotorPosition ?? null,
      selectedDirection:
        automationFeedbackState?.motorDirection === 'IDLE'
          ? null
          : (automationFeedbackState?.motorDirection as MotorDirection),
      lastMotorOperation: lastOperation,
    };
  }, [
    connectionState,
    stats,
    volumeInterpolation,
    points,
    automationFeedbackState,
    motorStatus,
    lastOperation,
  ]);

  // Handler for executing commands dispatched from remote clients when running on Gateway host
  const handleExecuteLocalCommand = useCallback(
    async (
      action: RemoteControlAction,
      requestId: string
    ): Promise<{ success: boolean; message: string; capState?: CapState }> => {
      console.log(`[GATEWAY HOST] Executing remote command '${action}' (req: ${requestId})`);
      try {
        if (action === 'CAP_OPEN') {
          await triggerCapOpen();
          return {
            success: true,
            message: 'Physical cap OPEN completed by Gateway',
            capState: 'OPEN',
          };
        }
        if (action === 'CAP_CLOSE') {
          await triggerCapClose();
          return {
            success: true,
            message: 'Physical cap CLOSE completed by Gateway',
            capState: 'CLOSED',
          };
        }
        if (action === 'EMERGENCY_STOP') {
          await emergencyStop();
          return {
            success: true,
            message: 'Emergency Stop executed on Gateway',
          };
        }
        return { success: false, message: `Unsupported action: ${action}` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Gateway command execution failed' };
      }
    },
    [triggerCapOpen, triggerCapClose, emergencyStop]
  );

  // Multi-Device Real-time Sync Hook
  const {
    syncStatus,
    isGatewayOnline,
    isThisDeviceGateway,
    gatewayMessage,
    remoteSnapshot,
    isAuthenticated,
    serverUrl,
    apiUrl,
    setServerUrl,
    checkServerHealth,
    authenticate,
    logout,
    broadcastCurrentState,
    triggerRemoteCapOpen,
    triggerRemoteCapClose,
    triggerRemoteEmergencyStop,
  } = useSync({
    localConnectionState: connectionState,
    localSnapshotProvider: getLocalSnapshot,
    onExecuteLocalCommand: handleExecuteLocalCommand,
  });

  // Gateway broadcasts state whenever local readings or automation state changes
  useEffect(() => {
    if (isThisDeviceGateway) {
      broadcastCurrentState();
    }
  }, [
    isThisDeviceGateway,
    stats,
    volumeInterpolation,
    automationFeedbackState,
    motorStatus,
    lastOperation,
    broadcastCurrentState,
  ]);

  // Remote client builds rolling chart buffers from incoming snapshots
  useEffect(() => {
    if (!isThisDeviceGateway && remoteSnapshot) {
      if (remoteSnapshot.currentRaw !== null) {
        setRemoteReadings((prev) => {
          const updated = [...prev, { timestamp: remoteSnapshot.timestamp, raw: remoteSnapshot.currentRaw! }];
          return updated.slice(-20);
        });
      }
      if (remoteSnapshot.volumeMl !== null) {
        setRemoteVolumeHistory((prev) => {
          const updated = [...prev, { timestamp: remoteSnapshot.timestamp, volumeMl: remoteSnapshot.volumeMl! }];
          return updated.slice(-30);
        });
      }
    }
  }, [isThisDeviceGateway, remoteSnapshot]);

  // Derived effective values across local gateway and remote client
  const effectiveStats: LoadCellStats = useMemo(() => {
    if (isThisDeviceGateway || !remoteSnapshot) return stats;
    return {
      currentRaw: remoteSnapshot.currentRaw,
      filteredRaw: remoteSnapshot.filteredRaw,
      average: remoteSnapshot.average,
      minimum: remoteSnapshot.minimum,
      maximum: remoteSnapshot.maximum,
      range: remoteSnapshot.range,
      stability: remoteSnapshot.stability || 'WAITING FOR READINGS',
      sampleCount: remoteSnapshot.sampleCount || 0,
      history: remoteReadings,
    };
  }, [isThisDeviceGateway, remoteSnapshot, stats, remoteReadings]);

  const effectiveVolumeInterpolation: InterpolationResult = useMemo(() => {
    if (isThisDeviceGateway || !remoteSnapshot) return volumeInterpolation;
    return {
      volumeMl: remoteSnapshot.volumeMl,
      isCalibrated: remoteSnapshot.isCalibrated,
      isOutOfRange: false,
      statusMessage: remoteSnapshot.isCalibrated ? 'Calibrated' : 'Uncalibrated',
    };
  }, [isThisDeviceGateway, remoteSnapshot, volumeInterpolation]);

  const effectiveCapState: CapState = useMemo(() => {
    if (isThisDeviceGateway || !remoteSnapshot) {
      return automationFeedbackState?.capState || 'OPEN';
    }
    return remoteSnapshot.capState || 'OPEN';
  }, [isThisDeviceGateway, remoteSnapshot, automationFeedbackState]);

  const effectiveSystemState: string = useMemo(() => {
    if (isThisDeviceGateway || !remoteSnapshot) {
      return automationFeedbackState?.systemState || '';
    }
    return remoteSnapshot.systemState || '';
  }, [isThisDeviceGateway, remoteSnapshot, automationFeedbackState]);

  const effectiveMotorStatus: MotorStatus = useMemo(() => {
    if (isThisDeviceGateway || !remoteSnapshot) return motorStatus;
    return remoteSnapshot.motorStatus || 'IDLE';
  }, [isThisDeviceGateway, remoteSnapshot, motorStatus]);

  const effectiveAutomationRunning: boolean = useMemo(() => {
    if (isThisDeviceGateway || !remoteSnapshot) return isAutomationRunning;
    return remoteSnapshot.isMotorRunning || false;
  }, [isThisDeviceGateway, remoteSnapshot, isAutomationRunning]);

  const effectiveLastOperation: LastMotorOperation | null = useMemo(() => {
    if (isThisDeviceGateway || !remoteSnapshot) return lastOperation;
    return remoteSnapshot.lastMotorOperation || null;
  }, [isThisDeviceGateway, remoteSnapshot, lastOperation]);

  const effectiveReadings = isThisDeviceGateway ? readings : (remoteReadings.length > 0 ? remoteReadings : readings);
  const effectiveVolumeHistory = isThisDeviceGateway ? volumeHistory : (remoteVolumeHistory.length > 0 ? remoteVolumeHistory : volumeHistory);
  const effectiveConnectionState: ConnectionState = isThisDeviceGateway
    ? connectionState
    : isGatewayOnline
    ? 'CONNECTED'
    : 'DISCONNECTED';

  // Effective Cap Control Dispatchers
  const handleEffectiveTriggerCapClose = useCallback(async () => {
    if (isThisDeviceGateway) {
      await triggerCapClose();
    } else {
      if (!isGatewayOnline) {
        alert('ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE');
        return;
      }
      if (!isAuthenticated) {
        setIsAuthModalOpen(true);
        return;
      }
      const res = await triggerRemoteCapClose();
      if (!res.success) {
        alert(`Remote command failed: ${res.message}`);
      }
    }
  }, [isThisDeviceGateway, isGatewayOnline, isAuthenticated, triggerCapClose, triggerRemoteCapClose]);

  const handleEffectiveTriggerCapOpen = useCallback(async () => {
    if (isThisDeviceGateway) {
      await triggerCapOpen();
    } else {
      if (!isGatewayOnline) {
        alert('ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE');
        return;
      }
      if (!isAuthenticated) {
        setIsAuthModalOpen(true);
        return;
      }
      const res = await triggerRemoteCapOpen();
      if (!res.success) {
        alert(`Remote command failed: ${res.message}`);
      }
    }
  }, [isThisDeviceGateway, isGatewayOnline, isAuthenticated, triggerCapOpen, triggerRemoteCapOpen]);

  const handleEffectiveEmergencyStop = useCallback(async () => {
    if (isThisDeviceGateway) {
      await emergencyStop();
    } else {
      if (!isGatewayOnline) return;
      await triggerRemoteEmergencyStop();
    }
  }, [isThisDeviceGateway, isGatewayOnline, emergencyStop, triggerRemoteEmergencyStop]);

  // Synchronize stability threshold with settings
  useEffect(() => {
    setStabilityThreshold(settings.stabilityThreshold);
  }, [settings.stabilityThreshold, setStabilityThreshold]);

  const handleBaudRateChange = (baud: number) => {
    const updated = { ...settings, baudRate: baud };
    setSettings(updated);
    StorageService.saveSettings(updated);
  };

  const handleSaveSettings = (newSettings: DeviceSettings) => {
    setSettings(newSettings);
    StorageService.saveSettings(newSettings);
  };

  const handleImportFullBackup = (
    newPoints: typeof points,
    newProfiles: typeof profiles,
    newSettings?: DeviceSettings
  ) => {
    replaceAllPoints(newPoints);
    replaceAllProfiles(newProfiles);
    if (newSettings) {
      setSettings(newSettings);
      StorageService.saveSettings(newSettings);
    }
  };

  const handleSyncWithESP32 = useCallback(async () => {
    await sendCommand('GET_DATA');
  }, [sendCommand]);

  const handleManualRotate = async (
    action: 'OPEN' | 'CLOSE',
    degrees: number,
    direction: MotorDirection
  ) => {
    await testRotation(action, degrees, direction);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        connectionState={connectionState}
        systemReady={systemReady}
        motorStatus={effectiveMotorStatus}
        baudRate={settings.baudRate}
        onBaudRateChange={handleBaudRateChange}
        onConnect={() => connect(settings.baudRate)}
        onDisconnect={disconnect}
        onEmergencyStop={handleEffectiveEmergencyStop}
        onToggleConsole={() => setIsConsoleOpen(!isConsoleOpen)}
        isConsoleOpen={isConsoleOpen}
        isWebSerialSupported={isWebSerialSupported}
        errorMessage={errorMessage}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMobileMenuOpen={isMobileMenuOpen}
        syncStatus={syncStatus}
        isThisDeviceGateway={isThisDeviceGateway}
        isGatewayOnline={isGatewayOnline}
        isAuthenticated={isAuthenticated}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Main Container: Sidebar + Page View */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          activePage={activePage}
          onSelectPage={(page) => {
            setActivePage(page);
            setIsMobileMenuOpen(false);
          }}
          calibrationPointCount={points.filter((p) => p.status === 'CONFIRMED').length}
          motorProfileCount={profiles.length}
          mode={mode}
          isMotorRunning={effectiveMotorStatus === 'RUNNING'}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 bg-[#070b14]/50 w-full min-w-0">
          {activePage === 'driver-dashboard' && (
            <DriverDashboardPage
              volumeInterpolation={effectiveVolumeInterpolation}
              stats={effectiveStats}
              calibrationPoints={points}
              capState={effectiveCapState}
              systemState={effectiveSystemState}
              isAutomationRunning={effectiveAutomationRunning}
              motorStatus={effectiveMotorStatus}
              connectionState={effectiveConnectionState}
              isThisDeviceGateway={isThisDeviceGateway}
              isGatewayOnline={isGatewayOnline}
              gatewayMessage={gatewayMessage}
              isAuthenticated={isAuthenticated}
              onRequestAuth={() => setIsAuthModalOpen(true)}
              onTriggerCapClose={handleEffectiveTriggerCapClose}
              onTriggerCapOpen={handleEffectiveTriggerCapOpen}
            />
          )}

          {activePage === 'dashboard' && (
            <DashboardPage
              connectionState={effectiveConnectionState}
              errorMessage={errorMessage}
              onRetryConnect={() => connect(settings.baudRate)}
              hx711Status={hx711Status}
              motorStatus={effectiveMotorStatus}
              stats={effectiveStats}
              volumeInterpolation={effectiveVolumeInterpolation}
              volumeHistory={effectiveVolumeHistory}
              calibrationPoints={points}
              motorProfiles={profiles}
              lastOperation={effectiveLastOperation}
              mode={mode}
              readings={effectiveReadings}
              onTriggerCapClose={handleEffectiveTriggerCapClose}
              onTriggerCapOpen={handleEffectiveTriggerCapOpen}
              isAutomationRunning={effectiveAutomationRunning}
              automationFeedbackState={
                isThisDeviceGateway
                  ? automationFeedbackState
                  : {
                      ...automationFeedbackState,
                      capState: effectiveCapState,
                      systemState: (effectiveSystemState as any) || 'CAP OPEN — AUTOMATION DISABLED',
                    }
              }
              onModeChange={setMode}
              onEmergencyStop={handleEffectiveEmergencyStop}
              isThisDeviceGateway={isThisDeviceGateway}
              isGatewayOnline={isGatewayOnline}
              gatewayMessage={gatewayMessage}
              isAuthenticated={isAuthenticated}
              onRequestAuth={() => setIsAuthModalOpen(true)}
            />
          )}

          {activePage === 'live-monitoring' && (
            <LiveMonitoringPage
              stats={effectiveStats}
              readings={effectiveReadings}
              volumeInterpolation={effectiveVolumeInterpolation}
              stabilityThreshold={stabilityThreshold}
              onThresholdChange={(th) => {
                setStabilityThreshold(th);
                handleSaveSettings({ ...settings, stabilityThreshold: th });
              }}
              onClearReadings={clearReadings}
              connectionState={effectiveConnectionState}
              calibrationPoints={points}
            />
          )}

          {activePage === 'calibration' && (
            <CalibrationPage
              connectionState={connectionState}
              stats={stats}
              recentReadings={readings}
              points={points}
              isCalibrating={isCalibrating}
              calibrationError={calibrationError}
              lastSavedMessage={lastSavedMessage}
              latestCalResult={latestCalResult}
              calProcessingStatus={calProcessingStatus}
              debugLogs={debugLogs}
              onClearDebugLogs={clearDebugLogs}
              stabilityThreshold={stabilityThreshold}
              onStartCalibration={(vol) => startCalibrationCapture(vol)}
              onCancelCalibration={cancelCalibration}
              onDeletePoint={deletePoint}
              onUpdatePoint={updatePoint}
              currentEstimatedVolume={volumeInterpolation.volumeMl}
            />
          )}

          {activePage === 'calibration-history' && (
            <CalibrationHistoryPage points={points} />
          )}

          {activePage === 'motor-config' && (
            <MotorConfigPage
              profiles={profiles}
              onSaveProfile={saveProfile}
              onDeleteProfile={deleteProfile}
              onTestRotation={testRotation}
              isSaving={isMotorProfileSaving}
              profileMessage={profileMessage}
              profileError={profileError}
              isMotorRunning={motorStatus === 'RUNNING'}
            />
          )}

          {activePage === 'motor-testing' && (
            <MotorTestingPage
              motorStatus={motorStatus}
              isMotorRunning={motorStatus === 'RUNNING'}
              onRotate={handleManualRotate}
              onEmergencyStop={emergencyStop}
              connectionState={connectionState}
            />
          )}

          {activePage === 'automation' && (
            <AutomationPage
              mode={mode}
              onModeChange={setMode}
              feedbackState={
                isThisDeviceGateway
                  ? automationFeedbackState
                  : {
                      ...automationFeedbackState,
                      capState: effectiveCapState,
                      systemState: (effectiveSystemState as any) || 'CAP OPEN — AUTOMATION DISABLED',
                    }
              }
              onTriggerCapClose={handleEffectiveTriggerCapClose}
              onTriggerCapOpen={handleEffectiveTriggerCapOpen}
              onEmergencyStop={handleEffectiveEmergencyStop}
              onZeroPosition={zeroMotorPosition}
              onUpdateConfig={updateAutomationConfig}
              events={automationHistory}
              onClearHistory={clearAutomationHistory}
              calibrationPoints={points}
              motorProfiles={profiles}
              connectionState={effectiveConnectionState}
            />
          )}

          {activePage === 'device-settings' && (
            <DeviceSettingsPage
              settings={settings}
              onSaveSettings={handleSaveSettings}
              hx711Status={hx711Status}
            />
          )}

          {activePage === 'data-backup' && (
            <DataBackupPage
              calibrationPoints={points}
              motorProfiles={profiles}
              settings={settings}
              automationHistory={automationHistory}
              connectionState={connectionState}
              onImportFullBackup={handleImportFullBackup}
              onSyncWithESP32={handleSyncWithESP32}
            />
          )}
        </main>
      </div>

      {/* Real-time Serial Terminal Console */}
      <SerialConsole
        isOpen={isConsoleOpen}
        onClose={() => setIsConsoleOpen(false)}
        messages={messages}
        onSendCommand={sendCommand}
        isConnected={connectionState === 'CONNECTED'}
      />

      {/* Cockpit Remote Security PIN Authorization Modal */}
      <RemoteAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        isAuthenticated={isAuthenticated}
        onAuthenticate={async (pin) => {
          const res = await authenticate(pin);
          return { success: res.success, error: res.error };
        }}
        onLogout={logout}
        serverUrl={serverUrl}
        apiUrl={apiUrl}
        onUpdateServerUrl={setServerUrl}
        onCheckHealth={checkServerHealth}
        isGatewayOnline={isGatewayOnline}
        isThisDeviceGateway={isThisDeviceGateway}
        syncStatus={syncStatus}
      />
    </div>
  );
}

export default App;

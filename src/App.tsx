import { useState, useEffect, useCallback } from 'react';
import { useSerial } from './hooks/useSerial';
import { useCalibration } from './hooks/useCalibration';
import { useMotorProfiles } from './hooks/useMotorProfiles';
import { useLoadCell } from './hooks/useLoadCell';
import { useAutomation } from './hooks/useAutomation';
import { StorageService } from './services/storageService';
import { DeviceSettings, MotorDirection } from './types';

// Common Components
import { Header } from './components/common/Header';
import { Sidebar, PageId } from './components/common/Sidebar';
import { SerialConsole } from './components/common/SerialConsole';

// Pages
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
  const [settings, setSettings] = useState<DeviceSettings>(() => StorageService.loadSettings());

  // Hardware Serial Hook
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
    triggerCapClose,
    triggerCapOpen,
    clearHistory: clearAutomationHistory,
  } = useAutomation(readings, points, profiles);

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
        motorStatus={motorStatus}
        baudRate={settings.baudRate}
        onBaudRateChange={handleBaudRateChange}
        onConnect={() => connect(settings.baudRate)}
        onDisconnect={disconnect}
        onEmergencyStop={emergencyStop}
        onToggleConsole={() => setIsConsoleOpen(!isConsoleOpen)}
        isConsoleOpen={isConsoleOpen}
        isWebSerialSupported={isWebSerialSupported}
        errorMessage={errorMessage}
      />

      {/* Main Container: Sidebar + Page View */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activePage={activePage}
          onSelectPage={setActivePage}
          calibrationPointCount={points.filter((p) => p.status === 'CONFIRMED').length}
          motorProfileCount={profiles.length}
          mode={mode}
          isMotorRunning={motorStatus === 'RUNNING'}
        />

        <main className="flex-1 overflow-y-auto p-6 bg-[#070b14]/50">
          {activePage === 'dashboard' && (
            <DashboardPage
              connectionState={connectionState}
              errorMessage={errorMessage}
              onRetryConnect={() => connect(settings.baudRate)}
              hx711Status={hx711Status}
              motorStatus={motorStatus}
              stats={stats}
              volumeInterpolation={volumeInterpolation}
              calibrationPoints={points}
              motorProfiles={profiles}
              lastOperation={lastOperation}
              mode={mode}
              readings={readings}
              onTriggerCapClose={triggerCapClose}
              onTriggerCapOpen={() => triggerCapOpen(90, 'CW')}
              isAutomationRunning={isAutomationRunning}
            />
          )}

          {activePage === 'live-monitoring' && (
            <LiveMonitoringPage
              stats={stats}
              readings={readings}
              volumeInterpolation={volumeInterpolation}
              stabilityThreshold={stabilityThreshold}
              onThresholdChange={(th) => {
                setStabilityThreshold(th);
                handleSaveSettings({ ...settings, stabilityThreshold: th });
              }}
              onClearReadings={clearReadings}
              connectionState={connectionState}
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
              isRunning={isAutomationRunning}
              progress={autoCloseProgress}
              onTriggerCapClose={triggerCapClose}
              onTriggerCapOpen={() => triggerCapOpen(90, 'CW')}
              events={automationHistory}
              onClearHistory={clearAutomationHistory}
              calibrationPoints={points}
              motorProfiles={profiles}
              connectionState={connectionState}
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
    </div>
  );
}

export default App;

import React from 'react';
import {
  Activity,
  Droplets,
  Scale,
  Sliders,
  Cog,
  Cpu,
  Lock,
  Unlock,
  Radio,
  AlertTriangle,
  RefreshCw,
  Usb,
  ShieldAlert,
} from 'lucide-react';
import {
  AutomationFeedbackState,
  CalibrationPoint,
  ConnectionState,
  HX711Status,
  InterpolationResult,
  LastMotorOperation,
  LoadCellStats,
  MotorProfile,
  MotorStatus,
  OperatingMode,
  RawReading,
} from '../types';
import { LiveCard } from '../components/common/LiveCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { RawReadingChart } from '../components/dashboard/RawReadingChart';
import { VolumeChart } from '../components/dashboard/VolumeChart';
import { formatNumber, formatDegrees, formatTimestamp, formatDateTime } from '../utils/formatters';

interface DashboardPageProps {
  connectionState: ConnectionState;
  errorMessage: string | null;
  onRetryConnect: () => Promise<boolean>;
  hx711Status: HX711Status;
  motorStatus: MotorStatus;
  stats: LoadCellStats;
  volumeInterpolation: InterpolationResult;
  volumeHistory?: { timestamp: number; volumeMl: number }[];
  calibrationPoints: CalibrationPoint[];
  motorProfiles: MotorProfile[];
  lastOperation: LastMotorOperation | null;
  mode: OperatingMode;
  readings: RawReading[];
  onTriggerCapClose: () => Promise<void>;
  onTriggerCapOpen: () => Promise<void>;
  isAutomationRunning: boolean;
  automationFeedbackState?: AutomationFeedbackState;
  onModeChange?: (mode: OperatingMode) => void;
  onEmergencyStop?: () => Promise<void>;
  isThisDeviceGateway?: boolean;
  isGatewayOnline?: boolean;
  gatewayMessage?: string;
  isAuthenticated?: boolean;
  onRequestAuth?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  connectionState,
  errorMessage,
  onRetryConnect,
  hx711Status,
  motorStatus,
  stats,
  volumeInterpolation,
  volumeHistory = [],
  calibrationPoints,
  motorProfiles,
  lastOperation,
  mode,
  readings,
  onTriggerCapClose,
  onTriggerCapOpen,
  isAutomationRunning,
  automationFeedbackState,
  onModeChange,
  onEmergencyStop,
  isThisDeviceGateway = true,
  isGatewayOnline = false,
  gatewayMessage,
  isAuthenticated = false,
  onRequestAuth,
}) => {
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const confirmedCalPoints = calibrationPoints.filter((p) => p.status === 'CONFIRMED');
  const isCalibrated = confirmedCalPoints.length >= 2;

  const isCapControlDisabled =
    isProcessing ||
    (!isThisDeviceGateway && !isGatewayOnline) ||
    (isThisDeviceGateway && connectionState !== 'CONNECTED') ||
    isAutomationRunning ||
    motorStatus === 'RUNNING';

  const handleCapCloseClick = async () => {
    if (isCapControlDisabled) return;
    if (!isThisDeviceGateway && !isAuthenticated) {
      if (onRequestAuth) onRequestAuth();
      return;
    }
    setIsProcessing(true);
    try {
      await onTriggerCapClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapOpenClick = async () => {
    if (isCapControlDisabled) return;
    if (!isThisDeviceGateway && !isAuthenticated) {
      if (onRequestAuth) onRequestAuth();
      return;
    }
    setIsProcessing(true);
    try {
      await onTriggerCapOpen();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetryConnect();
    } finally {
      setIsRetrying(false);
    }
  };

  // Find timestamp of the most recent confirmed calibration point
  const lastCalibrationTime = React.useMemo(() => {
    if (confirmedCalPoints.length === 0) return null;
    const timestamps = confirmedCalPoints
      .map((p) => p.timestamp)
      .filter((t) => typeof t === 'number' && t > 0);
    if (timestamps.length === 0) return null;
    return Math.max(...timestamps);
  }, [confirmedCalPoints]);

  return (
    <div className="space-y-6">
      {/* Prominent ESP32 Gateway Offline Status Banner (Requirement 2) */}
      {!isThisDeviceGateway && !isGatewayOnline && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-500/80 shadow-glow-red flex items-center space-x-3 text-rose-200 font-mono text-xs animate-pulse">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="min-w-0">
            <div className="font-extrabold uppercase tracking-wider text-rose-300 text-sm">
              ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE
            </div>
            <div className="text-xs text-rose-300/80 mt-0.5">
              The authoritative Web Serial hardware gateway (Laptop A) is currently disconnected. Live hardware telemetry is paused and remote cap controls are disabled.
            </div>
          </div>
        </div>
      )}

      {/* Prominent Connection Error Banner in Connection Dashboard */}
      {(connectionState === 'ERROR' || errorMessage) && (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/60 shadow-glow-red space-y-3 font-mono text-xs text-rose-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-rose-300 font-bold uppercase tracking-wider text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>ESP32 USB Serial Connection Error</span>
            </div>
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center space-x-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Retrying...' : 'Retry Connection'}</span>
            </button>
          </div>

          <div className="bg-black/40 p-3 rounded-lg border border-rose-900/60 text-rose-200 font-mono text-xs break-all">
            <span className="text-slate-400 select-none mr-2">Error Detail:</span>
            <span className="font-semibold text-rose-300">{errorMessage || 'Serial port connection failed.'}</span>
          </div>

          <div className="text-[11px] text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Troubleshooting Guidance:</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
              <li>Ensure the COM port is not open in another application (e.g., Arduino Serial Monitor, PlatformIO, or another browser tab).</li>
              <li>Unplug and re-plug the USB-C cable to the ESP32-S3 to reset the native USB CDC interface.</li>
              <li>Ensure you have granted permission in the browser port selector prompt.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Top Hardware Diagnostics Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* ESP32 Status */}
        <div
          className={`panel-glass rounded-xl p-4 border transition-all ${
            connectionState === 'ERROR'
              ? 'border-rose-500/50 bg-rose-950/20'
              : 'border-slate-800'
          } flex items-center justify-between`}
        >
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold block">
              ESP32-S3 Hardware
            </span>
            <span className="text-sm font-mono font-bold text-white mt-1 block">
              {connectionState === 'CONNECTED'
                ? 'USB COM Active'
                : connectionState === 'CONNECTING'
                ? 'Opening Port...'
                : connectionState === 'ERROR'
                ? 'Connection Error'
                : 'Disconnected'}
            </span>
            {connectionState === 'ERROR' && (
              <span className="text-[10px] font-mono text-rose-400 mt-0.5 block truncate max-w-[140px]">
                Click Retry above
              </span>
            )}
          </div>
          <StatusBadge status={connectionState} size="sm" />
        </div>

        {/* HX711 Status */}
        <div className="panel-glass rounded-xl p-4 border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold block">
              HX711 24-Bit ADC
            </span>
            <span className="text-sm font-mono font-bold text-white mt-1 block">
              {hx711Status === 'OK' ? 'GPIO 16/17 Sync' : 'Offline'}
            </span>
          </div>
          <StatusBadge status={hx711Status} size="sm" />
        </div>

        {/* Motor Driver Status */}
        <div className="panel-glass rounded-xl p-4 border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold block">
              DRV8825 Stepper
            </span>
            <span className="text-sm font-mono font-bold text-white mt-1 block">
              {motorStatus === 'RUNNING' ? 'Coils Energized' : 'Driver Idle'}
            </span>
          </div>
          <StatusBadge status={motorStatus} size="sm" />
        </div>

        {/* Operating Mode */}
        <div className="panel-glass rounded-xl p-4 border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold block">
              System Control Mode
            </span>
            <span className="text-sm font-mono font-bold text-cyan-400 mt-1 block">
              {mode}
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded">
            {mode === 'AUTOMATIC' ? 'AUTO-LOOP' : 'MANUAL'}
          </span>
        </div>
      </div>

      {/* Active Automatic Mode Continuous Feedback Control Ribbon */}
      {automationFeedbackState && (
        <div className="panel-glass rounded-xl p-4 border-cyan-500/50 bg-[#070e1c] font-mono text-xs space-y-3 shadow-glow-cyan animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-900/60 pb-2.5">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-3 w-3">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    automationFeedbackState.capState === 'CLOSED' ? 'bg-cyan-400' : 'bg-slate-500'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    automationFeedbackState.capState === 'CLOSED' ? 'bg-cyan-500' : 'bg-slate-400'
                  }`}
                />
              </span>
              <span className="font-bold uppercase tracking-wider text-white text-xs">
                Automatic Motor Control System
              </span>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  automationFeedbackState.systemState === 'CAP CLOSED — AUTOMATION ACTIVE'
                    ? 'bg-cyan-950/90 border-cyan-500 text-cyan-300'
                    : automationFeedbackState.systemState === 'AUTOMATIC MOTOR ADJUSTING'
                    ? 'bg-amber-950/90 border-amber-500 text-amber-300'
                    : automationFeedbackState.systemState === 'LIQUID LEVEL CHANGED'
                    ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                    : automationFeedbackState.systemState === 'MOTOR STABLE'
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                    : automationFeedbackState.systemState === 'MONITORING LIQUID LEVEL'
                    ? 'bg-sky-950/80 border-sky-500 text-sky-300'
                    : automationFeedbackState.systemState === 'SENSOR ERROR'
                    ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                {automationFeedbackState.systemState ||
                  (automationFeedbackState.capState === 'CLOSED'
                    ? 'CAP CLOSED — AUTOMATION ACTIVE'
                    : 'CAP OPEN — AUTOMATION DISABLED')}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onTriggerCapClose}
                disabled={connectionState !== 'CONNECTED' || isAutomationRunning || motorStatus === 'RUNNING'}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs tracking-wider transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  automationFeedbackState.capState === 'CLOSED'
                    ? 'bg-cyan-600 text-slate-950 shadow-glow-cyan'
                    : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-800/60'
                }`}
                title="Close cap and enable automatic adjustments"
              >
                <Lock className="w-3.5 h-3.5 fill-current" />
                <span>CAP CLOSE</span>
              </button>

              <button
                type="button"
                onClick={onTriggerCapOpen}
                disabled={connectionState !== 'CONNECTED' || isAutomationRunning || motorStatus === 'RUNNING'}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs tracking-wider transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  automationFeedbackState.capState === 'OPEN'
                    ? 'bg-sky-600 text-white shadow-glow-blue'
                    : 'bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-800/60'
                }`}
                title="Open cap and disable automatic adjustments"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>CAP OPEN</span>
              </button>

              {onEmergencyStop && (
                <button
                  type="button"
                  onClick={onEmergencyStop}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-wider shadow-sm transition-all"
                >
                  STOP
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center">
            <div className="bg-[#050a14] p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Live Volume</span>
              <span className="text-emerald-400 font-bold text-sm">
                {automationFeedbackState.calculatedVolumeMl !== null
                  ? `${formatNumber(automationFeedbackState.calculatedVolumeMl, 1)} ml`
                  : '—'}
              </span>
            </div>

            <div className="bg-[#050a14] p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Current Motor Pos</span>
              <span className="text-white font-bold text-sm">
                {formatDegrees(automationFeedbackState.currentMotorPosition)}
              </span>
            </div>

            <div className="bg-[#050a14] p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Target Motor Pos</span>
              <span className="text-sky-300 font-bold text-sm">
                {formatDegrees(automationFeedbackState.targetMotorPosition)}
              </span>
            </div>

            <div className="bg-[#050a14] p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Required Δ</span>
              <span
                className={`font-bold text-sm ${
                  Math.abs(automationFeedbackState.requiredAdjustment) < automationFeedbackState.angleDeadband
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {automationFeedbackState.requiredAdjustment > 0
                  ? `+${automationFeedbackState.requiredAdjustment}`
                  : automationFeedbackState.requiredAdjustment}°
              </span>
            </div>

            <div className="bg-[#050a14] p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Motor Direction</span>
              <span className="text-cyan-300 font-bold text-sm">
                {automationFeedbackState.motorDirection}
              </span>
            </div>

            <div className="bg-[#050a14] p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Filtered ADC</span>
              <span className="text-slate-300 font-bold text-sm">
                {formatNumber(automationFeedbackState.filteredRaw)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Current Liquid Volume */}
        <LiveCard
          title="Current Liquid Volume"
          value={
            volumeInterpolation.volumeMl !== null
              ? `${formatNumber(volumeInterpolation.volumeMl, 1)}`
              : '—'
          }
          unit={volumeInterpolation.volumeMl !== null ? 'ml' : ''}
          subtext={volumeInterpolation.statusMessage}
          icon={Droplets}
          variant={
            volumeInterpolation.isOutOfRange
              ? 'red'
              : volumeInterpolation.isCalibrated
              ? 'green'
              : 'amber'
          }
        />

        {/* 2. Current Raw HX711 Reading */}
        <LiveCard
          title="Current Raw HX711"
          value={formatNumber(stats.currentRaw)}
          subtext="Unfiltered live ADC stream"
          icon={Radio}
          variant="cyan"
          badge={<StatusBadge status={stats.stability} size="sm" />}
        />

        {/* 3. Filtered Raw Reading */}
        <LiveCard
          title="Filtered Raw Reading"
          value={formatNumber(stats.filteredRaw !== null ? stats.filteredRaw : stats.average)}
          subtext="Noise-filtered (EMA + 20-Sample Window)"
          icon={Activity}
          variant="blue"
        />

        {/* 4. Reading Stability */}
        <LiveCard
          title="Reading Stability"
          value={stats.stability}
          subtext={
            stats.range !== null
              ? `Spread: ${formatNumber(stats.range)} units (Threshold: ≤ 50)`
              : 'Awaiting sensor readings...'
          }
          icon={Scale}
          variant={stats.stability === 'STABLE' ? 'green' : stats.stability === 'UNSTABLE' ? 'amber' : 'default'}
        />
      </div>

      {/* Secondary Metrics: Calibration Points, Motor Profiles, Last Operation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 5. Calibration Status */}
        <LiveCard
          title="Calibration Status"
          value={isCalibrated ? 'CALIBRATED' : 'UNCALIBRATED'}
          unit={isCalibrated ? `(${confirmedCalPoints.length} pts)` : ''}
          subtext={
            isCalibrated
              ? `${confirmedCalPoints.length} points active in ESP32 NVS`
              : 'Requires at least 2 points to interpolate volume'
          }
          icon={Scale}
          variant={isCalibrated ? 'green' : 'amber'}
        />

        {/* 6. Last Calibration Time */}
        <LiveCard
          title="Last Calibration Time"
          value={lastCalibrationTime ? formatDateTime(lastCalibrationTime) : 'None'}
          subtext={lastCalibrationTime ? 'Latest confirmed NVS point' : 'Calibrate in Load Cell Calibration'}
          icon={Scale}
          variant="cyan"
        />

        {/* 7. Motor Profiles */}
        <LiveCard
          title="Motor Profiles"
          value={motorProfiles.length}
          unit="profiles"
          subtext="Volume-specific dual rotational profiles"
          icon={Sliders}
          variant="blue"
        />

        {/* 8. Last Motor Operation */}
        <LiveCard
          title="Last Motor Operation"
          value={
            lastOperation
              ? `${lastOperation.type} ${formatDegrees(lastOperation.degrees)}`
              : 'None'
          }
          subtext={
            lastOperation
              ? `${lastOperation.direction} · ${formatTimestamp(lastOperation.timestamp)}`
              : 'No motor actions executed'
          }
          icon={Cog}
          variant="default"
        />
      </div>

      {/* Real-time Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Raw Reading Chart */}
        <div className="panel-glass rounded-xl p-5 border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h3 className="text-sm font-mono font-bold uppercase text-white tracking-wider">
                Live Sensor Telemetry (Last 20 Readings)
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                HX711 24-bit raw values with moving average and bounding thresholds
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2.5 py-1 rounded">
              REAL-TIME
            </span>
          </div>
          <RawReadingChart
            readings={readings}
            average={stats.average}
            minimum={stats.minimum}
            maximum={stats.maximum}
          />
        </div>

        {/* Estimated Volume Chart */}
        <div className="panel-glass rounded-xl p-5 border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h3 className="text-sm font-mono font-bold uppercase text-white tracking-wider">
                Interpolated Liquid Volume Trend
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Real-time calculated liquid volume based on confirmed calibration curve
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded">
              VOLUME (ml)
            </span>
          </div>
          <VolumeChart
            history={volumeHistory}
            currentVolume={volumeInterpolation.volumeMl}
            isCalibrated={isCalibrated}
          />
        </div>
      </div>

      {/* 5. Automatic Cap Control System Card (Fulfills Requirements 1, 2, 3, 4, 5, 6) */}
      <div className="panel-glass rounded-xl p-5 border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-cyan-950/80 border border-cyan-800/50 text-cyan-400 shadow-glow-cyan">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-mono font-bold uppercase text-white tracking-wider flex items-center space-x-2">
                <span>Automatic Cap Control System</span>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full border font-mono ${
                    automationFeedbackState?.systemState === 'CAP CLOSED — AUTOMATION ACTIVE'
                      ? 'bg-cyan-950/90 border-cyan-500 text-cyan-300 shadow-glow-cyan'
                      : automationFeedbackState?.systemState === 'AUTOMATIC MOTOR ADJUSTING'
                      ? 'bg-amber-950/90 border-amber-500 text-amber-300 animate-pulse'
                      : automationFeedbackState?.systemState === 'LIQUID LEVEL CHANGED'
                      ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                      : automationFeedbackState?.systemState === 'MOTOR STABLE'
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                      : automationFeedbackState?.systemState === 'MONITORING LIQUID LEVEL'
                      ? 'bg-sky-950/80 border-sky-500 text-sky-300'
                      : automationFeedbackState?.systemState === 'SENSOR ERROR'
                      ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {automationFeedbackState?.systemState ||
                    (automationFeedbackState?.capState === 'CLOSED'
                      ? 'CAP CLOSED — AUTOMATION ACTIVE'
                      : 'CAP OPEN — AUTOMATION DISABLED')}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Fresh Load Cell Reading → Calculate Volume → Select Motor Profile → Execute Existing Motor Function
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            {!isThisDeviceGateway && (
              <span
                className={`text-[10px] px-2.5 py-1 rounded-lg border font-mono text-center ${
                  isGatewayOnline
                    ? isAuthenticated
                      ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                      : 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                    : 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                }`}
              >
                {isGatewayOnline
                  ? isAuthenticated
                    ? 'REMOTE AUTH OK'
                    : 'PIN REQUIRED'
                  : 'GATEWAY OFFLINE'}
              </span>
            )}

            <button
              type="button"
              onClick={handleCapCloseClick}
              disabled={isCapControlDisabled}
              className={`px-4 sm:px-5 py-2.5 rounded-xl font-mono text-xs font-extrabold flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                automationFeedbackState?.capState === 'CLOSED'
                  ? 'bg-cyan-600 text-slate-950 shadow-glow-cyan'
                  : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-800/60'
              }`}
              title="Close cap to configured angle and enable continuous automatic adjustments"
            >
              <Lock className="w-4 h-4 fill-current" />
              <span>CAP CLOSE (ENABLE AUTO)</span>
            </button>

            <button
              type="button"
              onClick={handleCapOpenClick}
              disabled={isCapControlDisabled}
              className={`px-4 sm:px-5 py-2.5 rounded-xl font-mono text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                automationFeedbackState?.capState === 'OPEN'
                  ? 'bg-sky-600 text-white shadow-glow-blue'
                  : 'bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-800/60'
              }`}
              title="Open cap to configured angle and disable automatic adjustments"
            >
              <Unlock className="w-4 h-4" />
              <span>CAP OPEN (DISABLE AUTO)</span>
            </button>
          </div>
        </div>

        {/* 6 Required Metric Displays */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
          {/* 1. Current Liquid Volume */}
          <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">1. Liquid Volume</span>
            <span className="text-emerald-400 font-bold text-sm block mt-0.5 truncate">
              {automationFeedbackState?.capControl?.calculatedVolumeMl !== null &&
              automationFeedbackState?.capControl?.calculatedVolumeMl !== undefined
                ? `${formatNumber(automationFeedbackState.capControl.calculatedVolumeMl, 1)} ml`
                : volumeInterpolation.volumeMl !== null
                ? `${formatNumber(volumeInterpolation.volumeMl, 1)} ml`
                : '—'}
            </span>
            <span className="text-[9px] text-slate-500 truncate block">
              {volumeInterpolation.isCalibrated ? 'Calibrated Curve' : 'Uncalibrated'}
            </span>
          </div>

          {/* 2. Current Raw Reading */}
          <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">2. Raw Reading</span>
            <span className="text-white font-bold text-sm block mt-0.5 truncate">
              {formatNumber(automationFeedbackState?.capControl?.currentRaw ?? stats.currentRaw)}
            </span>
            <span className="text-[9px] text-cyan-400 font-mono truncate block">
              {stats.stability}
            </span>
          </div>

          {/* 3. Selected Motor Profile */}
          <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">3. Selected Profile</span>
            <span
              className="text-sky-300 font-bold text-xs truncate block mt-0.5"
              title={automationFeedbackState?.capControl?.selectedProfile || 'Awaiting Action'}
            >
              {automationFeedbackState?.capControl?.selectedProfile ||
                (motorProfiles.length > 0 ? `${motorProfiles.length} Profiles Saved` : 'None Configured')}
            </span>
            <span className="text-[9px] text-slate-500 truncate block">
              {automationFeedbackState?.capControl?.isInterpolated ? 'Interpolated' : 'Saved Profile'}
            </span>
          </div>

          {/* 4. Selected Rotation Angle */}
          <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">4. Rotation Angle</span>
            <span className="text-cyan-300 font-bold text-sm block mt-0.5 truncate">
              {automationFeedbackState?.capControl?.selectedDegrees !== null &&
              automationFeedbackState?.capControl?.selectedDegrees !== undefined
                ? formatDegrees(automationFeedbackState.capControl.selectedDegrees)
                : '—'}
            </span>
            <span className="text-[9px] text-slate-500 truncate block">
              Configured Setting
            </span>
          </div>

          {/* 5. Selected Direction */}
          <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">5. Direction</span>
            <span className="text-white font-bold text-sm block mt-0.5 truncate">
              {automationFeedbackState?.capControl?.selectedDirection ? (
                <span className="flex items-center space-x-1">
                  <span>{automationFeedbackState.capControl.selectedDirection}</span>
                  <span className="text-[10px] text-slate-400">
                    ({automationFeedbackState.capControl.selectedDirection === 'CW' ? 'Clockwise' : 'Anticlockwise'})
                  </span>
                </span>
              ) : (
                '—'
              )}
            </span>
            <span className="text-[9px] text-slate-500 truncate block">
              Profile Direction
            </span>
          </div>

          {/* 6. Motor Operation Status */}
          <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">6. Motor Status</span>
            <span
              className={`font-bold text-xs block mt-0.5 truncate ${
                isAutomationRunning || motorStatus === 'RUNNING'
                  ? 'text-amber-400 animate-pulse'
                  : automationFeedbackState?.capControl?.stage === 'ERROR'
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}
            >
              {isAutomationRunning || motorStatus === 'RUNNING'
                ? 'STEPPING MOTOR'
                : automationFeedbackState?.capControl?.stage === 'ERROR'
                ? 'ERROR'
                : automationFeedbackState?.capControl?.stage === 'COMPLETED'
                ? 'COMPLETED'
                : 'IDLE'}
            </span>
            <span className="text-[9px] text-slate-500 truncate block">
              DRV8825 State
            </span>
          </div>
        </div>

        {/* Operational Error Banner if any */}
        {automationFeedbackState?.capControl?.errorMessage && (
          <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2 font-mono">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Cap Control Error: {automationFeedbackState.capControl.errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};

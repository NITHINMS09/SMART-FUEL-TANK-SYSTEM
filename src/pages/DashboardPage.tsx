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
}) => {
  const [isRetrying, setIsRetrying] = React.useState(false);
  const confirmedCalPoints = calibrationPoints.filter((p) => p.status === 'CONFIRMED');
  const isCalibrated = confirmedCalPoints.length >= 2;

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      {mode === 'AUTOMATIC' && automationFeedbackState && (
        <div className="panel-glass rounded-xl p-4 border-cyan-500/50 bg-[#070e1c] font-mono text-xs space-y-3 shadow-glow-cyan animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-900/60 pb-2.5">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
              <span className="font-bold uppercase tracking-wider text-white text-xs">
                Automatic Mode Active: Continuous Closed-Loop Feedback
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  automationFeedbackState.status === 'ADJUSTING'
                    ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                    : automationFeedbackState.status === 'STABLE'
                    ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                    : automationFeedbackState.status === 'UNSTABLE'
                    ? 'bg-amber-950/60 border-amber-500 text-amber-300'
                    : 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                }`}
              >
                {automationFeedbackState.status}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {onModeChange && (
                <button
                  type="button"
                  onClick={() => onModeChange('MANUAL')}
                  className="px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold transition-all"
                >
                  Switch to Manual
                </button>
              )}
              {onEmergencyStop && (
                <button
                  type="button"
                  onClick={onEmergencyStop}
                  className="px-3.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-wider shadow-sm transition-all"
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

      {/* Active Automatic Mode Continuous Feedback Control Ribbon */}
      {mode === 'AUTOMATIC' && automationFeedbackState && (
        <div className="panel-glass rounded-xl p-4 border-cyan-500/50 bg-[#070e1c] font-mono text-xs space-y-3 shadow-glow-cyan animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-900/60 pb-2.5">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
              <span className="font-bold uppercase tracking-wider text-white text-xs">
                Automatic Mode Active: Continuous Closed-Loop Feedback
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  automationFeedbackState.status === 'ADJUSTING'
                    ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                    : automationFeedbackState.status === 'STABLE'
                    ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                    : automationFeedbackState.status === 'UNSTABLE'
                    ? 'bg-amber-950/60 border-amber-500 text-amber-300'
                    : 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                }`}
              >
                {automationFeedbackState.status}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {onModeChange && (
                <button
                  type="button"
                  onClick={() => onModeChange('MANUAL')}
                  className="px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold transition-all"
                >
                  Switch to Manual
                </button>
              )}
              {onEmergencyStop && (
                <button
                  type="button"
                  onClick={onEmergencyStop}
                  className="px-3.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-wider shadow-sm transition-all"
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

      {/* Fast Action Quick-Bar */}
      <div className="panel-glass rounded-xl p-5 border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-white tracking-wider">
              Quick Automation Controls
            </h4>
            <p className="text-[11px] font-mono text-slate-400">
              Trigger instant automated cycle or manual jog without switching pages
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onTriggerCapOpen}
            disabled={connectionState !== 'CONNECTED' || isAutomationRunning}
            className="px-4 py-2 rounded-lg bg-sky-950/70 hover:bg-sky-900 border border-sky-800/60 text-sky-300 font-mono text-xs font-bold flex items-center space-x-2 transition-all disabled:opacity-40"
          >
            <Unlock className="w-4 h-4" />
            <span>Cap Open</span>
          </button>

          <button
            onClick={onTriggerCapClose}
            disabled={connectionState !== 'CONNECTED' || isAutomationRunning}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold flex items-center space-x-2 shadow-glow-cyan transition-all disabled:opacity-40"
          >
            <Lock className="w-4 h-4" />
            <span>Cap Closed ({mode})</span>
          </button>
        </div>
      </div>

      {/* Active Automatic Mode Continuous Feedback Control Ribbon */}
      {mode === 'AUTOMATIC' && automationFeedbackState && (
        <div className="panel-glass rounded-xl p-4 border-cyan-500/50 bg-[#070e1c] font-mono text-xs space-y-3 shadow-glow-cyan animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-900/60 pb-2.5">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
              <span className="font-bold uppercase tracking-wider text-white text-xs">
                Automatic Mode Active: Continuous Closed-Loop Feedback
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  automationFeedbackState.status === 'ADJUSTING'
                    ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                    : automationFeedbackState.status === 'STABLE'
                    ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                    : automationFeedbackState.status === 'UNSTABLE'
                    ? 'bg-amber-950/60 border-amber-500 text-amber-300'
                    : 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                }`}
              >
                {automationFeedbackState.status}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {onModeChange && (
                <button
                  type="button"
                  onClick={() => onModeChange('MANUAL')}
                  className="px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold transition-all"
                >
                  Switch to Manual
                </button>
              )}
              {onEmergencyStop && (
                <button
                  type="button"
                  onClick={onEmergencyStop}
                  className="px-3.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-wider shadow-sm transition-all"
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
    </div>
  );
};

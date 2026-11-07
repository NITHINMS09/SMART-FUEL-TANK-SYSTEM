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
import { formatNumber, formatDegrees, formatTimestamp } from '../utils/formatters';

interface DashboardPageProps {
  connectionState: ConnectionState;
  errorMessage: string | null;
  onRetryConnect: () => Promise<boolean>;
  hx711Status: HX711Status;
  motorStatus: MotorStatus;
  stats: LoadCellStats;
  volumeInterpolation: InterpolationResult;
  calibrationPoints: CalibrationPoint[];
  motorProfiles: MotorProfile[];
  lastOperation: LastMotorOperation | null;
  mode: OperatingMode;
  readings: RawReading[];
  onTriggerCapClose: () => Promise<void>;
  onTriggerCapOpen: () => Promise<void>;
  isAutomationRunning: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  connectionState,
  errorMessage,
  onRetryConnect,
  hx711Status,
  motorStatus,
  stats,
  volumeInterpolation,
  calibrationPoints,
  motorProfiles,
  lastOperation,
  mode,
  readings,
  onTriggerCapClose,
  onTriggerCapOpen,
  isAutomationRunning,
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

  const volumeHistory = React.useMemo(() => {
    if (!volumeInterpolation.volumeMl) return [];
    return [
      {
        timestamp: Date.now(),
        volumeMl: volumeInterpolation.volumeMl,
      },
    ];
  }, [volumeInterpolation.volumeMl]);

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

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Estimated Volume */}
        <LiveCard
          title="Current Estimated Volume"
          value={
            volumeInterpolation.volumeMl !== null
              ? formatNumber(volumeInterpolation.volumeMl, 1)
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

        {/* Current Raw Reading */}
        <LiveCard
          title="Current Raw HX711"
          value={formatNumber(stats.currentRaw)}
          subtext={`Stability: ${stats.stability}`}
          icon={Radio}
          variant="cyan"
          badge={<StatusBadge status={stats.stability} size="sm" />}
        />

        {/* Average Raw Reading */}
        <LiveCard
          title="Average Raw (20 Samples)"
          value={formatNumber(stats.average)}
          subtext={`Min: ${formatNumber(stats.minimum)} | Max: ${formatNumber(stats.maximum)}`}
          icon={Activity}
          variant="blue"
        />

        {/* Raw Reading Range */}
        <LiveCard
          title="Raw Spread (Range)"
          value={formatNumber(stats.range)}
          unit="units"
          subtext={
            stats.range !== null && stats.range <= 50
              ? 'Stable: Range ≤ 50 units'
              : 'Fluctuating: Range > 50 units'
          }
          icon={Scale}
          variant={stats.range !== null && stats.range <= 50 ? 'green' : 'amber'}
        />
      </div>

      {/* Secondary Metrics: Calibration Points, Motor Profiles, Last Operation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <LiveCard
          title="Calibration Points"
          value={confirmedCalPoints.length}
          unit="/ 30"
          subtext={
            isCalibrated
              ? `${confirmedCalPoints.length} points confirmed in ESP32 NVS`
              : 'Requires at least 2 points to interpolate volume'
          }
          icon={Scale}
          variant="cyan"
        />

        <LiveCard
          title="Motor Profiles"
          value={motorProfiles.length}
          unit="profiles"
          subtext="Volume-specific dual open/close rotational profiles"
          icon={Sliders}
          variant="blue"
        />

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
                Interpolated Water Volume Trend
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
    </div>
  );
};

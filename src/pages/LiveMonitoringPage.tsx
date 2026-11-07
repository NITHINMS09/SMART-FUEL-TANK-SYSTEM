import React, { useState } from 'react';
import {
  Activity,
  Radio,
  Scale,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  Droplets,
  Info,
} from 'lucide-react';
import {
  CalibrationPoint,
  ConnectionState,
  InterpolationResult,
  LoadCellStats,
  RawReading,
} from '../types';
import { LiveCard } from '../components/common/LiveCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { RawReadingChart } from '../components/dashboard/RawReadingChart';
import { formatNumber, formatVolume, formatTimestamp } from '../utils/formatters';

interface LiveMonitoringPageProps {
  stats: LoadCellStats;
  readings: RawReading[];
  volumeInterpolation: InterpolationResult;
  stabilityThreshold: number;
  onThresholdChange: (th: number) => void;
  onClearReadings: () => void;
  connectionState: ConnectionState;
  calibrationPoints: CalibrationPoint[];
}

export const LiveMonitoringPage: React.FC<LiveMonitoringPageProps> = ({
  stats,
  readings,
  volumeInterpolation,
  stabilityThreshold,
  onThresholdChange,
  onClearReadings,
  connectionState,
  calibrationPoints,
}) => {
  const [customThInput, setCustomThInput] = useState(stabilityThreshold.toString());

  const handleThSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customThInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onThresholdChange(parsed);
    }
  };

  const isConnected = connectionState === 'CONNECTED';
  const confirmedCalPoints = calibrationPoints.filter((p) => p.status === 'CONFIRMED');
  const isCalibrated = confirmedCalPoints.length >= 2;

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Telemetry Header */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shadow-glow-cyan">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase text-white tracking-wider flex items-center space-x-2">
              <span>HX711 Live Load Cell Telemetry</span>
            </h2>
            <p className="text-slate-400 text-xs">
              Continuous 24-bit raw strain gauge values via serial stream
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <StatusBadge status={stats.stability} size="lg" />
          <button
            onClick={onClearReadings}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Clear buffer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Current Raw */}
        <LiveCard
          title="Current Raw Reading"
          value={formatNumber(stats.currentRaw)}
          subtext={`Latest Sample (#${stats.sampleCount})`}
          icon={Radio}
          variant="cyan"
        />

        {/* Average Raw */}
        <LiveCard
          title="Average Raw (20-Win)"
          value={formatNumber(stats.average)}
          subtext="Sliding window mean"
          icon={Activity}
          variant="blue"
        />

        {/* Minimum Raw */}
        <LiveCard
          title="Minimum Raw"
          value={formatNumber(stats.minimum)}
          subtext="Lowest sample in window"
          icon={Scale}
          variant="default"
        />

        {/* Maximum Raw */}
        <LiveCard
          title="Maximum Raw"
          value={formatNumber(stats.maximum)}
          subtext="Highest sample in window"
          icon={Scale}
          variant="default"
        />

        {/* Range (Spread) */}
        <LiveCard
          title="Range (Max - Min)"
          value={formatNumber(stats.range)}
          unit="units"
          subtext={`Threshold: ≤ ${stabilityThreshold}`}
          icon={Scale}
          variant={
            stats.range !== null && stats.range <= stabilityThreshold
              ? 'green'
              : 'amber'
          }
        />
      </div>

      {/* Stability Configuration Bar */}
      <div className="panel-glass rounded-xl p-5 border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <div>
            <span className="font-bold uppercase text-white">
              Acceptable Raw Stability Threshold
            </span>
            <p className="text-slate-400 text-[11px]">
              Maximum allowable difference between max and min raw readings across 20 samples to classify as STABLE
            </p>
          </div>
        </div>

        <form onSubmit={handleThSubmit} className="flex items-center space-x-2">
          <input
            type="number"
            min="5"
            max="1000"
            value={customThInput}
            onChange={(e) => setCustomThInput(e.target.value)}
            className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-cyan-300 font-bold focus:border-cyan-500 focus:outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 font-bold"
          >
            Update Threshold
          </button>
        </form>
      </div>

      {/* High-Resolution Live Chart */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase text-white tracking-wider">
              Real-Time Raw Sensor Oscilloscope (Last 20 Readings)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            {readings.length} total samples recorded
          </span>
        </div>

        <RawReadingChart
          readings={readings}
          average={stats.average}
          minimum={stats.minimum}
          maximum={stats.maximum}
          targetCount={20}
        />
      </div>

      {/* Volume Interpretation Card */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-3">
        <div className="flex items-center space-x-2 text-sm font-bold uppercase text-white">
          <Droplets className="w-4 h-4 text-cyan-400" />
          <span>Calculated Liquid Volume Interpretation</span>
        </div>

        {!isCalibrated ? (
          <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-600/50 flex items-start space-x-3 text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">Calibration Data Missing or Incomplete</p>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Never showing fabricated volume. To calculate real water volume, calibrate at least 2 points (e.g. 0 ml tare and 500 ml known reference).
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#070b16] p-4 rounded-lg border border-slate-800">
              <span className="text-slate-500 uppercase text-[10px]">Estimated Volume</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {formatVolume(volumeInterpolation.volumeMl)}
              </p>
            </div>

            <div className="bg-[#070b16] p-4 rounded-lg border border-slate-800 md:col-span-2 space-y-1">
              <span className="text-slate-500 uppercase text-[10px]">Interpolation Status</span>
              <p className="text-slate-200 font-semibold mt-1">
                {volumeInterpolation.statusMessage}
              </p>
              {volumeInterpolation.isOutOfRange && (
                <p className="text-rose-400 text-[11px] font-bold">
                  WARNING: Reading is outside the verified calibration range!
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


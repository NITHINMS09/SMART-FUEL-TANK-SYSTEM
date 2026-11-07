import React, { useState } from 'react';
import { Scale, Play, CheckCircle2, AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { LoadCellStats, RawReading, ConnectionState } from '../../types';
import { formatNumber } from '../../utils/formatters';
import { StatusBadge } from '../common/StatusBadge';

interface CalibrationFormProps {
  connectionState: ConnectionState;
  stats: LoadCellStats;
  recentReadings: RawReading[];
  isCalibrating: boolean;
  calibrationError: string | null;
  lastSavedMessage: string | null;
  stabilityThreshold: number;
  onStartCalibration: (volumeMl: number) => Promise<boolean>;
}

export const CalibrationForm: React.FC<CalibrationFormProps> = ({
  connectionState,
  stats,
  recentReadings,
  isCalibrating,
  calibrationError,
  lastSavedMessage,
  stabilityThreshold,
  onStartCalibration,
}) => {
  const [volumeInput, setVolumeInput] = useState<string>('0');
  const presets = [0, 100, 200, 300, 500, 750, 1000];

  const parsedVolume = parseFloat(volumeInput);
  const isValidVolume = !isNaN(parsedVolume) && parsedVolume >= 0;
  const isConnected = connectionState === 'CONNECTED';
  const hasEnoughSamples = recentReadings.length >= 20;
  const isStable = stats.stability === 'STABLE';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidVolume || !isConnected || isCalibrating) return;
    await onStartCalibration(parsedVolume);
  };

  return (
    <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-mono font-bold uppercase text-white tracking-wider">
              Calibrate Known Reference Point
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Captures 20 live raw samples, verifies reading stability, and registers with ESP32 NVS
            </p>
          </div>
        </div>

        <StatusBadge status={stats.stability} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Volume Input & Presets */}
        <div>
          <label className="block text-xs font-mono uppercase text-slate-400 font-semibold mb-2">
            1. Enter Known Water Volume (ml)
          </label>
          <div className="flex items-center space-x-3">
            <div className="relative flex-1">
              <input
                type="number"
                min="0"
                step="1"
                value={volumeInput}
                onChange={(e) => setVolumeInput(e.target.value)}
                placeholder="e.g. 500"
                disabled={isCalibrating}
                className="w-full bg-[#070b14] border border-slate-700 focus:border-cyan-500 rounded-lg px-4 py-2.5 text-base font-mono font-bold text-cyan-300 placeholder-slate-600 focus:outline-none transition-colors"
              />
              <span className="absolute right-4 top-2.5 text-sm font-mono text-slate-500 font-semibold">
                ml
              </span>
            </div>

            <button
              type="submit"
              disabled={!isConnected || !isValidVolume || !hasEnoughSamples || isCalibrating}
              className="px-6 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-mono font-bold text-xs uppercase tracking-wider flex items-center space-x-2 shadow-glow-cyan transition-all"
            >
              {isCalibrating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Awaiting ESP32...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Capture & Calibrate</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[11px] font-mono text-slate-500 mr-1">Presets:</span>
            {presets.map((ml) => (
              <button
                key={ml}
                type="button"
                onClick={() => setVolumeInput(ml.toString())}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                  volumeInput === ml.toString()
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                    : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {ml} ml
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Live Sensor Window Metrics */}
        <div className="bg-[#070c18] border border-slate-800/80 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 font-semibold">
            <span>Live 20-Sample Sliding Window</span>
            <span className="text-cyan-400">
              Samples: {recentReadings.length >= 20 ? '20 / 20' : `${recentReadings.length} / 20`}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Current Raw</span>
              <p className="text-cyan-300 font-bold text-sm mt-0.5">
                {formatNumber(stats.currentRaw)}
              </p>
            </div>

            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Average Raw</span>
              <p className="text-white font-bold text-sm mt-0.5">
                {formatNumber(stats.average)}
              </p>
            </div>

            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Minimum</span>
              <p className="text-slate-300 text-sm mt-0.5">
                {formatNumber(stats.minimum)}
              </p>
            </div>

            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Maximum</span>
              <p className="text-slate-300 text-sm mt-0.5">
                {formatNumber(stats.maximum)}
              </p>
            </div>

            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Range (Spread)</span>
              <p
                className={`text-sm font-bold mt-0.5 ${
                  stats.range !== null && stats.range <= stabilityThreshold
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {formatNumber(stats.range)}
              </p>
            </div>
          </div>

          {/* Stability Warning / Status */}
          <div className="flex items-center justify-between text-xs font-mono pt-1">
            <div className="flex items-center space-x-2">
              {isStable ? (
                <div className="flex items-center space-x-1.5 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Readings STABLE (Range {stats.range} ≤ {stabilityThreshold})</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    Readings UNSTABLE (Range {stats.range ?? 0} &gt; {stabilityThreshold}). Allow liquid to settle.
                  </span>
                </div>
              )}
            </div>

            <span className="text-slate-500 text-[11px]">
              Protocol: <code className="text-cyan-400">CAL,{isValidVolume ? parsedVolume : '...'}</code>
            </span>
          </div>
        </div>

        {/* Feedback messages */}
        {calibrationError && (
          <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-xs font-mono text-rose-300 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Calibration Error</p>
              <p>{calibrationError}</p>
            </div>
          </div>
        )}

        {lastSavedMessage && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{lastSavedMessage}</span>
          </div>
        )}

        {!isConnected && (
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Connect ESP32-S3 via USB Serial before initiating calibration.</span>
          </div>
        )}
      </form>
    </div>
  );
};

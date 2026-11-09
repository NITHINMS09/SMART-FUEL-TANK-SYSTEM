import React, { useState, useEffect } from 'react';
import { Scale, Play, CheckCircle2, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { LoadCellStats, RawReading, ConnectionState, CalResultData } from '../../types';
import { formatNumber } from '../../utils/formatters';
import { StatusBadge } from '../common/StatusBadge';

interface CalibrationFormProps {
  connectionState: ConnectionState;
  stats: LoadCellStats;
  recentReadings: RawReading[];
  isCalibrating: boolean;
  calibrationError: string | null;
  lastSavedMessage: string | null;
  latestCalResult: CalResultData | null;
  calProcessingStatus: string;
  stabilityThreshold: number;
  onStartCalibration: (volumeMl: number) => Promise<boolean>;
  onCancelCalibration?: () => void;
}

export const CalibrationForm: React.FC<CalibrationFormProps> = ({
  connectionState,
  stats,
  recentReadings,
  isCalibrating,
  calibrationError,
  lastSavedMessage,
  latestCalResult,
  calProcessingStatus,
  stabilityThreshold,
  onStartCalibration,
  onCancelCalibration,
}) => {
  const [volumeInput, setVolumeInput] = useState<string>('0');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const presets = [0, 100, 200, 300, 500, 750, 1000];

  // Track elapsed seconds while calibrating
  useEffect(() => {
    let timer: any;
    if (isCalibrating) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isCalibrating]);

  const parsedVolume = parseFloat(volumeInput);
  const isValidVolume = !isNaN(parsedVolume) && parsedVolume >= 0;
  const isConnected = connectionState === 'CONNECTED';
  const isStable = stats.stability === 'STABLE';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidVolume || !isConnected || isCalibrating) return;
    await onStartCalibration(parsedVolume);
  };

  return (
    <div className="panel-glass rounded-xl p-4 sm:p-6 border-slate-800 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-mono font-bold uppercase text-white tracking-wider">
              Calibrate Known Reference Point
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 font-mono">
              Sends CAL,&lt;ml&gt; to ESP32 to compute 20-sample average, verify stability, and save directly to NVS
            </p>
          </div>
        </div>

        <div className="self-start sm:self-auto">
          <StatusBadge status={stats.stability} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Volume Input & Presets */}
        <div>
          <label className="block text-xs font-mono uppercase text-slate-400 font-semibold mb-2">
            1. Enter Known Water Volume (ml)
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center">
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

            {/* Requirement 1: Click Capture 20 Readings to send CAL,<ml> */}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!isConnected || !isValidVolume || isCalibrating}
                className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-glow-cyan transition-all min-h-[42px]"
              >
                {isCalibrating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>Sampling ({elapsedSeconds}s)...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span>Capture 20 Readings</span>
                  </>
                )}
              </button>

              {/* Cancel sampling button to unlock UI immediately */}
              {isCalibrating && onCancelCalibration && (
                <button
                  type="button"
                  onClick={onCancelCalibration}
                  className="px-3 sm:px-4 py-2.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-sm min-h-[42px]"
                  title="Cancel sampling and unlock interface"
                >
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Cancel</span>
                </button>
              )}
            </div>
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

        {/* Live Hardware Status and Protocol Banner */}
        <div className="px-3.5 py-2 rounded-lg bg-[#070c18] border border-slate-800 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 uppercase text-[10px] font-semibold">Command:</span>
            <code className="text-cyan-400 font-bold">
              CAL,{isValidVolume ? Math.round(parsedVolume) : '...'}
            </code>
          </div>
          <div className="text-slate-400 text-[11px]">
            <span>Active Status: </span>
            <span className="text-cyan-300">{calProcessingStatus}</span>
          </div>
        </div>

        {/* Requirement 7: Latest CAL_RESULT from ESP32 immediately rendered */}
        {latestCalResult && (
          <div className="bg-[#081020] border border-cyan-500/50 rounded-lg p-4 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-cyan-900/50 pb-2">
              <span className="text-xs font-mono font-bold uppercase text-cyan-300 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Firmware CAL_RESULT Response (Verified)</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Volume Reference: <strong className="text-cyan-400">{latestCalResult.volumeMl} ml</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
              <div className="bg-[#0b162c] p-2.5 rounded border border-cyan-900/60">
                <span className="text-slate-400 text-[10px] uppercase">ESP32 20-Sample Average</span>
                <p className="text-white font-bold text-sm mt-0.5">
                  {formatNumber(latestCalResult.averageRaw)}
                </p>
              </div>

              <div className="bg-[#0b162c] p-2.5 rounded border border-cyan-900/60">
                <span className="text-slate-400 text-[10px] uppercase">Minimum Raw</span>
                <p className="text-slate-300 text-sm mt-0.5">
                  {formatNumber(latestCalResult.minimum)}
                </p>
              </div>

              <div className="bg-[#0b162c] p-2.5 rounded border border-cyan-900/60">
                <span className="text-slate-400 text-[10px] uppercase">Maximum Raw</span>
                <p className="text-slate-300 text-sm mt-0.5">
                  {formatNumber(latestCalResult.maximum)}
                </p>
              </div>

              <div className="bg-[#0b162c] p-2.5 rounded border border-cyan-900/60">
                <span className="text-slate-400 text-[10px] uppercase">Raw Spread (Range)</span>
                <p
                  className={`text-sm font-bold mt-0.5 ${
                    latestCalResult.range <= stabilityThreshold
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {formatNumber(latestCalResult.range)} units
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Live Sensor Telemetry Window Summary */}
        <div className="bg-[#070c18] border border-slate-800/80 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 font-semibold">
            <span>Continuous Telemetry Stream</span>
            <span className="text-cyan-400">
              Live Raw: <strong className="text-white">{formatNumber(stats.currentRaw)}</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Sliding Avg</span>
              <p className="text-white font-bold text-sm mt-0.5">
                {formatNumber(stats.average)}
              </p>
            </div>

            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Min / Max</span>
              <p className="text-slate-300 text-sm mt-0.5">
                {formatNumber(stats.minimum)} / {formatNumber(stats.maximum)}
              </p>
            </div>

            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Live Spread</span>
              <p
                className={`text-sm font-bold mt-0.5 ${
                  stats.range !== null && stats.range <= stabilityThreshold
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {formatNumber(stats.range)} units
              </p>
            </div>

            <div className="bg-[#0b1222] p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase">Stream Stability</span>
              <div className="mt-1">
                <StatusBadge status={stats.stability} size="sm" />
              </div>
            </div>
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

import React from 'react';
import {
  Cpu,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  RotateCcw,
  RefreshCw,
  Gauge,
  SlidersHorizontal,
} from 'lucide-react';
import { OperatingMode, CalibrationPoint, MotorProfile, ConnectionState } from '../../types';
import { AutoCloseProgress } from '../../services/automationService';
import { formatVolume, formatDegrees } from '../../utils/formatters';

interface AutomationControlProps {
  mode: OperatingMode;
  onModeChange: (mode: OperatingMode) => void;
  isRunning: boolean;
  progress: AutoCloseProgress;
  onTriggerCapClose: () => Promise<void>;
  onTriggerCapOpen: () => Promise<void>;
  calibrationPoints: CalibrationPoint[];
  motorProfiles: MotorProfile[];
  connectionState: ConnectionState;
}

export const AutomationControl: React.FC<AutomationControlProps> = ({
  mode,
  onModeChange,
  isRunning,
  progress,
  onTriggerCapClose,
  onTriggerCapOpen,
  calibrationPoints,
  motorProfiles,
  connectionState,
}) => {
  const isConnected = connectionState === 'CONNECTED';
  const hasCalibration = calibrationPoints.filter((p) => p.status === 'CONFIRMED').length >= 2;
  const hasProfiles = motorProfiles.length > 0;

  const steps = [
    { id: 'SENDING_CMD', label: '1. Send AUTO_CLOSE' },
    { id: 'COLLECTING_READINGS', label: '2. Collect 20 Readings' },
    { id: 'CALCULATING_VOLUME', label: '3. Interpolate ml Volume' },
    { id: 'SELECTING_PROFILE', label: '4. Select & Interpolate Profile Angle' },
    { id: 'EXECUTING_MOTOR', label: '5. Execute DRV8825 Rotation' },
  ];

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Mode Switcher Banner */}
      <div className="panel-glass rounded-xl p-5 border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/50 text-cyan-400 shadow-glow-cyan">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase text-white tracking-wider flex items-center space-x-2">
              <span>Operating Mode Selection</span>
            </h2>
            <p className="text-slate-400 text-xs">
              {mode === 'AUTOMATIC'
                ? 'Automatic Mode: Intelligent liquid measurement drives variable cap rotation'
                : 'Manual Mode: Direct operator control of cap open and close cycles'}
            </p>
          </div>
        </div>

        {/* Toggle Mode */}
        <div className="flex items-center p-1 bg-[#060a14] border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => onModeChange('MANUAL')}
            className={`px-4 py-2 rounded-md font-bold transition-all ${
              mode === 'MANUAL'
                ? 'bg-slate-800 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            MANUAL MODE
          </button>
          <button
            type="button"
            onClick={() => onModeChange('AUTOMATIC')}
            className={`px-4 py-2 rounded-md font-bold transition-all ${
              mode === 'AUTOMATIC'
                ? 'bg-cyan-600 text-slate-950 shadow-glow-cyan'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            AUTOMATIC MODE
          </button>
        </div>
      </div>

      {/* Main Action Triggers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CAP CLOSED TRIGGER */}
        <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase text-cyan-400 flex items-center space-x-2">
                <Lock className="w-4 h-4" />
                <span>CAP CLOSED Action</span>
              </span>
              <span className="text-[10px] bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 px-2 py-0.5 rounded">
                {mode}
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              {mode === 'AUTOMATIC'
                ? 'Measures current load cell raw reading, converts to ml volume via linear calibration curve, calculates interpolated closing degrees, and seals the cap.'
                : 'Issues manual closing rotation according to default configured profile or setting.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onTriggerCapClose}
            disabled={!isConnected || isRunning || (mode === 'AUTOMATIC' && (!hasCalibration || !hasProfiles))}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 active:scale-95 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-glow-cyan transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Executing Auto-Close Sequence...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Activate CAP CLOSED</span>
              </>
            )}
          </button>
        </div>

        {/* CAP OPEN TRIGGER */}
        <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase text-sky-400 flex items-center space-x-2">
                <Unlock className="w-4 h-4" />
                <span>CAP OPEN Action</span>
              </span>
              <span className="text-[10px] bg-sky-950/80 border border-sky-800/60 text-sky-300 px-2 py-0.5 rounded">
                REVERSIBLE
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Executes the configured open rotation angle (e.g. 90° or 180° CW) to unthread and release the tank cap safely.
            </p>
          </div>

          <button
            type="button"
            onClick={onTriggerCapOpen}
            disabled={!isConnected || isRunning}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 active:scale-95 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-glow-blue transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Operating Stepper...</span>
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4" />
                <span>Activate CAP OPEN</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Prerequisites status for AUTOMATIC mode */}
      {mode === 'AUTOMATIC' && (!hasCalibration || !hasProfiles) && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 space-y-2 text-amber-200">
          <div className="flex items-center space-x-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <span>Prerequisites Incomplete for Automatic Mode</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
            {!hasCalibration && (
              <li>At least 2 confirmed calibration points are required for volume interpolation.</li>
            )}
            {!hasProfiles && (
              <li>At least 1 motor volume profile must be configured in Motor Configuration.</li>
            )}
          </ul>
        </div>
      )}

      {/* Automatic Sequence Progress Panel */}
      {progress.stage !== 'IDLE' && (
        <div className="panel-glass rounded-xl p-5 border-cyan-500/40 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="font-bold uppercase text-white flex items-center space-x-2">
              <RefreshCw className={`w-4 h-4 text-cyan-400 ${isRunning ? 'animate-spin' : ''}`} />
              <span>Automated Sequence Progress</span>
            </span>
            <span className="text-cyan-400 font-bold">{progress.stage}</span>
          </div>

          {/* Stepper Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {steps.map((st, idx) => {
              const isPast =
                (progress.stage === 'COLLECTING_READINGS' && idx === 0) ||
                (progress.stage === 'CALCULATING_VOLUME' && idx <= 1) ||
                (progress.stage === 'SELECTING_PROFILE' && idx <= 2) ||
                (progress.stage === 'EXECUTING_MOTOR' && idx <= 3) ||
                progress.stage === 'COMPLETED';

              const isCurrent = progress.stage === st.id;

              return (
                <div
                  key={st.id}
                  className={`p-2.5 rounded-lg border text-[11px] ${
                    isPast
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : isCurrent
                      ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 animate-pulse'
                      : 'bg-[#090f1e] border-slate-800 text-slate-500'
                  }`}
                >
                  <span>{st.label}</span>
                </div>
              );
            })}
          </div>

          {/* Execution Results */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#070b16] p-3 rounded-lg border border-slate-800">
            <div>
              <span className="text-slate-500 text-[10px] uppercase">Measured Volume</span>
              <p className="text-white font-bold text-sm mt-0.5">
                {formatVolume(progress.measuredVolumeMl)}
              </p>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase">Calculated Angle</span>
              <p className="text-cyan-400 font-bold text-sm mt-0.5">
                {formatDegrees(progress.targetDegrees)}
              </p>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase">Direction</span>
              <p className="text-cyan-400 font-bold text-sm mt-0.5">
                {progress.targetDirection || '—'}
              </p>
            </div>
          </div>

          {progress.errorMessage && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 rounded-lg">
              {progress.errorMessage}
            </div>
          )}
        </div>
      )}

      {/* Hardware sensor upgrade note */}
      <div className="p-4 rounded-xl bg-[#090e1b] border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
        <span className="text-slate-300 font-bold flex items-center space-x-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
          <span>Hardware Architecture & Future Sensor Expansion Note</span>
        </span>
        <p className="leading-relaxed">
          The current control center executes website-issued OPEN and CLOSED serial operations calibrated against liquid weight. The state machine and firmware protocol are architected to seamlessly interface with an upcoming physical magnetic reed-switch or optical endstop sensor without breaking API compatibility.
        </p>
      </div>
    </div>
  );
};

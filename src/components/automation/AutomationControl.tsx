import React, { useState } from 'react';
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
  Activity,
  Droplets,
  Radio,
  Scale,
  ShieldAlert,
  Zap,
  HelpCircle,
  Settings2,
} from 'lucide-react';
import {
  OperatingMode,
  CalibrationPoint,
  MotorProfile,
  ConnectionState,
  AutomationFeedbackState,
  AutomationStatus,
} from '../../types';
import { AutoCloseProgress } from '../../services/automationService';
import { formatVolume, formatDegrees, formatNumber, formatTimestamp } from '../../utils/formatters';

interface AutomationControlProps {
  mode: OperatingMode;
  onModeChange: (mode: OperatingMode) => void;
  feedbackState: AutomationFeedbackState;
  onTriggerCapClose: () => Promise<void>;
  onTriggerCapOpen: () => Promise<void>;
  onEmergencyStop: () => Promise<void>;
  onZeroPosition: () => Promise<void>;
  onUpdateConfig: (updates: Partial<any>) => void;
  calibrationPoints: CalibrationPoint[];
  motorProfiles: MotorProfile[];
  connectionState: ConnectionState;
}

export const AutomationControl: React.FC<AutomationControlProps> = ({
  mode,
  onModeChange,
  feedbackState,
  onTriggerCapClose,
  onTriggerCapOpen,
  onEmergencyStop,
  onZeroPosition,
  onUpdateConfig,
  calibrationPoints,
  motorProfiles,
  connectionState,
}) => {
  const [showTuning, setShowTuning] = useState(false);
  const isConnected = connectionState === 'CONNECTED';
  const confirmedCalPoints = calibrationPoints.filter((p) => p.status === 'CONFIRMED');
  const hasCalibration = confirmedCalPoints.length >= 2;
  const hasProfiles = motorProfiles.length > 0;

  const {
    status,
    liveRaw,
    filteredRaw,
    calculatedVolumeMl,
    currentMotorPosition,
    targetMotorPosition,
    requiredAdjustment,
    motorDirection,
    lastAdjustmentTime,
    lastAdjustmentDetails,
    angleDeadband,
    volumeDeadband,
    minAdjustmentInterval,
    maxMotorAngle,
    isMotorMoving,
    stability,
    errorMessage,
    capState = 'OPEN',
    isAutomationEnabled = false,
    systemState = 'CAP OPEN — AUTOMATION DISABLED',
    selectedProfileName,
    lastCommandedTargetAngle,
  } = feedbackState;

  // Status badge coloring & labels for Requirement 7 exact states
  const getStatusInfo = (sysState: string) => {
    switch (sysState) {
      case 'CAP OPEN — AUTOMATION DISABLED':
        return {
          label: 'CAP OPEN — AUTOMATION DISABLED',
          color: 'text-slate-400 bg-slate-900 border-slate-700',
          dot: 'bg-slate-500',
        };
      case 'CAP CLOSED — AUTOMATION ACTIVE':
        return {
          label: 'CAP CLOSED — AUTOMATION ACTIVE',
          color: 'text-cyan-300 bg-cyan-950/90 border-cyan-500 shadow-glow-cyan',
          dot: 'bg-cyan-400 animate-pulse',
        };
      case 'MONITORING LIQUID LEVEL':
        return {
          label: 'MONITORING LIQUID LEVEL',
          color: 'text-sky-300 bg-sky-950/80 border-sky-500',
          dot: 'bg-sky-400 animate-pulse',
        };
      case 'LIQUID LEVEL CHANGED':
        return {
          label: 'LIQUID LEVEL CHANGED',
          color: 'text-amber-300 bg-amber-950/90 border-amber-500 animate-pulse',
          dot: 'bg-amber-400 animate-ping',
        };
      case 'AUTOMATIC MOTOR ADJUSTING':
        return {
          label: 'AUTOMATIC MOTOR ADJUSTING',
          color: 'text-amber-400 bg-amber-950/90 border-amber-600',
          dot: 'bg-amber-400 animate-spin',
        };
      case 'MOTOR STABLE':
        return {
          label: 'MOTOR STABLE',
          color: 'text-emerald-400 bg-emerald-950/80 border-emerald-600',
          dot: 'bg-emerald-400',
        };
      case 'SENSOR ERROR':
      default:
        return {
          label: 'SENSOR ERROR',
          color: 'text-rose-400 bg-rose-950/80 border-rose-600',
          dot: 'bg-rose-400',
        };
    }
  };

  const statusInfo = getStatusInfo(systemState);

  // Calculate SVG circular dial parameters for 0° to 360° display
  const dialRadius = 54;
  const dialCircumference = 2 * Math.PI * dialRadius;
  const currentProgressPercent = Math.min(100, Math.max(0, (currentMotorPosition / maxMotorAngle) * 100));
  const targetProgressPercent = Math.min(100, Math.max(0, (targetMotorPosition / maxMotorAngle) * 100));
  const strokeCurrent = (currentProgressPercent / 100) * dialCircumference;

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* 1. Cap State & Automatic Mode Master Header */}
      <div className="panel-glass rounded-xl p-5 border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div
            className={`p-2.5 rounded-lg border transition-all ${
              isAutomationEnabled
                ? 'bg-cyan-950/90 border-cyan-500 text-cyan-300 shadow-glow-cyan'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            {isAutomationEnabled ? (
              <Lock className="w-5 h-5 animate-pulse text-cyan-400" />
            ) : (
              <Unlock className="w-5 h-5 text-slate-400" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold uppercase text-white tracking-wider">
                Automatic Cap Control & Motor Automation
              </h2>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center space-x-1.5 ${statusInfo.color}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                <span>{statusInfo.label}</span>
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              {isAutomationEnabled
                ? 'CAP CLOSED: Continuous automatic motor adjustments are ACTIVE based on live load-cell readings.'
                : 'CAP OPEN: Automatic motor adjustments are DISABLED. Motor will NEVER rotate automatically while cap is open.'}
            </p>
          </div>
        </div>

        {/* Primary Cap Action Controls */}
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={onTriggerCapClose}
            disabled={!isConnected || isMotorMoving}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              capState === 'CLOSED'
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
            onClick={onTriggerCapOpen}
            disabled={!isConnected || isMotorMoving}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              capState === 'OPEN'
                ? 'bg-sky-600 text-white shadow-glow-blue'
                : 'bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-800/60'
            }`}
            title="Open cap to configured angle and disable automatic adjustments"
          >
            <Unlock className="w-4 h-4" />
            <span>CAP OPEN (DISABLE AUTO)</span>
          </button>

          {/* Zero Position Button */}
          <button
            type="button"
            onClick={onZeroPosition}
            disabled={!isConnected || isMotorMoving}
            title="Zero motor angular reference position (set current angle as 0°)"
            className="px-3 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold transition-all disabled:opacity-40"
          >
            Zero 0°
          </button>

          {/* Emergency Stop Button */}
          <button
            type="button"
            onClick={onEmergencyStop}
            className="px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold tracking-wider flex items-center space-x-1.5 shadow-glow-red transition-all"
            title="Immediately stop motor movement and de-energize coils"
          >
            <ShieldAlert className="w-4 h-4 fill-current" />
            <span>STOP</span>
          </button>
        </div>
      </div>

      {/* 2. Closed-Loop Feedback Control Pipeline Visualizer */}
      <div className="panel-glass rounded-xl p-5 border-slate-800 space-y-3 shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <span className="text-xs font-bold uppercase text-white flex items-center space-x-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>Live Feedback Control Loop Pipeline</span>
          </span>
          <span className="text-[11px] text-slate-400">
            {mode === 'AUTOMATIC' ? (
              <span className="text-cyan-400 font-bold flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping mr-1" />
                ACTIVE AUTONOMOUS CONTROL
              </span>
            ) : (
              <span className="text-slate-500">LOOP SUSPENDED (MANUAL MODE)</span>
            )}
          </span>
        </div>

        {/* Pipeline Nodes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-[11px]">
          {/* Node 1: Load Cell Raw */}
          <div className="bg-[#070d1a] border border-cyan-900/60 p-2.5 rounded-lg space-y-1">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">1. HX711 Raw</span>
            <span className="text-white font-bold text-xs truncate block">
              {formatNumber(liveRaw)}
            </span>
            <span className="text-[9px] text-cyan-400 font-mono">20Hz Stream</span>
          </div>

          {/* Node 2: Filtering */}
          <div className="bg-[#070d1a] border border-cyan-900/60 p-2.5 rounded-lg space-y-1">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">2. Filtered</span>
            <span className="text-cyan-300 font-bold text-xs truncate block">
              {formatNumber(filteredRaw)}
            </span>
            <span className="text-[9px] text-slate-400">EMA α=0.2</span>
          </div>

          {/* Node 3: Volume ml */}
          <div className="bg-[#070d1a] border border-cyan-900/60 p-2.5 rounded-lg space-y-1">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">3. Volume (ml)</span>
            <span className="text-emerald-400 font-bold text-xs truncate block">
              {calculatedVolumeMl !== null ? `${formatNumber(calculatedVolumeMl, 1)} ml` : '—'}
            </span>
            <span className="text-[9px] text-slate-400">Piecewise Linear</span>
          </div>

          {/* Node 4: Check Cap State */}
          <div
            className={`p-2.5 rounded-lg space-y-1 border ${
              isAutomationEnabled
                ? 'bg-cyan-950/70 border-cyan-500/80'
                : 'bg-slate-900/80 border-slate-700'
            }`}
          >
            <span className="text-[10px] text-slate-500 block uppercase font-bold">4. Cap State</span>
            <span
              className={`font-bold text-xs truncate block ${
                isAutomationEnabled ? 'text-cyan-300' : 'text-slate-400'
              }`}
            >
              {capState === 'CLOSED' ? 'CLOSED (ACTIVE)' : 'OPEN (SKIPPED)'}
            </span>
            <span className="text-[9px] text-slate-400">
              {isAutomationEnabled ? 'Loop Enabled' : 'Auto Disabled'}
            </span>
          </div>

          {/* Node 5: Target Angle from Profile */}
          <div className="bg-[#070d1a] border border-cyan-900/60 p-2.5 rounded-lg space-y-1">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">5. Profile Target</span>
            <span className="text-sky-300 font-bold text-xs truncate block">
              {formatDegrees(targetMotorPosition)}
            </span>
            <span className="text-[9px] text-slate-400 truncate block">
              {selectedProfileName || 'Saved Profile'}
            </span>
          </div>

          {/* Node 6: Delta Differential */}
          <div className="bg-[#070d1a] border border-cyan-900/60 p-2.5 rounded-lg space-y-1">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">6. Movement Δ</span>
            <span
              className={`font-bold text-xs truncate block ${
                Math.abs(requiredAdjustment) < angleDeadband
                  ? 'text-emerald-400'
                  : 'text-amber-400 font-extrabold'
              }`}
            >
              {requiredAdjustment > 0 ? `+${requiredAdjustment}` : requiredAdjustment}°
            </span>
            <span className="text-[9px] text-slate-400">
              {Math.abs(requiredAdjustment) < angleDeadband ? 'Deadband ≤2°' : 'Required Move'}
            </span>
          </div>

          {/* Node 7: Motor Action */}
          <div
            className={`border p-2.5 rounded-lg space-y-1 ${
              motorDirection === 'CW'
                ? 'bg-cyan-950/70 border-cyan-500 text-cyan-300'
                : motorDirection === 'CCW'
                ? 'bg-sky-950/70 border-sky-500 text-sky-300'
                : 'bg-[#070d1a] border-slate-800 text-slate-400'
            }`}
          >
            <span className="text-[10px] text-slate-500 block uppercase font-bold">7. Existing Exec</span>
            <span className="font-bold text-xs truncate block flex items-center justify-center space-x-1">
              {motorDirection === 'CW' && <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
              {motorDirection === 'CCW' && <RotateCcw className="w-3.5 h-3.5 animate-spin text-sky-400" />}
              <span>{motorDirection}</span>
            </span>
            <span className="text-[9px] text-slate-400">
              {isMotorMoving ? 'Motor Stepping...' : 'Driver Idle'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Automatic Mode Dashboard Grid (Requirement 5) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: 4 Metric Cards */}
        <div className="space-y-4">
          {/* Card 1: Live & Filtered Load Cell */}
          <div className="panel-glass rounded-xl p-4 border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-bold flex items-center space-x-1.5">
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                <span>Load Cell Telemetry</span>
              </span>
              <span className={`text-[10px] font-bold ${stability === 'STABLE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {stability}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
              <div className="bg-[#060b14] p-2.5 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase">Live Raw ADC</span>
                <p className="text-white font-bold text-sm mt-0.5">{formatNumber(liveRaw)}</p>
              </div>
              <div className="bg-[#060b14] p-2.5 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase">Filtered EMA</span>
                <p className="text-cyan-300 font-bold text-sm mt-0.5">{formatNumber(filteredRaw)}</p>
              </div>
            </div>
          </div>

          {/* Card 2: Calculated Liquid Volume */}
          <div className="panel-glass rounded-xl p-4 border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-bold flex items-center space-x-1.5">
                <Droplets className="w-3.5 h-3.5 text-emerald-400" />
                <span>Calculated Volume</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {hasCalibration ? `${confirmedCalPoints.length} Cal Points` : 'Uncalibrated'}
              </span>
            </div>
            <div className="bg-[#060b14] p-3 rounded border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-2xl font-bold text-emerald-400">
                  {calculatedVolumeMl !== null ? formatNumber(calculatedVolumeMl, 1) : '—'}
                </span>
                <span className="text-sm font-bold text-slate-500 ml-1.5">ml</span>
              </div>
              <span className="text-[11px] text-slate-400 text-right">
                {calculatedVolumeMl !== null ? 'Live Calculated' : 'Awaiting sensor'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Angular Position Dial & Differential Comparison */}
        <div className="panel-glass rounded-xl p-5 border-slate-800 flex flex-col justify-between items-center text-center space-y-3">
          <div className="w-full flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-xs font-bold uppercase text-white flex items-center space-x-1.5">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span>Motor Position & Differential Dial</span>
            </span>
            <span className="text-[10px] text-slate-400">Limit: {maxMotorAngle}°</span>
          </div>

          {/* SVG Circular Dial */}
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 130 130">
              {/* Background Track */}
              <circle
                cx="65"
                cy="65"
                r={dialRadius}
                className="stroke-slate-800/80"
                strokeWidth="10"
                fill="transparent"
              />
              {/* Target Position Marker */}
              <circle
                cx="65"
                cy="65"
                r={dialRadius}
                className="stroke-emerald-500/30"
                strokeWidth="10"
                strokeDasharray={`${(targetProgressPercent / 100) * dialCircumference} ${dialCircumference}`}
                fill="transparent"
              />
              {/* Current Position Arc */}
              <circle
                cx="65"
                cy="65"
                r={dialRadius}
                className="stroke-cyan-400 transition-all duration-500 ease-out shadow-glow-cyan"
                strokeWidth="10"
                strokeDasharray={`${strokeCurrent} ${dialCircumference}`}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Inner Dial Text */}
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-slate-400 text-[10px] uppercase font-semibold">Position</span>
              <span className="text-xl font-extrabold text-white font-mono mt-0.5">
                {formatDegrees(currentMotorPosition)}
              </span>
              <span className="text-[9px] text-cyan-400 font-bold uppercase mt-0.5">
                Target: {formatDegrees(targetMotorPosition)}
              </span>
            </div>
          </div>

          {/* Difference & Direction Banner */}
          <div className="w-full bg-[#060b14] p-2.5 rounded-lg border border-slate-800 grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Required Δ</span>
              <span
                className={`font-bold ${
                  Math.abs(requiredAdjustment) < angleDeadband
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {requiredAdjustment > 0 ? `+${requiredAdjustment}` : requiredAdjustment}°
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Direction</span>
              <span className="font-bold text-white flex items-center justify-center space-x-1">
                {motorDirection === 'CW' ? (
                  <span className="text-cyan-400 flex items-center space-x-1">
                    <RotateCw className="w-3 h-3 animate-spin" />
                    <span>CW</span>
                  </span>
                ) : motorDirection === 'CCW' ? (
                  <span className="text-sky-400 flex items-center space-x-1">
                    <RotateCcw className="w-3 h-3 animate-spin" />
                    <span>CCW</span>
                  </span>
                ) : (
                  <span className="text-emerald-400">IDLE</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Loop Status, Last Adjustment, Tuning */}
        <div className="space-y-4">
          {/* Card 3: Loop Status & Health */}
          <div className="panel-glass rounded-xl p-4 border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-bold flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Loop State & Health</span>
              </span>
              <button
                type="button"
                onClick={() => setShowTuning(!showTuning)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
              >
                <Settings2 className="w-3 h-3" />
                <span>{showTuning ? 'Hide Tuning' : 'Tune Loop'}</span>
              </button>
            </div>

            <div className="bg-[#060b14] p-3 rounded border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Current State:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusInfo.color}`}>
                  {status}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Motor Coils:</span>
                <span className={`font-bold ${isMotorMoving ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`}>
                  {isMotorMoving ? 'ENERGIZED / STEPPING' : 'DE-ENERGIZED (SAFE)'}
                </span>
              </div>
            </div>

            {/* Error banner if present */}
            {errorMessage && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-[11px] flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Card 4: Last Adjustment Record */}
          <div className="panel-glass rounded-xl p-4 border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-bold flex items-center space-x-1.5">
                <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                <span>Last Adjustment Cycle</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {lastAdjustmentTime ? formatTimestamp(lastAdjustmentTime) : 'None'}
              </span>
            </div>

            <div className="bg-[#060b14] p-3 rounded border border-slate-800 text-xs text-slate-300 font-mono">
              {lastAdjustmentDetails ? (
                <p className="leading-relaxed text-cyan-300">{lastAdjustmentDetails}</p>
              ) : (
                <p className="text-slate-500 italic">No automated adjustments recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Configurable Loop Tuning & Deadband Settings (Collapsible) */}
      {showTuning && (
        <div className="panel-glass rounded-xl p-5 border-cyan-500/40 bg-[#070e1c] space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-cyan-900/50 pb-2">
            <div className="flex items-center space-x-2">
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
              <span className="font-bold uppercase text-white">
                Feedback Loop Anti-Oscillation & Deadband Configuration
              </span>
            </div>
            <span className="text-[10px] text-cyan-400">Real-time parameters</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Angle Deadband */}
            <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 uppercase">
                  Angle Deadband (±°)
                </label>
                <span className="text-cyan-400 font-bold">{angleDeadband}°</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={angleDeadband}
                onChange={(e) => onUpdateConfig({ angleDeadband: parseFloat(e.target.value) })}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Position changes below {angleDeadband}° are ignored to prevent noise oscillation.
              </p>
            </div>

            {/* Volume Deadband */}
            <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 uppercase">
                  Volume Deadband (±ml)
                </label>
                <span className="text-emerald-400 font-bold">{volumeDeadband} ml</span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={volumeDeadband}
                onChange={(e) => onUpdateConfig({ volumeDeadband: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Volume fluctuations under {volumeDeadband} ml will not trigger adjustments.
              </p>
            </div>

            {/* Rate Limit Interval */}
            <div className="bg-[#060b16] p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 uppercase">
                  Min Adjustment Interval
                </label>
                <span className="text-sky-400 font-bold">{minAdjustmentInterval} ms</span>
              </div>
              <input
                type="range"
                min="500"
                max="5000"
                step="250"
                value={minAdjustmentInterval}
                onChange={(e) => onUpdateConfig({ minAdjustmentInterval: parseInt(e.target.value, 10) })}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Enforces settling time between successive motor moves ({minAdjustmentInterval / 1000}s).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. Automatic Cap Control Buttons & Profile Execution Status */}
      <div className="panel-glass rounded-xl p-5 border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="font-bold uppercase text-white text-xs">
              Automatic Cap Actuation (Profile-Driven)
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Fresh Load-Cell Sample → Volume Calculation → Profile Angle & Direction → Motor Actuation
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onTriggerCapOpen}
            disabled={!isConnected || isMotorMoving}
            className="py-3.5 px-4 rounded-xl bg-sky-950/80 hover:bg-sky-900 active:scale-95 border border-sky-600/60 text-sky-300 font-bold flex items-center justify-center space-x-2.5 shadow-glow-blue transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            title="Sample load cell, determine volume, select configured OPEN profile, and execute motor rotation"
          >
            <Unlock className="w-4 h-4" />
            <span>CAP OPEN (AUTOMATIC PROFILE)</span>
          </button>

          <button
            type="button"
            onClick={onTriggerCapClose}
            disabled={!isConnected || isMotorMoving}
            className="py-3.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-slate-950 font-extrabold flex items-center justify-center space-x-2.5 shadow-glow-cyan transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            title="Sample load cell, determine volume, select configured CLOSE profile, and execute motor rotation"
          >
            <Lock className="w-4 h-4 fill-current" />
            <span>CAP CLOSE (AUTOMATIC PROFILE)</span>
          </button>
        </div>

        {/* Selected Profile Readout Details */}
        {feedbackState.capControl && (
          <div className="bg-[#050a14] p-3 rounded-lg border border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Liquid Volume</span>
              <span className="text-emerald-400 font-bold block mt-0.5 truncate">
                {feedbackState.capControl.calculatedVolumeMl !== null
                  ? `${formatNumber(feedbackState.capControl.calculatedVolumeMl, 1)} ml`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Fresh Raw Reading</span>
              <span className="text-white font-bold block mt-0.5 truncate">
                {formatNumber(feedbackState.capControl.currentRaw)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Selected Profile</span>
              <span
                className="text-sky-300 font-bold truncate block mt-0.5 text-[11px]"
                title={feedbackState.capControl.selectedProfile || 'Awaiting Action'}
              >
                {feedbackState.capControl.selectedProfile || 'None'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Configured Angle</span>
              <span className="text-cyan-300 font-bold block mt-0.5 truncate">
                {feedbackState.capControl.selectedDegrees !== null
                  ? formatDegrees(feedbackState.capControl.selectedDegrees)
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Direction</span>
              <span className="text-white font-bold block mt-0.5 truncate">
                {feedbackState.capControl.selectedDirection || '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Status</span>
              <span
                className={`font-bold block mt-0.5 truncate text-[11px] ${
                  isMotorMoving
                    ? 'text-amber-400 animate-pulse'
                    : feedbackState.capControl.stage === 'ERROR'
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                {isMotorMoving ? 'STEPPING' : feedbackState.capControl.stage}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

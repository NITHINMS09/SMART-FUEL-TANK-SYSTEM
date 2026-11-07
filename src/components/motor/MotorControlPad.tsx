import React, { useState } from 'react';
import {
  RotateCw,
  RotateCcw,
  AlertOctagon,
  AlertTriangle,
  Play,
  CheckCircle2,
  ShieldAlert,
  Gauge,
  Compass,
} from 'lucide-react';
import { MotorDirection, MotorStatus } from '../../types';
import { StatusBadge } from '../common/StatusBadge';

interface MotorControlPadProps {
  motorStatus: MotorStatus;
  isMotorRunning: boolean;
  onRotate: (action: 'OPEN' | 'CLOSE', degrees: number, direction: MotorDirection) => Promise<void>;
  onEmergencyStop: () => Promise<void>;
  isConnected: boolean;
}

export const MotorControlPad: React.FC<MotorControlPadProps> = ({
  motorStatus,
  isMotorRunning,
  onRotate,
  onEmergencyStop,
  isConnected,
}) => {
  const [degrees, setDegrees] = useState<number>(90);
  const [speed, setSpeed] = useState<number>(800);
  const [actionType, setActionType] = useState<'OPEN' | 'CLOSE'>('OPEN');
  const [feedback, setFeedback] = useState<string | null>(null);

  const presets = [45, 90, 180, 270, 360, 720];

  const handleExecute = async (direction: MotorDirection) => {
    if (!isConnected || isMotorRunning) return;
    setFeedback(null);

    try {
      await onRotate(actionType, degrees, direction);
      setFeedback(`Command issued: ${actionType} ${degrees}° ${direction}`);
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Prominent Safety Warning Card */}
      <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 flex items-start space-x-3 text-xs font-mono text-amber-200">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-300 uppercase tracking-wider block mb-1">
            Safety Warning: Physical Stepper Motor Direct Testing
          </span>
          <p className="text-amber-200/90 leading-relaxed">
            Motor testing transmits direct rotational pulses to the DRV8825 stepper driver on ESP32 GPIO 4 (STEP), GPIO 5 (DIR), and GPIO 6 (EN). Ensure the tank cap assembly and mechanical gear linkage are unobstructed and safe before initiating rotation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-xs">
        {/* Left: Input parameters */}
        <div className="lg:col-span-2 panel-glass rounded-xl p-6 border-slate-800 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Compass className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase text-white tracking-wider">
                Manual Jog & Rotation Controls
              </h3>
            </div>
            <StatusBadge status={motorStatus} />
          </div>

          {/* Action selection: OPEN or CLOSE */}
          <div>
            <label className="block text-slate-400 uppercase font-semibold mb-2">
              Target Operation Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActionType('OPEN')}
                className={`py-2.5 px-4 rounded-lg border font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
                  actionType === 'OPEN'
                    ? 'bg-sky-600/30 border-sky-400 text-sky-300 shadow-glow-blue'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>CAP OPEN (OPEN command)</span>
              </button>
              <button
                type="button"
                onClick={() => setActionType('CLOSE')}
                className={`py-2.5 px-4 rounded-lg border font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
                  actionType === 'CLOSE'
                    ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300 shadow-glow-cyan'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>CAP CLOSED (CLOSE command)</span>
              </button>
            </div>
          </div>

          {/* Angle Input & Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-slate-400 uppercase font-semibold">
                Rotation Angle (Degrees)
              </label>
              <span className="text-cyan-400 font-bold text-sm">{degrees}°</span>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="number"
                min="1"
                max="7200"
                value={degrees}
                onChange={(e) => setDegrees(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold text-sm focus:border-cyan-500 focus:outline-none"
              />
              <input
                type="range"
                min="1"
                max="1080"
                step="5"
                value={degrees}
                onChange={(e) => setDegrees(parseInt(e.target.value))}
                className="flex-1 accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-slate-500 text-[11px] self-center">Presets:</span>
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDegrees(p)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    degrees === p
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {p}°
                </button>
              ))}
            </div>
          </div>

          {/* Speed settings */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-slate-400 uppercase font-semibold flex items-center space-x-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span>Stepping Speed (steps / sec)</span>
              </label>
              <span className="text-slate-300">{speed} sps</span>
            </div>
            <input
              type="range"
              min="200"
              max="3200"
              step="100"
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Direct Execute Buttons */}
          <div className="pt-3 border-t border-slate-800/80">
            <label className="block text-slate-400 uppercase font-semibold mb-2">
              Transmit Direct Rotation Command
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleExecute('CW')}
                disabled={!isConnected || isMotorRunning}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 active:scale-95 text-slate-950 font-bold flex items-center justify-center space-x-2 shadow-glow-blue transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCw className="w-4 h-4" />
                <span>Rotate Clockwise (CW)</span>
              </button>

              <button
                type="button"
                onClick={() => handleExecute('CCW')}
                disabled={!isConnected || isMotorRunning}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 active:scale-95 text-slate-950 font-bold flex items-center justify-center space-x-2 shadow-glow-cyan transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Rotate Anticlockwise (CCW)</span>
              </button>
            </div>
          </div>

          {/* Feedback */}
          {feedback && (
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-cyan-300">
              {feedback}
            </div>
          )}
        </div>

        {/* Right: Driver Status & Hardware State */}
        <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold uppercase text-white tracking-wider">
                Motor Driver State
              </h3>
              <StatusBadge status={motorStatus} />
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#070b16] border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] uppercase">Driver Model</span>
                <p className="text-white font-bold">DRV8825 Stepper Controller</p>
              </div>

              <div className="p-3 rounded-lg bg-[#070b16] border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] uppercase">Pin Mapping (Fixed)</span>
                <p className="text-cyan-400">STEP: GPIO 4 · DIR: GPIO 5 · EN: GPIO 6</p>
              </div>

              <div className="p-3 rounded-lg bg-[#070b16] border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] uppercase">Command Lock</span>
                <p className={isMotorRunning ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                  {isMotorRunning ? 'BUSY: Commands Locked' : 'IDLE: Ready for Commands'}
                </p>
              </div>
            </div>
          </div>

          {/* Emergency Stop Button */}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <span className="text-slate-400 text-[10px] uppercase block">
              Emergency Override
            </span>
            <button
              type="button"
              onClick={onEmergencyStop}
              className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold flex items-center justify-center space-x-2 shadow-glow-red transition-all"
            >
              <AlertOctagon className="w-5 h-5 animate-pulse" />
              <span>STOP / EMERGENCY DISABLE</span>
            </button>
            <p className="text-[10px] text-slate-500 text-center">
              Sends immediate STOP command, clears command queue, and disables driver coils.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};


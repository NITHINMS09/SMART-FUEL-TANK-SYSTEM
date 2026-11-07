import React, { useState, useEffect } from 'react';
import { X, Sliders, CheckCircle2, RotateCw, RotateCcw } from 'lucide-react';
import { MotorDirection, MotorProfile } from '../../types';

interface MotorProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    data: Omit<MotorProfile, 'id' | 'syncedToESP' | 'timestamp'>,
    existingId?: string
  ) => Promise<boolean>;
  initialProfile?: MotorProfile | null;
  isSaving: boolean;
}

export const MotorProfileModal: React.FC<MotorProfileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProfile,
  isSaving,
}) => {
  const [volumeMl, setVolumeMl] = useState<string>('100');
  const [openDegrees, setOpenDegrees] = useState<string>('90');
  const [openDirection, setOpenDirection] = useState<MotorDirection>('CW');
  const [openSpeed, setOpenSpeed] = useState<string>('800');
  const [openAcceleration, setOpenAcceleration] = useState<string>('400');

  const [closeDegrees, setCloseDegrees] = useState<string>('180');
  const [closeDirection, setCloseDirection] = useState<MotorDirection>('CCW');
  const [closeSpeed, setCloseSpeed] = useState<string>('800');
  const [closeAcceleration, setCloseAcceleration] = useState<string>('400');

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProfile) {
      setVolumeMl(initialProfile.volumeMl.toString());
      setOpenDegrees(initialProfile.openDegrees.toString());
      setOpenDirection(initialProfile.openDirection);
      setOpenSpeed((initialProfile.openSpeed ?? 800).toString());
      setOpenAcceleration((initialProfile.openAcceleration ?? 400).toString());

      setCloseDegrees(initialProfile.closeDegrees.toString());
      setCloseDirection(initialProfile.closeDirection);
      setCloseSpeed((initialProfile.closeSpeed ?? 800).toString());
      setCloseAcceleration((initialProfile.closeAcceleration ?? 400).toString());
    } else {
      setVolumeMl('100');
      setOpenDegrees('90');
      setOpenDirection('CW');
      setOpenSpeed('800');
      setOpenAcceleration('400');
      setCloseDegrees('180');
      setCloseDirection('CCW');
      setCloseSpeed('800');
      setCloseAcceleration('400');
    }
    setError(null);
  }, [initialProfile, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const v = parseFloat(volumeMl);
    const oDeg = parseFloat(openDegrees);
    const cDeg = parseFloat(closeDegrees);

    if (isNaN(v) || v < 0) {
      setError('Please enter a valid volume (ml) >= 0');
      return;
    }
    if (isNaN(oDeg) || oDeg < 0) {
      setError('Please enter valid open rotation degrees >= 0');
      return;
    }
    if (isNaN(cDeg) || cDeg < 0) {
      setError('Please enter valid closed rotation degrees >= 0');
      return;
    }

    const success = await onSave(
      {
        volumeMl: v,
        openDegrees: oDeg,
        openDirection,
        openSpeed: parseFloat(openSpeed) || 800,
        openAcceleration: parseFloat(openAcceleration) || 400,
        closeDegrees: cDeg,
        closeDirection,
        closeSpeed: parseFloat(closeSpeed) || 800,
        closeAcceleration: parseFloat(closeAcceleration) || 400,
      },
      initialProfile ? initialProfile.id : undefined
    );

    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0b1222] border border-cyan-500/40 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              {initialProfile ? 'Edit Motor Volume Profile' : 'Add Motor Volume Profile'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 rounded text-xs font-mono text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 font-mono text-xs">
          {/* Volume Input */}
          <div className="bg-[#070b16] p-3 rounded-lg border border-slate-800">
            <label className="block text-slate-400 font-semibold mb-1 uppercase">
              Target Water Volume (ml)
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="0"
                step="1"
                value={volumeMl}
                onChange={(e) => setVolumeMl(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-cyan-300 font-bold focus:border-cyan-500 focus:outline-none"
              />
              <span className="text-slate-400 font-bold">ml</span>
            </div>
          </div>

          {/* Dual Sections: CAP OPEN & CAP CLOSED */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SECTION A: CAP OPEN */}
            <div className="bg-[#081020] p-4 rounded-lg border border-sky-900/60 space-y-3">
              <div className="flex items-center justify-between border-b border-sky-900/40 pb-2">
                <span className="font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1">
                  <span>A. CAP OPEN</span>
                </span>
                <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-800 px-2 py-0.5 rounded">
                  UNSCREW / RELEASE
                </span>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Rotation Angle (°)</label>
                <input
                  type="number"
                  min="0"
                  max="7200"
                  value={openDegrees}
                  onChange={(e) => setOpenDegrees(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white focus:border-sky-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenDirection('CW')}
                    className={`py-1.5 px-2 rounded border flex items-center justify-center space-x-1.5 transition-colors ${
                      openDirection === 'CW'
                        ? 'bg-sky-600/30 border-sky-500 text-sky-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>CW</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenDirection('CCW')}
                    className={`py-1.5 px-2 rounded border flex items-center justify-center space-x-1.5 transition-colors ${
                      openDirection === 'CCW'
                        ? 'bg-sky-600/30 border-sky-500 text-sky-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>CCW</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 text-[10px]">Speed (steps/s)</label>
                  <input
                    type="number"
                    value={openSpeed}
                    onChange={(e) => setOpenSpeed(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px]">Accel (steps/s²)</label>
                  <input
                    type="number"
                    value={openAcceleration}
                    onChange={(e) => setOpenAcceleration(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* SECTION B: CAP CLOSED */}
            <div className="bg-[#081020] p-4 rounded-lg border border-cyan-900/60 space-y-3">
              <div className="flex items-center justify-between border-b border-cyan-900/40 pb-2">
                <span className="font-bold text-cyan-400 uppercase tracking-wider flex items-center space-x-1">
                  <span>B. CAP CLOSED</span>
                </span>
                <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded">
                  TIGHTEN / SEAL
                </span>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Rotation Angle (°)</label>
                <input
                  type="number"
                  min="0"
                  max="7200"
                  value={closeDegrees}
                  onChange={(e) => setCloseDegrees(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCloseDirection('CW')}
                    className={`py-1.5 px-2 rounded border flex items-center justify-center space-x-1.5 transition-colors ${
                      closeDirection === 'CW'
                        ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>CW</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCloseDirection('CCW')}
                    className={`py-1.5 px-2 rounded border flex items-center justify-center space-x-1.5 transition-colors ${
                      closeDirection === 'CCW'
                        ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>CCW</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 text-[10px]">Speed (steps/s)</label>
                  <input
                    type="number"
                    value={closeSpeed}
                    onChange={(e) => setCloseSpeed(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px]">Accel (steps/s²)</label>
                  <input
                    type="number"
                    value={closeAcceleration}
                    onChange={(e) => setCloseAcceleration(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold flex items-center space-x-2 shadow-glow-cyan transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSaving ? 'Sending to ESP32...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


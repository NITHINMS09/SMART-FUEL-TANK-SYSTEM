import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Play, CheckCircle2, AlertCircle, RotateCw, RotateCcw } from 'lucide-react';
import { MotorDirection, MotorProfile } from '../../types';
import { formatDegrees } from '../../utils/formatters';

interface MotorProfileTableProps {
  profiles: MotorProfile[];
  onOpenAddModal: () => void;
  onEditProfile: (profile: MotorProfile) => void;
  onDeleteProfile: (id: string) => Promise<void>;
  onTestRotation: (type: 'OPEN' | 'CLOSE', degrees: number, direction: MotorDirection) => Promise<void>;
  isMotorRunning: boolean;
}

export const MotorProfileTable: React.FC<MotorProfileTableProps> = ({
  profiles,
  onOpenAddModal,
  onEditProfile,
  onDeleteProfile,
  onTestRotation,
  isMotorRunning,
}) => {
  const [testingKey, setTestingKey] = useState<string | null>(null);

  const handleTest = async (key: string, type: 'OPEN' | 'CLOSE', deg: number, dir: MotorDirection) => {
    setTestingKey(key);
    try {
      await onTestRotation(type, deg, dir);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setTestingKey(null), 1000);
    }
  };

  const sortedProfiles = [...profiles].sort((a, b) => a.volumeMl - b.volumeMl);

  return (
    <div className="panel-glass rounded-xl overflow-hidden border-slate-800">
      {/* Header bar */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#0a101f]/70">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono font-bold uppercase text-slate-300">
            Water Volume Motor Rotation Profiles
          </span>
          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
            {profiles.length} / 30 MAX
          </span>
        </div>

        <button
          onClick={onOpenAddModal}
          className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs flex items-center space-x-1.5 shadow-glow-cyan transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Volume Profile</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-[#090f1e] text-slate-400 uppercase text-[11px] border-b border-slate-800/80">
            <tr>
              <th className="py-3 px-4">Volume</th>
              <th className="py-3 px-4">Cap Open Action</th>
              <th className="py-3 px-4">Cap Closed Action</th>
              <th className="py-3 px-4">Hardware Sync</th>
              <th className="py-3 px-4 text-center">Test Rotation</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {sortedProfiles.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                  No motor profiles configured. Add water volume profiles to specify cap open & closed rotations.
                </td>
              </tr>
            ) : (
              sortedProfiles.map((p) => {
                const openKey = `${p.id}-open`;
                const closeKey = `${p.id}-close`;

                return (
                  <tr key={p.id} className="hover:bg-slate-900/40 transition-colors group">
                    {/* Volume */}
                    <td className="py-3 px-4 font-bold text-cyan-300 text-sm">
                      {p.volumeMl} ml
                    </td>

                    {/* Cap Open Action */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-semibold">
                          {formatDegrees(p.openDegrees)}
                        </span>
                        <span
                          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] ${
                            p.openDirection === 'CW'
                              ? 'bg-sky-950/60 text-sky-400 border border-sky-800/40'
                              : 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/40'
                          }`}
                        >
                          {p.openDirection === 'CW' ? <RotateCw className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                          <span>{p.openDirection}</span>
                        </span>
                      </div>
                    </td>

                    {/* Cap Closed Action */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-semibold">
                          {formatDegrees(p.closeDegrees)}
                        </span>
                        <span
                          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] ${
                            p.closeDirection === 'CW'
                              ? 'bg-sky-950/60 text-sky-400 border border-sky-800/40'
                              : 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/40'
                          }`}
                        >
                          {p.closeDirection === 'CW' ? <RotateCw className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                          <span>{p.closeDirection}</span>
                        </span>
                      </div>
                    </td>

                    {/* Hardware Sync */}
                    <td className="py-3 px-4">
                      {p.syncedToESP ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-400 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ESP32 NVS</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-amber-400 text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Pending Sync</span>
                        </span>
                      )}
                    </td>

                    {/* Test Rotation */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleTest(openKey, 'OPEN', p.openDegrees, p.openDirection)}
                          disabled={isMotorRunning}
                          className="px-2 py-1 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-800/60 text-sky-300 text-[11px] flex items-center space-x-1 disabled:opacity-40 transition-colors"
                          title="Test Open rotation"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Test Open</span>
                        </button>
                        <button
                          onClick={() => handleTest(closeKey, 'CLOSE', p.closeDegrees, p.closeDirection)}
                          disabled={isMotorRunning}
                          className="px-2 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 text-[11px] flex items-center space-x-1 disabled:opacity-40 transition-colors"
                          title="Test Close rotation"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Test Close</span>
                        </button>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => onEditProfile(p)}
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                          title="Edit Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteProfile(p.id)}
                          className="p-1.5 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Delete Profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};


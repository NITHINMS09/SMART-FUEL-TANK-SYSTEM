import React, { useState } from 'react';
import { ArrowUpDown, Edit2, Trash2, RefreshCw, Check, X, Download } from 'lucide-react';
import { CalibrationPoint } from '../../types';
import { formatNumber, formatTimestamp } from '../../utils/formatters';
import { StatusBadge } from '../common/StatusBadge';

interface CalibrationTableProps {
  points: CalibrationPoint[];
  onDeletePoint: (id: string) => Promise<void>;
  onUpdatePoint: (id: string, newVolume: number) => void;
  onRecalibrate: (volume: number) => void;
  onExport: () => void;
}

export const CalibrationTable: React.FC<CalibrationTableProps> = ({
  points,
  onDeletePoint,
  onUpdatePoint,
  onRecalibrate,
  onExport,
}) => {
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVolume, setEditVolume] = useState<string>('');

  const sortedPoints = [...points].sort((a, b) => {
    return sortAsc ? a.volumeMl - b.volumeMl : b.volumeMl - a.volumeMl;
  });

  const startEdit = (p: CalibrationPoint) => {
    setEditingId(p.id);
    setEditVolume(p.volumeMl.toString());
  };

  const saveEdit = (id: string) => {
    const vol = parseFloat(editVolume);
    if (!isNaN(vol) && vol >= 0) {
      onUpdatePoint(id, vol);
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div className="panel-glass rounded-xl overflow-hidden border-slate-800">
      {/* Table Top Toolbar */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#0a101f]/70">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono font-bold uppercase text-slate-300">
            Calibrated Data Points
          </span>
          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
            {points.length} / 30 MAX
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-300 flex items-center space-x-1.5 transition-colors"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sort: {sortAsc ? 'Volume Asc' : 'Volume Desc'}</span>
          </button>

          <button
            onClick={onExport}
            disabled={points.length === 0}
            className="px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40 hover:border-cyan-600 text-xs font-mono text-cyan-300 flex items-center space-x-1.5 transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Points</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-[#090f1e] text-slate-400 uppercase text-[11px] border-b border-slate-800/80">
            <tr>
              <th className="py-3 px-4">Volume</th>
              <th className="py-3 px-4">Average Raw</th>
              <th className="py-3 px-4">Minimum</th>
              <th className="py-3 px-4">Maximum</th>
              <th className="py-3 px-4">Range</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {sortedPoints.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                  No calibration points stored. Perform calibration to register reference points.
                </td>
              </tr>
            ) : (
              sortedPoints.map((p) => {
                const isEditing = editingId === p.id;

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-900/40 transition-colors group"
                  >
                    {/* Volume */}
                    <td className="py-3 px-4 font-bold text-cyan-300">
                      {isEditing ? (
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            value={editVolume}
                            onChange={(e) => setEditVolume(e.target.value)}
                            className="w-20 bg-slate-900 border border-cyan-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                            autoFocus
                          />
                          <span className="text-slate-400">ml</span>
                        </div>
                      ) : (
                        <span>{p.volumeMl} ml</span>
                      )}
                    </td>

                    {/* Average Raw */}
                    <td className="py-3 px-4 text-white font-medium">
                      {formatNumber(p.averageRaw)}
                    </td>

                    {/* Minimum */}
                    <td className="py-3 px-4 text-slate-400">
                      {formatNumber(p.minimum)}
                    </td>

                    {/* Maximum */}
                    <td className="py-3 px-4 text-slate-400">
                      {formatNumber(p.maximum)}
                    </td>

                    {/* Range */}
                    <td className="py-3 px-4">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] ${
                          p.range <= 50
                            ? 'text-emerald-400 bg-emerald-950/40'
                            : 'text-amber-400 bg-amber-950/40'
                        }`}
                      >
                        {formatNumber(p.range)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <StatusBadge status={p.status} size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => saveEdit(p.id)}
                            className="p-1 rounded bg-emerald-900/60 text-emerald-300 hover:bg-emerald-800"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1 rounded bg-slate-800 text-slate-400 hover:bg-slate-700"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => onRecalibrate(p.volumeMl)}
                            className="p-1.5 rounded hover:bg-cyan-950/60 text-slate-400 hover:text-cyan-400 transition-colors"
                            title="Recalibrate this volume"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => startEdit(p)}
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Edit volume label"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeletePoint(p.id)}
                            className="p-1.5 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors"
                            title="Delete point"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
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


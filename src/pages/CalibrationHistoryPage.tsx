import React from 'react';
import { History, Download, Scale, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { CalibrationPoint } from '../types';
import { formatNumber, formatDateTime } from '../utils/formatters';
import { StatusBadge } from '../components/common/StatusBadge';
import { StorageService } from '../services/storageService';

interface CalibrationHistoryPageProps {
  points: CalibrationPoint[];
}

export const CalibrationHistoryPage: React.FC<CalibrationHistoryPageProps> = ({ points }) => {
  const sortedPoints = [...points].sort((a, b) => a.volumeMl - b.volumeMl);

  // Compute sensitivity / slope between adjacent points
  const segments = [];
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const p1 = sortedPoints[i];
    const p2 = sortedPoints[i + 1];
    const dVol = p2.volumeMl - p1.volumeMl;
    const dRaw = p2.averageRaw - p1.averageRaw;
    const slope = dVol !== 0 ? Math.round((dRaw / dVol) * 10) / 10 : 0;
    segments.push({
      fromVol: p1.volumeMl,
      toVol: p2.volumeMl,
      slope,
      dVol,
      dRaw,
    });
  }

  const handleExport = () => {
    const json = JSON.stringify(points, null, 2);
    StorageService.downloadJsonFile('calibration_history_audit.json', json);
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Header */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shadow-glow-cyan">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase text-white tracking-wider">
              Calibration Audit Log & Sensor Sensitivity
            </h2>
            <p className="text-slate-400 text-xs">
              Complete historical record of confirmed reference points, timestamps, and linear gradient steps
            </p>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={points.length === 0}
          className="px-4 py-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 font-bold flex items-center space-x-2 transition-colors disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit Log</span>
        </button>
      </div>

      {/* Sensitivity Segments Card */}
      {segments.length > 0 && (
        <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <Scale className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase text-white">
                Linearity & Sensitivity Analysis
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              ADC Counts per Milliliter (counts / ml)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {segments.map((s, idx) => (
              <div
                key={idx}
                className="bg-[#070c18] p-3.5 rounded-lg border border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Segment #{idx + 1}</span>
                  <span className="text-cyan-400 font-bold">
                    {s.fromVol} ml <ArrowRight className="inline w-3 h-3 mx-1" /> {s.toVol} ml
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-slate-500 text-[10px]">Slope:</span>
                  <span className="text-base font-bold text-white">
                    {s.slope} <span className="text-[10px] text-slate-400">counts/ml</span>
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 flex justify-between">
                  <span>ΔRaw: {formatNumber(s.dRaw)}</span>
                  <span>ΔVol: {s.dVol} ml</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historical Detailed Table */}
      <div className="panel-glass rounded-xl overflow-hidden border-slate-800">
        <div className="p-4 border-b border-slate-800 bg-[#0a101f]/70">
          <span className="font-bold uppercase text-slate-300">
            Reference Point Detailed Records
          </span>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[620px] text-left">
            <thead className="bg-[#090f1e] text-slate-400 uppercase text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Calibrated At</th>
                <th className="py-3 px-4">Volume (ml)</th>
                <th className="py-3 px-4">Average Raw ADC</th>
                <th className="py-3 px-4">Range (Max - Min)</th>
                <th className="py-3 px-4">Min Sample</th>
                <th className="py-3 px-4">Max Sample</th>
                <th className="py-3 px-4">ESP32 NVS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {sortedPoints.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                    No calibration history recorded yet.
                  </td>
                </tr>
              ) : (
                sortedPoints.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                      {formatDateTime(p.timestamp)}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-cyan-300">
                      {p.volumeMl} ml
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-white">
                      {formatNumber(p.averageRaw)}
                    </td>
                    <td className="py-2.5 px-4 text-emerald-400">
                      {formatNumber(p.range)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {formatNumber(p.minimum)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {formatNumber(p.maximum)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center space-x-1 text-emerald-400 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirmed</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


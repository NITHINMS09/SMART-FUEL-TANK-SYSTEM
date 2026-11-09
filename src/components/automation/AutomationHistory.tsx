import React, { useState } from 'react';
import { History, Trash2, Search, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { AutomationEvent } from '../../types';
import { formatDateTime, formatVolume, formatDegrees } from '../../utils/formatters';

interface AutomationHistoryProps {
  events: AutomationEvent[];
  onClearHistory: () => void;
}

export const AutomationHistory: React.FC<AutomationHistoryProps> = ({
  events,
  onClearHistory,
}) => {
  const [filterMode, setFilterMode] = useState<'ALL' | 'MANUAL' | 'AUTOMATIC'>('ALL');
  const [search, setSearch] = useState('');

  const filteredEvents = events.filter((ev) => {
    if (filterMode !== 'ALL' && ev.mode !== filterMode) return false;
    if (search && !ev.details.toLowerCase().includes(search.toLowerCase()) && !ev.type.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="panel-glass rounded-xl overflow-hidden border-slate-800 font-mono text-xs">
      {/* Top Toolbar */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#0a101f]/70">
        <div className="flex items-center space-x-2">
          <History className="w-4 h-4 text-cyan-400" />
          <span className="font-bold uppercase text-slate-300">
            Automation & Operation Event History
          </span>
          <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
            {events.length} records
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Filter */}
          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-2.5 py-1 rounded ${filterMode === 'ALL' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'}`}
            >
              ALL
            </button>
            <button
              onClick={() => setFilterMode('AUTOMATIC')}
              className={`px-2.5 py-1 rounded ${filterMode === 'AUTOMATIC' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'}`}
            >
              AUTO
            </button>
            <button
              onClick={() => setFilterMode('MANUAL')}
              className={`px-2.5 py-1 rounded ${filterMode === 'MANUAL' ? 'bg-slate-800 text-slate-200 font-bold' : 'text-slate-400'}`}
            >
              MANUAL
            </button>
          </div>

          <button
            onClick={onClearHistory}
            disabled={events.length === 0}
            className="p-1.5 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-40"
            title="Clear all history"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto w-full">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-[#090f1e] text-slate-400 uppercase text-[11px] border-b border-slate-800/80">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Event Type</th>
              <th className="py-3 px-4">Mode</th>
              <th className="py-3 px-4">Measured Volume</th>
              <th className="py-3 px-4">Rotation</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                  No automation events logged yet.
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                    {formatDateTime(ev.timestamp)}
                  </td>
                  <td className="py-2.5 px-4 font-bold text-white">
                    {ev.type}
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        ev.mode === 'AUTOMATIC'
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {ev.mode}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-cyan-300 font-semibold">
                    {formatVolume(ev.volumeMl)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-200">
                    {ev.degrees !== null ? `${formatDegrees(ev.degrees)} ${ev.direction}` : '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    {ev.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center space-x-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>SUCCESS</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-rose-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{ev.status}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-slate-400 text-[11px] max-w-xs truncate">
                    {ev.details}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};


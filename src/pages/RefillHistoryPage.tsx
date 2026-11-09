import React, { useState, useMemo } from 'react';
import {
  Fuel,
  Droplets,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Download,
  Trash2,
  Filter,
  Eye,
  Radio,
  Sparkles,
} from 'lucide-react';
import { RefillRecord, ActiveRefillSession, CapState } from '../types';

interface RefillHistoryPageProps {
  refillHistory: RefillRecord[];
  activeSession: ActiveRefillSession | null;
  capState: CapState;
  currentVolumeMl: number | null;
  isThisDeviceGateway: boolean;
  onClearHistory?: () => void;
}

export const RefillHistoryPage: React.FC<RefillHistoryPageProps> = ({
  refillHistory,
  activeSession,
  capState,
  currentVolumeMl,
  isThisDeviceGateway,
  onClearHistory,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'REFILLED' | 'NO_REFILL'>('ALL');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Summary statistics
  const stats = useMemo(() => {
    const totalSessions = refillHistory.length;
    const refilledSessions = refillHistory.filter((r) => r.status === 'FUEL REFILLED');
    const totalFuelAddedMl = refilledSessions.reduce((acc, r) => acc + r.fuelAddedMl, 0);
    const avgFuelAddedMl =
      refilledSessions.length > 0 ? Math.round(totalFuelAddedMl / refilledSessions.length) : 0;
    const latestRefill = refilledSessions.length > 0 ? refilledSessions[0] : null;

    return {
      totalSessions,
      refilledCount: refilledSessions.length,
      totalFuelAddedMl,
      totalFuelAddedLiters: (totalFuelAddedMl / 1000).toFixed(2),
      avgFuelAddedMl,
      latestRefill,
    };
  }, [refillHistory]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (filter === 'REFILLED') {
      return refillHistory.filter((r) => r.status === 'FUEL REFILLED');
    }
    if (filter === 'NO_REFILL') {
      return refillHistory.filter((r) => r.status === 'NO REFILL DETECTED');
    }
    return refillHistory;
  }, [refillHistory, filter]);

  // Format Duration helper: seconds to mm:ss or Xm Ys
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Export CSV
  const handleExportCSV = () => {
    if (refillHistory.length === 0) return;
    const headers = [
      'Record ID',
      'Opened At',
      'Closed At',
      'Start Volume (ml)',
      'End Volume (ml)',
      'Max Volume (ml)',
      'Min Volume (ml)',
      'Net Change (ml)',
      'Fuel Added (ml)',
      'Duration (seconds)',
      'Status',
    ];
    const rows = refillHistory.map((r) => [
      r.id,
      new Date(r.openedAt).toISOString(),
      new Date(r.closedAt).toISOString(),
      r.startVolumeMl,
      r.endVolumeMl,
      r.maxVolumeMl,
      r.minVolumeMl,
      r.netVolumeChangeMl,
      r.fuelAddedMl,
      r.durationSeconds,
      r.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `fuel_refill_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Remote Mode Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-glow-cyan">
              <Fuel className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold font-mono tracking-wider text-white uppercase flex items-center space-x-2">
                <span>Fuel Refill History</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/60 text-emerald-300 font-bold">
                  AUTO-DETECT
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Automated fuel addition tracking triggered by physical Cap Open &amp; Close transitions
              </p>
            </div>
          </div>
        </div>

        {/* Mode & Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          {!isThisDeviceGateway && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span>SYNCHRONIZED MONITOR</span>
            </div>
          )}

          {refillHistory.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 font-mono text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}

          {isThisDeviceGateway && refillHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 font-mono text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Clearing History */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0b1222] border border-rose-500/50 rounded-2xl max-w-sm w-full p-5 shadow-2xl font-mono text-xs space-y-4">
            <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Clear Refill Records?</span>
            </div>
            <p className="text-slate-300">
              Are you sure you want to delete all historical fuel refill records? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onClearHistory) onClearHistory();
                  setShowClearConfirm(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Live Active Refill Session Banner (State C: CAP OPEN) */}
      {capState === 'OPEN' ? (
        <div className="panel-glass rounded-xl p-5 border-amber-500/50 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900/60 space-y-4 shadow-glow-amber animate-pulse border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-800/40 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-amber-500 text-slate-950 font-black animate-spin">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="font-mono text-xs font-bold text-amber-300 uppercase tracking-wider block">
                  CAP IS OPEN — REFILL IN PROGRESS
                </span>
                <span className="font-mono text-[11px] text-amber-200/80">
                  Actively collecting HX711 load cell readings...
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-full bg-amber-950 border border-amber-600 text-amber-300 font-bold flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {activeSession ? formatDuration(activeSession.durationSeconds) : '0s'}
                </span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
            <div className="p-3 rounded-lg bg-black/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Start Volume</span>
              <span className="text-sm sm:text-base font-extrabold text-white">
                {activeSession ? `${activeSession.startVolumeMl} ml` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-black/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Current Volume</span>
              <span className="text-sm sm:text-base font-extrabold text-cyan-300">
                {currentVolumeMl !== null ? `${Math.round(currentVolumeMl)} ml` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-black/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Peak Volume</span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-400">
                {activeSession ? `${activeSession.maxVolumeMl} ml` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-black/60 border border-amber-600/60 bg-amber-950/20">
              <span className="text-[10px] text-amber-300 uppercase font-bold block">Live Added Change</span>
              <span className="text-sm sm:text-base font-extrabold text-amber-300">
                {activeSession && activeSession.netVolumeChangeMl > 0
                  ? `+${activeSession.netVolumeChangeMl} ml`
                  : activeSession
                  ? `${activeSession.netVolumeChangeMl} ml`
                  : '+0 ml'}
              </span>
            </div>
          </div>

          <p className="text-[11px] font-mono text-amber-200/70 italic text-center">
            Note: The completed refill record will be automatically calculated and saved as soon as the cap is closed.
          </p>
        </div>
      ) : (
        <div className="p-3 sm:p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between font-mono text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Cap is currently <strong className="text-white">CLOSED</strong>. System is in normal monitoring mode.</span>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Opening cap automatically initiates a refill session
          </span>
        </div>
      )}

      {/* 2. Key Metrics Overview Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 font-mono">
        <div className="panel-glass p-4 rounded-xl border-slate-800 space-y-1">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold flex items-center space-x-1">
            <Fuel className="w-3.5 h-3.5 text-cyan-400" />
            <span>Total Refills</span>
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-white">
            {stats.refilledCount}
            <span className="text-xs text-slate-500 font-normal ml-1.5">
              / {stats.totalSessions} sessions
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block">Verified fuel additions</span>
        </div>

        <div className="panel-glass p-4 rounded-xl border-slate-800 space-y-1">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold flex items-center space-x-1">
            <Droplets className="w-3.5 h-3.5 text-emerald-400" />
            <span>Total Fuel Added</span>
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-400">
            +{stats.totalFuelAddedMl.toLocaleString()}
            <span className="text-xs text-emerald-300 font-normal ml-1">ml</span>
          </div>
          <span className="text-[10px] text-slate-500 block">
            {stats.totalFuelAddedLiters} Liters total
          </span>
        </div>

        <div className="panel-glass p-4 rounded-xl border-slate-800 space-y-1">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold flex items-center space-x-1">
            <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
            <span>Average Refill</span>
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-sky-300">
            {stats.avgFuelAddedMl > 0 ? `+${stats.avgFuelAddedMl}` : '—'}
            {stats.avgFuelAddedMl > 0 && <span className="text-xs font-normal ml-1">ml</span>}
          </div>
          <span className="text-[10px] text-slate-500 block">Mean per confirmed refill</span>
        </div>

        <div className="panel-glass p-4 rounded-xl border-slate-800 space-y-1">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Latest Refill</span>
          </span>
          <div className="text-base sm:text-lg font-bold text-white truncate">
            {stats.latestRefill ? `+${stats.latestRefill.fuelAddedMl} ml` : 'None recorded'}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">
            {stats.latestRefill
              ? new Date(stats.latestRefill.closedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Waiting for first refill'}
          </span>
        </div>
      </div>

      {/* 3. Refill History Records Section */}
      <div className="panel-glass rounded-xl p-4 sm:p-5 border-slate-800 space-y-4 shadow-xl font-mono">
        {/* Controls Bar: Filters and Count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-cyan-400" />
            <span className="text-xs uppercase font-bold text-slate-300">
              History Records ({filteredRecords.length})
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-lg border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-cyan-600 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({refillHistory.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('REFILLED')}
              className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                filter === 'REFILLED'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Refilled ({stats.refilledCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('NO_REFILL')}
              className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                filter === 'NO_REFILL'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              No Refill ({refillHistory.length - stats.refilledCount})
            </button>
          </div>
        </div>

        {/* Empty State */}
        {filteredRecords.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mx-auto">
              <Fuel className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-300 block">No Refill Sessions Recorded Yet</span>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Refill detection is automatic. Whenever the tank cap opens and closes with liquid added, a completed record will appear here.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View (Hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-3">Date &amp; Time</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Start Vol</th>
                    <th className="py-3 px-3 text-right">End Vol</th>
                    <th className="py-3 px-3 text-right">Peak Vol</th>
                    <th className="py-3 px-3 text-right">Fuel Added</th>
                    <th className="py-3 px-3 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredRecords.map((record) => {
                    const isRefill = record.status === 'FUEL REFILLED';
                    const dateObj = new Date(record.closedAt);
                    const formattedDate = dateObj.toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                    const formattedTime = dateObj.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <tr
                        key={record.id}
                        className={`hover:bg-slate-900/40 transition-colors ${
                          isRefill ? 'bg-emerald-950/10' : ''
                        }`}
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="text-white font-bold block">{formattedDate}</span>
                          <span className="text-[10px] text-slate-500 block">{formattedTime}</span>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          {isRefill ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 font-bold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>FUEL REFILLED</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-400 font-bold">
                              <AlertCircle className="w-3 h-3 text-slate-500" />
                              <span>NO REFILL</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap text-slate-300">
                          {record.startVolumeMl} ml
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap text-white font-bold">
                          {record.endVolumeMl} ml
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap text-slate-400 text-[11px]">
                          {record.maxVolumeMl} ml
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isRefill ? (
                            <span className="text-emerald-400 font-extrabold text-sm">
                              +{record.fuelAddedMl} ml
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">
                              {record.netVolumeChangeMl > 0 ? `+${record.netVolumeChangeMl} ml` : `${record.netVolumeChangeMl} ml`}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap text-slate-400">
                          {formatDuration(record.durationSeconds)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (Stacked on smaller screens) */}
            <div className="md:hidden space-y-3">
              {filteredRecords.map((record) => {
                const isRefill = record.status === 'FUEL REFILLED';
                const dateObj = new Date(record.closedAt);
                const formattedDate = dateObj.toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                });
                const formattedTime = dateObj.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={record.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isRefill
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : 'bg-black/40 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {formattedDate} • {formattedTime}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Duration: {formatDuration(record.durationSeconds)}
                        </span>
                      </div>

                      {isRefill ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500 text-emerald-300 font-bold flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>REFILLED</span>
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-400 font-bold">
                          NO REFILL
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2.5 text-center">
                      <div className="bg-[#050a14] p-2 rounded border border-slate-800/60">
                        <span className="text-[9px] text-slate-500 uppercase block">Start</span>
                        <span className="text-xs font-bold text-slate-300">
                          {record.startVolumeMl} ml
                        </span>
                      </div>

                      <div className="bg-[#050a14] p-2 rounded border border-slate-800/60">
                        <span className="text-[9px] text-slate-500 uppercase block">End</span>
                        <span className="text-xs font-bold text-white">
                          {record.endVolumeMl} ml
                        </span>
                      </div>

                      <div
                        className={`p-2 rounded border ${
                          isRefill
                            ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                            : 'bg-[#050a14] border-slate-800/60 text-slate-400'
                        }`}
                      >
                        <span className="text-[9px] uppercase font-bold block">
                          {isRefill ? 'Fuel Added' : 'Net Change'}
                        </span>
                        <span className="text-xs font-extrabold">
                          {isRefill
                            ? `+${record.fuelAddedMl} ml`
                            : `${record.netVolumeChangeMl > 0 ? '+' : ''}${record.netVolumeChangeMl} ml`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};


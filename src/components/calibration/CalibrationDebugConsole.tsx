import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Trash2,
  ArrowDownCircle,
  Clock,
  Send,
  Download,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { CalibrationDebugLog } from '../../types';

interface CalibrationDebugConsoleProps {
  logs: CalibrationDebugLog[];
  onClearLogs: () => void;
  isCalibrating: boolean;
  statusText: string;
}

export const CalibrationDebugConsole: React.FC<CalibrationDebugConsoleProps> = ({
  logs,
  onClearLogs,
  isCalibrating,
  statusText,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'CAL_ONLY' | 'ERRORS'>('CAL_ONLY');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'ERRORS') {
      return log.type === 'ERROR' || log.type === 'TIMEOUT';
    }
    if (filter === 'CAL_ONLY') {
      return (
        log.type === 'TX' ||
        log.type === 'RX' ||
        log.type === 'STATUS' ||
        log.type === 'ERROR' ||
        log.type === 'TIMEOUT'
      );
    }
    return true;
  });

  const formatLogTime = (ts: number) => {
    const d = new Date(ts);
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${d.toTimeString().split(' ')[0]}.${ms}`;
  };

  return (
    <div className="panel-glass rounded-xl overflow-hidden border-slate-800 font-mono text-xs shadow-xl">
      {/* Console Header */}
      <div className="p-3.5 border-b border-slate-800 bg-[#091122]/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold uppercase tracking-wider text-white text-xs">
            Serial Communication & Calibration Debug Console
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-400">
            {logs.length} logs
          </span>
          {isCalibrating && (
            <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>AWAITING RESPONSE</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Filter Tabs */}
          <div className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-[11px]">
            <button
              onClick={() => setFilter('CAL_ONLY')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'CAL_ONLY'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CAL Protocol
            </button>
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'ALL'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Messages
            </button>
            <button
              onClick={() => setFilter('ERRORS')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'ERRORS'
                  ? 'bg-rose-500/20 text-rose-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Errors & Timeouts
            </button>
          </div>

          {/* Auto scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded hover:bg-slate-800 ${
              autoScroll ? 'text-cyan-400' : 'text-slate-500'
            }`}
            title="Auto-scroll to latest"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
          </button>

          {/* Clear logs */}
          <button
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="p-1.5 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 disabled:opacity-30 transition-colors"
            title="Clear debug console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Processing Status Sub-Bar */}
      <div className="px-4 py-2 bg-[#060b17] border-b border-slate-800/80 flex items-center justify-between text-[11px]">
        <div className="flex items-center space-x-2 text-slate-300">
          <span className="text-slate-500 uppercase font-semibold">Active Status:</span>
          <span className="text-cyan-300 font-medium truncate max-w-xl">
            {statusText}
          </span>
        </div>
        <span className="text-slate-600 hidden sm:inline">
          Baud: 115200 · Format: Line-delimited \n
        </span>
      </div>

      {/* Terminal Messages Area */}
      <div
        ref={scrollRef}
        className="h-56 overflow-y-auto p-3 font-mono text-xs space-y-1.5 bg-[#050914]"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 italic space-y-1">
            <p>No calibration debug logs to display.</p>
            <span className="text-[11px]">Enter a volume in ml and click "Capture 20 Readings" to execute calibration.</span>
          </div>
        ) : (
          filteredLogs.map((log) => {
            let badgeClass = 'bg-slate-800 text-slate-400';
            let rowClass = 'text-slate-300 hover:bg-slate-900/50';

            if (log.type === 'TX') {
              badgeClass = 'bg-sky-950 text-sky-400 border border-sky-800';
              rowClass = 'text-sky-300 bg-sky-950/20';
            } else if (log.type === 'RX') {
              badgeClass = 'bg-emerald-950 text-emerald-400 border border-emerald-800';
              rowClass = 'text-emerald-300 bg-emerald-950/20';
            } else if (log.type === 'STATUS') {
              badgeClass = 'bg-cyan-950 text-cyan-400 border border-cyan-800';
              rowClass = 'text-cyan-200';
            } else if (log.type === 'ERROR') {
              badgeClass = 'bg-rose-950 text-rose-400 border border-rose-800 font-bold';
              rowClass = 'text-rose-300 bg-rose-950/30';
            } else if (log.type === 'TIMEOUT') {
              badgeClass = 'bg-amber-950 text-amber-400 border border-amber-800 font-bold';
              rowClass = 'text-amber-300 bg-amber-950/30';
            }

            return (
              <div
                key={log.id}
                className={`flex items-start space-x-2 py-1 px-2 rounded transition-colors ${rowClass}`}
              >
                <span className="text-slate-600 text-[10px] w-20 shrink-0 select-none">
                  {formatLogTime(log.timestamp)}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold shrink-0 ${badgeClass}`}>
                  {log.type}
                </span>
                <span className="break-all whitespace-pre-wrap flex-1">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

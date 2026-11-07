import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, Trash2, ArrowDownCircle, CheckSquare, Square, X, Maximize2, Minimize2 } from 'lucide-react';
import { SerialMessageLog } from '../../types';
import { formatTimestamp } from '../../utils/formatters';

interface SerialConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  messages: SerialMessageLog[];
  onSendCommand: (cmd: string) => Promise<void>;
  isConnected: boolean;
}

export const SerialConsole: React.FC<SerialConsoleProps> = ({
  isOpen,
  onClose,
  messages,
  onSendCommand,
  isConnected,
}) => {
  const [inputCmd, setInputCmd] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'TX' | 'RX'>('ALL');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCmd.trim() || !isConnected) return;
    try {
      await onSendCommand(inputCmd.trim());
      setInputCmd('');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (filter !== 'ALL' && m.direction !== filter) return false;
    if (search && !m.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div
      className={`fixed z-50 transition-all duration-300 panel-glass shadow-2xl flex flex-col border-cyan-500/30 ${
        isExpanded
          ? 'inset-4 rounded-xl'
          : 'bottom-4 right-4 w-[600px] max-w-[95vw] h-[450px] rounded-xl'
      }`}
    >
      {/* Console Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-[#091122]/90 rounded-t-xl">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider uppercase text-cyan-300">
            ESP32 Serial Bus Monitor
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
            {messages.length} msgs
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* TX/RX Filter */}
          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs font-mono">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2 py-0.5 rounded ${filter === 'ALL' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'}`}
            >
              ALL
            </button>
            <button
              onClick={() => setFilter('RX')}
              className={`px-2 py-0.5 rounded ${filter === 'RX' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400'}`}
            >
              RX
            </button>
            <button
              onClick={() => setFilter('TX')}
              className={`px-2 py-0.5 rounded ${filter === 'TX' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'}`}
            >
              TX
            </button>
          </div>

          {/* Auto Scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded hover:bg-slate-800 text-xs flex items-center space-x-1 ${
              autoScroll ? 'text-cyan-400' : 'text-slate-500'
            }`}
            title="Auto-scroll to bottom"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
          </button>

          {/* Expand / Minimize */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-rose-950/50 text-slate-400 hover:text-rose-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-1.5 bg-[#060b17] border-b border-slate-900 flex items-center justify-between text-xs">
        <input
          type="text"
          placeholder="Filter messages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent text-slate-300 placeholder-slate-600 focus:outline-none font-mono w-64"
        />
        <span className="text-slate-600 font-mono text-[11px]">
          115200 8-N-1 · Line: \n
        </span>
      </div>

      {/* Messages Terminal Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 bg-[#060a14]/95"
      >
        {filteredMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 italic">
            No serial messages to display
          </div>
        ) : (
          filteredMessages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start space-x-2 py-0.5 px-1.5 rounded transition-colors ${
                m.direction === 'TX'
                  ? 'bg-sky-950/20 text-sky-300'
                  : m.parsedType === 'ERROR'
                  ? 'bg-rose-950/30 text-rose-400 font-semibold'
                  : m.parsedType === 'CAL_ACCEPTED'
                  ? 'bg-emerald-950/30 text-emerald-400 font-semibold'
                  : 'text-slate-300 hover:bg-slate-900/60'
              }`}
            >
              <span className="text-slate-600 select-none text-[10px] w-14 shrink-0">
                {formatTimestamp(m.timestamp)}
              </span>
              <span
                className={`select-none font-bold text-[10px] px-1 rounded shrink-0 ${
                  m.direction === 'TX'
                    ? 'bg-sky-900/40 text-sky-400'
                    : 'bg-emerald-900/40 text-emerald-400'
                }`}
              >
                {m.direction}
              </span>
              <span className="break-all whitespace-pre-wrap">{m.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Command Send Bar */}
      <form
        onSubmit={handleSubmit}
        className="p-2 border-t border-slate-800 bg-[#091122] flex items-center space-x-2 rounded-b-xl"
      >
        <span className="text-cyan-400 font-mono font-bold text-xs pl-2">&gt;</span>
        <input
          type="text"
          value={inputCmd}
          onChange={(e) => setInputCmd(e.target.value)}
          placeholder={
            isConnected
              ? 'Send command (e.g. GET_DATA, READ_VOLUME, CAL,100, STOP)...'
              : 'Connect ESP32 to send serial commands'
          }
          disabled={!isConnected}
          className="flex-1 bg-slate-900/80 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-cyan-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isConnected || !inputCmd.trim()}
          className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs flex items-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};


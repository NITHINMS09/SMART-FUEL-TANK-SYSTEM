import React, { useState } from 'react';
import {
  Usb,
  Power,
  PowerOff,
  AlertOctagon,
  Terminal,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { ConnectionState, MotorStatus } from '../../types';
import { StatusBadge } from './StatusBadge';

interface HeaderProps {
  connectionState: ConnectionState;
  systemReady: boolean;
  motorStatus: MotorStatus;
  baudRate: number;
  onBaudRateChange: (baud: number) => void;
  onConnect: () => Promise<boolean>;
  onDisconnect: () => Promise<void>;
  onEmergencyStop: () => Promise<void>;
  onToggleConsole: () => void;
  isConsoleOpen: boolean;
  isWebSerialSupported: boolean;
  errorMessage: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  connectionState,
  systemReady,
  motorStatus,
  baudRate,
  onBaudRateChange,
  onConnect,
  onDisconnect,
  onEmergencyStop,
  onToggleConsole,
  isConsoleOpen,
  isWebSerialSupported,
  errorMessage,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectClick = async () => {
    setIsConnecting(true);
    try {
      await onConnect();
    } finally {
      setIsConnecting(false);
    }
  };

  const baudOptions = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

  return (
    <header className="sticky top-0 z-40 bg-[#070b14]/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Branding & Hardware Status */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center shadow-glow-cyan">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm font-bold tracking-wider text-slate-100 font-mono uppercase">
                  ESP32-S3 Smart Tank
                </h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/50 text-cyan-400 font-mono">
                  v2.0-PRO
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400">
                Liquid Measurement & Auto-Cap Center
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-2 pl-4 border-l border-slate-800">
            <StatusBadge status={connectionState} size="sm" />
            {systemReady && (
              <span className="inline-flex items-center text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                SYSTEM READY
              </span>
            )}
            {motorStatus === 'RUNNING' && (
              <span className="inline-flex items-center text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded animate-pulse">
                MOTOR RUNNING
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions, Connection, Emergency Stop */}
        <div className="flex items-center space-x-3">
          {/* Web Serial warning if not supported */}
          {!isWebSerialSupported && (
            <div className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2.5 py-1 rounded">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Web Serial requires Chrome or Edge</span>
            </div>
          )}

          {/* Baud Rate selector */}
          <div className="hidden lg:flex items-center space-x-1 text-xs font-mono">
            <span className="text-slate-500">Baud:</span>
            <select
              value={baudRate}
              onChange={(e) => onBaudRateChange(Number(e.target.value))}
              disabled={connectionState === 'CONNECTED'}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-cyan-400 text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            >
              {baudOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Serial Monitor Toggle */}
          <button
            onClick={onToggleConsole}
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs flex items-center space-x-2 transition-all ${
              isConsoleOpen
                ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-glow-cyan'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Serial Bus</span>
          </button>

          {/* Connect / Disconnect Buttons */}
          {connectionState === 'CONNECTED' ? (
            <button
              onClick={onDisconnect}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-mono text-xs flex items-center space-x-2 transition-all"
            >
              <PowerOff className="w-3.5 h-3.5 text-slate-400" />
              <span>Disconnect</span>
            </button>
          ) : (
            <button
              onClick={handleConnectClick}
              disabled={isConnecting || !isWebSerialSupported}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-semibold text-xs flex items-center space-x-2 shadow-glow-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Usb className="w-3.5 h-3.5" />
              )}
              <span>{isConnecting ? 'Connecting...' : 'Connect ESP32'}</span>
            </button>
          )}

          {/* EMERGENCY STOP BUTTON */}
          <button
            onClick={onEmergencyStop}
            className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-mono font-bold text-xs flex items-center space-x-2 shadow-glow-red transition-all"
            title="Immediately cuts motor power and flushes queue"
          >
            <AlertOctagon className="w-4 h-4 animate-pulse" />
            <span className="tracking-wide">E-STOP</span>
          </button>
        </div>
      </div>

      {/* Error Banner if any */}
      {errorMessage && (
        <div className="mt-2 text-xs font-mono text-rose-300 bg-rose-950/50 border border-rose-800/60 px-3 py-1.5 rounded-lg flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </header>
  );
};

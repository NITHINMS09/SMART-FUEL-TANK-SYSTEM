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
  Menu,
  X,
  Radio,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { ConnectionState, MotorStatus, SyncConnectionStatus } from '../../types';
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
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
  // Multi-Device Sync props
  syncStatus?: SyncConnectionStatus;
  isThisDeviceGateway?: boolean;
  isGatewayOnline?: boolean;
  isAuthenticated?: boolean;
  onOpenAuthModal?: () => void;
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
  onToggleMobileMenu,
  isMobileMenuOpen = false,
  syncStatus = 'DISCONNECTED',
  isThisDeviceGateway = false,
  isGatewayOnline = false,
  isAuthenticated = false,
  onOpenAuthModal,
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
    <header className="sticky top-0 z-40 bg-[#070b14]/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-6 py-2.5 sm:py-3.5">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Mobile Menu Toggle & Branding */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          {/* Mobile Navigation Drawer Toggle */}
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors focus:outline-none shrink-0"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5 text-cyan-400" />
            ) : (
              <Menu className="w-5 h-5 text-slate-300" />
            )}
          </button>

          {/* Logo & Product Title */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center shadow-glow-cyan shrink-0">
              <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <h1 className="text-xs sm:text-sm font-bold tracking-wider text-slate-100 font-mono uppercase truncate">
                  Smart Tank
                </h1>
                <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/50 text-cyan-400 font-mono font-bold shrink-0">
                  v2.0
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] font-mono text-slate-400 truncate hidden xs:block">
                Liquid Measurement &amp; Cap Center
              </p>
            </div>
          </div>

          {/* Status Badges (Tablet and Desktop) */}
          <div className="hidden lg:flex items-center space-x-2 pl-3 border-l border-slate-800">
            {isThisDeviceGateway ? (
              <StatusBadge status={connectionState} size="sm" />
            ) : (
              <span
                className={`inline-flex items-center text-xs font-mono px-2 py-0.5 rounded border ${
                  isGatewayOnline
                    ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
                    : 'text-rose-400 bg-rose-950/40 border-rose-800/40'
                }`}
              >
                <Radio className={`w-3 h-3 mr-1.5 ${isGatewayOnline ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
                {isGatewayOnline ? 'ESP32 SYNCED' : 'GATEWAY OFFLINE'}
              </span>
            )}
            {systemReady && (
              <span className="inline-flex items-center text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                READY
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
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
          {/* Multi-Device Cloud Sync & Remote Auth Button */}
          {onOpenAuthModal && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border font-mono text-xs flex items-center space-x-1.5 transition-all cursor-pointer min-h-[36px] ${
                isThisDeviceGateway
                  ? 'bg-cyan-950/50 border-cyan-700/60 text-cyan-300 hover:border-cyan-400'
                  : isAuthenticated
                  ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300 hover:border-emerald-400'
                  : 'bg-amber-950/50 border-amber-700/60 text-amber-300 hover:border-amber-400'
              }`}
              title={
                isThisDeviceGateway
                  ? 'Hosting Authoritative Hardware Gateway'
                  : isAuthenticated
                  ? 'Remote Client Authenticated (PIN Verified)'
                  : 'Remote Client - Click to enter Security PIN'
              }
            >
              {isThisDeviceGateway ? (
                <>
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">HOST</span>
                </>
              ) : isAuthenticated ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">AUTH OK</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">AUTH PIN</span>
                </>
              )}
            </button>
          )}

          {/* Web Serial warning if not supported */}
          {!isWebSerialSupported && !isGatewayOnline && (
            <div className="hidden sm:flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2.5 py-1 rounded">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Chrome / Edge required</span>
            </div>
          )}

          {/* Baud Rate selector (Desktop) */}
          <div className="hidden xl:flex items-center space-x-1 text-xs font-mono">
            <span className="text-slate-500">Baud:</span>
            <select
              value={baudRate}
              onChange={(e) => onBaudRateChange(Number(e.target.value))}
              disabled={connectionState === 'CONNECTED'}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-cyan-400 text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
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
            className={`p-1.5 sm:px-3 sm:py-1.5 rounded-lg border font-mono text-xs flex items-center space-x-1.5 transition-all cursor-pointer ${
              isConsoleOpen
                ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-glow-cyan'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
            title="Toggle Serial Bus Console"
          >
            <Terminal className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
            <span className="hidden sm:inline">Serial Bus</span>
          </button>

          {/* Connect / Disconnect Buttons */}
          {connectionState === 'CONNECTED' ? (
            <button
              onClick={onDisconnect}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-mono text-xs flex items-center space-x-1.5 transition-all cursor-pointer min-h-[36px]"
              title="Disconnect ESP32 USB COM"
            >
              <PowerOff className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          ) : (
            <button
              onClick={handleConnectClick}
              disabled={isConnecting || !isWebSerialSupported}
              className="px-3 sm:px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs flex items-center space-x-1.5 shadow-glow-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px] cursor-pointer"
              title="Connect via Web Serial API"
            >
              {isConnecting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Usb className="w-3.5 h-3.5" />
              )}
              <span>{isConnecting ? '...' : 'Connect'}</span>
            </button>
          )}

          {/* EMERGENCY STOP BUTTON */}
          <button
            onClick={onEmergencyStop}
            className="px-2.5 sm:px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-mono font-extrabold text-xs flex items-center space-x-1.5 shadow-glow-red transition-all cursor-pointer min-h-[36px]"
            title="Immediately cuts motor power and flushes queue"
          >
            <AlertOctagon className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
            <span className="tracking-wide">E-STOP</span>
          </button>
        </div>
      </div>

      {/* Error Banner if any */}
      {errorMessage && (
        <div className="mt-2 text-xs font-mono text-rose-300 bg-rose-950/50 border border-rose-800/60 px-3 py-1.5 rounded-lg flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="truncate">{errorMessage}</span>
        </div>
      )}
    </header>
  );
};

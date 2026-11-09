import React, { useState } from 'react';
import {
  Shield,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  X,
  Radio,
  Server,
  Lock,
  Unlock,
  RefreshCw,
  Activity,
  Globe,
  Wifi,
} from 'lucide-react';

interface RemoteAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onAuthenticate: (pin: string) => Promise<{ success: boolean; error?: string }>;
  onLogout: () => void;
  serverUrl: string;
  apiUrl?: string;
  onUpdateServerUrl: (url: string) => void;
  onCheckHealth?: (url?: string) => Promise<{ ok: boolean; latencyMs: number; statusText: string; details?: any }>;
  isGatewayOnline: boolean;
  isThisDeviceGateway: boolean;
  syncStatus?: string;
}

export const RemoteAuthModal: React.FC<RemoteAuthModalProps> = ({
  isOpen,
  onClose,
  isAuthenticated,
  onAuthenticate,
  onLogout,
  serverUrl,
  apiUrl,
  onUpdateServerUrl,
  onCheckHealth,
  isGatewayOnline,
  isThisDeviceGateway,
  syncStatus = 'CONNECTED',
}) => {
  const [pin, setPin] = useState('');
  const [customUrl, setCustomUrl] = useState(serverUrl);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    checking: boolean;
    result?: { ok: boolean; latencyMs: number; statusText: string };
  }>({ checking: false });

  if (!isOpen) return null;

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setError(null);
    setIsVerifying(true);
    try {
      const res = await onAuthenticate(pin.trim());
      if (res.success) {
        setPin('');
        onClose();
      } else {
        setError(res.error || 'Invalid Security PIN. Authorization rejected.');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUrlSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateServerUrl(customUrl.trim());
    setShowConfig(false);
  };

  const handleTestHealth = async () => {
    if (!onCheckHealth) return;
    setHealthStatus({ checking: true });
    try {
      const result = await onCheckHealth(customUrl);
      setHealthStatus({ checking: false, result });
    } catch (err: any) {
      setHealthStatus({
        checking: false,
        result: { ok: false, latencyMs: 0, statusText: err?.message || 'Check failed' },
      });
    }
  };

  const applyPreset = (presetUrl: string) => {
    setCustomUrl(presetUrl);
    onUpdateServerUrl(presetUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#0b1222] border border-cyan-500/40 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-5 font-mono text-xs relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-cyan-950/70 border border-cyan-500/40 text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Remote Hardware Authorization
              </h3>
              <p className="text-[11px] text-slate-400">
                Multi-Device Synchronization &amp; Control
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Role & Gateway Status Banner */}
        <div className="p-3 rounded-xl bg-[#070c18] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase text-slate-500 font-bold">This Device Mode:</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                isThisDeviceGateway
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                  : 'bg-sky-950 text-sky-300 border border-sky-800'
              }`}
            >
              {isThisDeviceGateway ? 'ESP32 HARDWARE GATEWAY' : 'REMOTE CLIENT NODE'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
            <span className="text-slate-400">Hardware Gateway Status:</span>
            <span
              className={`font-bold flex items-center space-x-1 ${
                isGatewayOnline ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  isGatewayOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <span>{isGatewayOnline ? 'ONLINE & LINKED' : 'OFFLINE'}</span>
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
            <span className="text-slate-400">Relay Socket Link:</span>
            <span
              className={`font-bold flex items-center space-x-1 ${
                syncStatus === 'CONNECTED' ? 'text-emerald-400' : syncStatus === 'CONNECTING' ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              <Activity className="w-3 h-3" />
              <span>{syncStatus}</span>
            </span>
          </div>
        </div>

        {/* Authorization Form or Authenticated Status */}
        {isAuthenticated ? (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-950/80 border border-emerald-400 text-emerald-300 flex items-center justify-center mx-auto shadow-glow-green">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-white uppercase tracking-wider block text-xs">
                Remote Control Authorized
              </span>
              <p className="text-[11px] text-emerald-300/80 mt-1">
                You can operate CAP OPEN, CAP CLOSE, and motor control commands remotely from this device.
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold transition-all cursor-pointer"
            >
              Revoke Authorization
            </button>
          </div>
        ) : (
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 font-semibold mb-1.5 uppercase text-[11px]">
                Enter Remote Control Security PIN
              </label>
              <div className="relative">
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="e.g. 124580"
                  maxLength={16}
                  required
                  autoFocus
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg px-4 py-2.5 text-base font-bold text-cyan-300 placeholder-slate-600 focus:outline-none tracking-widest text-center"
                />
                <KeyRound className="absolute right-3 top-3 w-4 h-4 text-slate-500" />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Default PIN is <code className="text-cyan-400 font-bold">124580</code>. Required to send CAP OPEN/CLOSE commands.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-950/80 border border-rose-500/80 rounded-xl text-rose-200 text-[11px] space-y-1">
                <div className="flex items-center space-x-1.5 text-rose-400 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Authentication Notice</span>
                </div>
                <p className="text-rose-300/90 leading-relaxed">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying || !pin.trim()}
              className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-slate-950 font-bold uppercase tracking-wider flex items-center justify-center space-x-2 shadow-glow-cyan transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[42px] cursor-pointer"
            >
              {isVerifying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              <span>{isVerifying ? 'Verifying PIN...' : 'Authorize Remote Control'}</span>
            </button>
          </form>
        )}

        {/* Sync Server Configuration Accordion */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center space-x-1.5 text-[11px] text-slate-400 hover:text-cyan-300 transition-colors py-1 cursor-pointer"
            >
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>Backend &amp; Relay Server Settings</span>
              <span className="text-[10px] text-slate-500">{showConfig ? '▲' : '▼'}</span>
            </button>

            {onCheckHealth && (
              <button
                type="button"
                onClick={handleTestHealth}
                disabled={healthStatus.checking}
                className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-500/50 flex items-center space-x-1 cursor-pointer"
                title="Test whether the backend server is reachable"
              >
                {healthStatus.checking ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Activity className="w-3 h-3 text-cyan-400" />
                )}
                <span>{healthStatus.checking ? 'Testing...' : 'Test Ping'}</span>
              </button>
            )}
          </div>

          {healthStatus.result && (
            <div
              className={`p-2 rounded-lg border text-[10px] flex items-center justify-between ${
                healthStatus.result.ok
                  ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-600/60 text-rose-300'
              }`}
            >
              <span>Server Reachability:</span>
              <span className="font-bold">{healthStatus.result.statusText}</span>
            </div>
          )}

          {showConfig && (
            <form onSubmit={handleUrlSave} className="space-y-3 bg-[#070c18] p-3 rounded-lg border border-slate-800">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
                  WebSocket Relay URL
                </label>
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="wss://... or ws://localhost:4001"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-cyan-300 font-mono text-[11px] focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* Quick Presets */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Quick Presets:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset('wss://smart-fuel-tank-system.onrender.com')}
                    className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500 text-slate-300 font-mono text-[10px] text-left flex items-center space-x-1 cursor-pointer"
                  >
                    <Globe className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="truncate">Cloud (Render)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('ws://localhost:4001')}
                    className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500 text-slate-300 font-mono text-[10px] text-left flex items-center space-x-1 cursor-pointer"
                  >
                    <Wifi className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">Localhost (:4001)</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer"
              >
                Save &amp; Reconnect
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

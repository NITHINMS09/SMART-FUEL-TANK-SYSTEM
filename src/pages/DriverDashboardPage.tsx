import React, { useState, useEffect, useMemo } from 'react';
import {
  Fuel,
  Lock,
  Unlock,
  AlertTriangle,
  Radio,
  CheckCircle2,
  Cpu,
  Power,
  RotateCw,
  Compass,
  Gauge as GaugeIcon,
  Zap,
} from 'lucide-react';
import {
  AutomationFeedbackState,
  CalibrationPoint,
  ConnectionState,
  InterpolationResult,
  LoadCellStats,
  MotorStatus,
} from '../types';
import { formatNumber } from '../utils/formatters';

interface DriverDashboardPageProps {
  volumeInterpolation: InterpolationResult;
  stats: LoadCellStats;
  calibrationPoints: CalibrationPoint[];
  capState: 'OPEN' | 'CLOSED';
  systemState?: string;
  isAutomationRunning: boolean;
  motorStatus: MotorStatus;
  connectionState: ConnectionState;
  isThisDeviceGateway?: boolean;
  isGatewayOnline?: boolean;
  gatewayMessage?: string;
  isAuthenticated?: boolean;
  onRequestAuth?: () => void;
  onTriggerCapClose: () => Promise<void>;
  onTriggerCapOpen: () => Promise<void>;
}

export const DriverDashboardPage: React.FC<DriverDashboardPageProps> = ({
  volumeInterpolation,
  stats,
  calibrationPoints,
  capState,
  systemState,
  isAutomationRunning,
  motorStatus,
  connectionState,
  isThisDeviceGateway = true,
  isGatewayOnline = false,
  gatewayMessage,
  isAuthenticated = false,
  onRequestAuth,
  onTriggerCapClose,
  onTriggerCapOpen,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Update clock every second for cockpit digital display
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate maximum tank capacity from confirmed points or default to 1000 ml
  const maxCapacity = useMemo(() => {
    const validPoints = calibrationPoints.filter((p) => p.status === 'CONFIRMED');
    if (validPoints.length > 0) {
      const maxVol = Math.max(...validPoints.map((p) => p.volumeMl));
      if (maxVol > 0) return maxVol;
    }
    return 1000;
  }, [calibrationPoints]);

  // Current volume and percentage calculation
  const currentVolumeMl =
    volumeInterpolation.volumeMl !== null ? Math.max(0, volumeInterpolation.volumeMl) : null;

  const fuelPercentage = useMemo(() => {
    if (currentVolumeMl === null || maxCapacity <= 0) return 0;
    return Math.min(100, Math.max(0, (currentVolumeMl / maxCapacity) * 100));
  }, [currentVolumeMl, maxCapacity]);

  // Low fuel threshold: below 15%
  const isLowFuel = currentVolumeMl !== null && fuelPercentage <= 15;

  // Angle for Fuel Needle: Sweep from -120° (Empty) to +120° (Full)
  // Total arc = 240 degrees. -120° is bottom-left, 0° is top, +120° is bottom-right.
  const fuelNeedleAngle = useMemo(() => {
    if (currentVolumeMl === null) return -120; // Rest at Empty
    return -120 + (fuelPercentage / 100) * 240;
  }, [currentVolumeMl, fuelPercentage]);

  // Speedometer Needle: Resting at cruising 60 km/h (sweep -120° to +120° for 0-240 km/h)
  const speedNeedleAngle = -60;

  // Control Disabled check considering gateway and client modes
  const isControlDisabled =
    isProcessing ||
    isAutomationRunning ||
    motorStatus === 'RUNNING' ||
    (isThisDeviceGateway ? connectionState !== 'CONNECTED' : !isGatewayOnline);

  // Button Click Handlers
  const handleCapCloseClick = async () => {
    if (isControlDisabled) return;
    if (!isThisDeviceGateway && !isAuthenticated) {
      if (onRequestAuth) onRequestAuth();
      return;
    }
    setIsProcessing(true);
    try {
      await onTriggerCapClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapOpenClick = async () => {
    if (isControlDisabled) return;
    if (!isThisDeviceGateway && !isAuthenticated) {
      if (onRequestAuth) onRequestAuth();
      return;
    }
    setIsProcessing(true);
    try {
      await onTriggerCapOpen();
    } finally {
      setIsProcessing(false);
    }
  };

  // Pre-generate Fuel Gauge Ticks
  const fuelTicks = useMemo(() => {
    const ticks = [];
    const totalTicks = 24; // every 10 degrees from -120 to +120
    for (let i = 0; i <= totalTicks; i++) {
      const angle = -120 + i * 10;
      const rad = (angle * Math.PI) / 180;
      const isMajor = i % 6 === 0; // -120, -60, 0, +60, +120
      const isLow = angle <= -80; // first 15% is low fuel red zone

      const outerR = 142;
      const innerR = isMajor ? 122 : 130;

      const x1 = 180 + outerR * Math.sin(rad);
      const y1 = 180 - outerR * Math.cos(rad);
      const x2 = 180 + innerR * Math.sin(rad);
      const y2 = 180 - innerR * Math.cos(rad);

      let label = '';
      if (angle === -120) label = 'E';
      else if (angle === -60) label = '1/4';
      else if (angle === 0) label = '1/2';
      else if (angle === 60) label = '3/4';
      else if (angle === 120) label = 'F';

      const labelR = 104;
      const lx = 180 + labelR * Math.sin(rad);
      const ly = 180 - labelR * Math.cos(rad) + 4;

      ticks.push({ angle, x1, y1, x2, y2, isMajor, isLow, label, lx, ly });
    }
    return ticks;
  }, []);

  // Pre-generate Speedometer / Odometer Ticks (0 - 240 km/h)
  const speedTicks = useMemo(() => {
    const ticks = [];
    const totalTicks = 24; // 10 km/h steps
    for (let i = 0; i <= totalTicks; i++) {
      const speed = i * 10;
      const angle = -120 + (speed / 240) * 240;
      const rad = (angle * Math.PI) / 180;
      const isMajor = speed % 40 === 0; // 0, 40, 80, 120, 160, 200, 240
      const isRedline = speed >= 200;

      const outerR = 142;
      const innerR = isMajor ? 122 : 130;

      const x1 = 180 + outerR * Math.sin(rad);
      const y1 = 180 - outerR * Math.cos(rad);
      const x2 = 180 + innerR * Math.sin(rad);
      const y2 = 180 - innerR * Math.cos(rad);

      const labelR = 104;
      const lx = 180 + labelR * Math.sin(rad);
      const ly = 180 - labelR * Math.cos(rad) + 4;

      ticks.push({
        speed,
        angle,
        x1,
        y1,
        x2,
        y2,
        isMajor,
        isRedline,
        label: isMajor ? speed.toString() : '',
        lx,
        ly,
      });
    }
    return ticks;
  }, []);

  return (
    <div className="w-full min-h-[calc(100vh-4.5rem)] bg-[#050811] text-slate-100 flex flex-col justify-between p-3 sm:p-5 lg:p-8 rounded-xl sm:rounded-2xl border border-cyan-950/60 shadow-[0_0_50px_rgba(6,182,212,0.06)] relative overflow-hidden select-none">
      {/* Top Ambient Glow & HUD Header Bar */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-cyan-950/20 via-sky-950/5 to-transparent pointer-events-none" />

      {/* Cockpit HUD Bar */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-cyan-900/30 pb-3 sm:pb-4 mb-3 sm:mb-4">
        {/* Left: System / Vehicle Title */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] animate-pulse shrink-0" />
          <div>
            <h1 className="font-mono text-xs sm:text-base font-extrabold uppercase tracking-[0.2em] text-white flex items-center space-x-1.5 sm:space-x-2">
              <span>SMART TANK</span>
              <span className="text-cyan-400">COCKPIT</span>
            </h1>
            <p className="font-mono text-[9px] sm:text-[11px] text-cyan-500/70 tracking-wider">
              DIGITAL AUTOMOTIVE INSTRUMENT PANEL
            </p>
          </div>
        </div>

        {/* Center / Pill: Drive Mode & Hardware Link */}
        <div className="flex items-center space-x-2 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-slate-900/90 border border-slate-700 shadow-inner font-mono text-[11px] sm:text-xs font-bold">
          <span className="text-slate-500">P</span>
          <span className="text-slate-500">R</span>
          <span className="text-slate-500">N</span>
          <span className="text-cyan-300 bg-cyan-950/80 px-1.5 sm:px-2 py-0.5 rounded border border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.4)]">
            D [AUTO]
          </span>
          <span className="text-slate-600 mx-0.5 sm:mx-1">|</span>
          <span className="flex items-center space-x-1.5 text-[10px] sm:text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${
                (isThisDeviceGateway ? connectionState === 'CONNECTED' : isGatewayOnline)
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span
              className={
                (isThisDeviceGateway ? connectionState === 'CONNECTED' : isGatewayOnline)
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }
            >
              {isThisDeviceGateway
                ? connectionState === 'CONNECTED'
                  ? 'ESP32 LINKED'
                  : 'OFFLINE'
                : isGatewayOnline
                ? 'SYNC LINKED'
                : 'GATEWAY OFFLINE'}
            </span>
          </span>
        </div>

        {/* Right: Cockpit Clock & Telemetry Quick Read */}
        <div className="flex items-center space-x-3 sm:space-x-4 font-mono text-[10px] sm:text-xs">
          <div className="text-right hidden sm:block">
            <span className="text-[9px] sm:text-[10px] uppercase text-slate-500 block">SYSTEM TIME</span>
            <span className="text-cyan-300 font-bold tracking-widest">{currentTime || '--:--:--'}</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] sm:text-[10px] uppercase text-slate-500 block">LOAD CELL</span>
            <span
              className={`font-bold ${
                stats.stability === 'STABLE'
                  ? 'text-emerald-400'
                  : stats.stability === 'UNSTABLE'
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}
            >
              {stats.stability}
            </span>
          </div>
        </div>
      </div>

      {/* Prominent ESP32 Gateway Offline Status Banner (Requirement 2) */}
      {!isThisDeviceGateway && !isGatewayOnline && (
        <div className="relative z-20 mb-4 p-3.5 sm:p-4 rounded-xl bg-rose-950/90 border border-rose-500/80 shadow-[0_0_25px_rgba(244,63,94,0.4)] flex items-center space-x-3 text-rose-200 font-mono text-xs animate-pulse">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="min-w-0">
            <div className="font-extrabold uppercase tracking-wider text-rose-300 text-xs sm:text-sm">
              ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE
            </div>
            <div className="text-[10px] sm:text-[11px] text-rose-300/80 mt-0.5">
              The authoritative Web Serial hardware gateway (Laptop A) is disconnected. Live hardware telemetry is paused and remote cap controls are disabled.
            </div>
          </div>
        </div>
      )}

      {/* Main Cluster Stage: Gauges & Center Console */}
      <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center justify-center my-auto py-2 sm:py-4">
        {/* ================================================================ */}
        {/* LEFT GAUGE: ODOMETER & SPEEDOMETER CLUSTER (Cols 1-4)             */}
        {/* ================================================================ */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center">
          <div className="relative w-[260px] h-[260px] xs:w-[280px] xs:h-[280px] sm:w-[320px] sm:h-[320px] md:w-[340px] md:h-[340px] max-w-full aspect-square flex items-center justify-center">
            {/* Ambient Radial Backlight Glow */}
            <div className="absolute inset-4 rounded-full bg-cyan-950/20 blur-2xl pointer-events-none" />

            <svg
              className="w-full h-full drop-shadow-[0_0_20px_rgba(8,145,178,0.25)]"
              viewBox="0 0 360 360"
            >
              <defs>
                {/* Brushed Titanium Rim Gradient */}
                <radialGradient id="odoRimGradient" cx="50%" cy="50%" r="50%">
                  <stop offset="90%" stopColor="#0f172a" />
                  <stop offset="96%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#020617" />
                </radialGradient>

                {/* Dark Recessed Dial Gradient */}
                <radialGradient id="dialFace" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#090d16" />
                  <stop offset="75%" stopColor="#030712" />
                  <stop offset="100%" stopColor="#02040a" />
                </radialGradient>

                {/* Speed Needle Gradient */}
                <linearGradient id="speedNeedleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="60%" stopColor="#0284c7" />
                  <stop offset="100%" stopColor="#0369a1" />
                </linearGradient>

                {/* Center Hub Metallic Gradient */}
                <radialGradient id="centerHubGrad" cx="40%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#64748b" />
                  <stop offset="50%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#090d16" />
                </radialGradient>
              </defs>

              {/* Outer Bezel Rings */}
              <circle cx="180" cy="180" r="172" fill="none" stroke="#1e293b" strokeWidth="2" />
              <circle cx="180" cy="180" r="168" fill="url(#odoRimGradient)" stroke="#0ea5e9" strokeWidth="1" opacity="0.4" />
              <circle cx="180" cy="180" r="162" fill="url(#dialFace)" stroke="#0f172a" strokeWidth="3" />
              <circle cx="180" cy="180" r="148" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />

              {/* Dial Track Arc */}
              <path
                d="M 58.75 250 A 140 140 0 1 1 301.25 250"
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Redline Arc (200 - 240 km/h) */}
              <path
                d="M 278.9 220 A 140 140 0 0 1 301.25 250"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.8"
              />

              {/* Speedometer Ticks & Labels */}
              {speedTicks.map((tick, idx) => (
                <g key={idx}>
                  <line
                    x1={tick.x1}
                    y1={tick.y1}
                    x2={tick.x2}
                    y2={tick.y2}
                    stroke={
                      tick.isRedline
                        ? '#f43f5e'
                        : tick.isMajor
                        ? '#e2e8f0'
                        : '#475569'
                    }
                    strokeWidth={tick.isMajor ? 2.5 : 1.2}
                    strokeLinecap="round"
                  />
                  {tick.label && (
                    <text
                      x={tick.lx}
                      y={tick.ly}
                      fill={tick.isRedline ? '#fb7185' : '#94a3b8'}
                      fontSize={tick.isMajor ? '13' : '10'}
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {tick.label}
                    </text>
                  )}
                </g>
              ))}

              {/* Speedometer Needle */}
              <g
                style={{
                  transform: `rotate(${speedNeedleAngle}deg)`,
                  transformOrigin: '180px 180px',
                  transition: 'transform 1s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              >
                {/* Needle Glow */}
                <line
                  x1="180"
                  y1="180"
                  x2="180"
                  y2="46"
                  stroke="#38bdf8"
                  strokeWidth="6"
                  strokeLinecap="round"
                  opacity="0.25"
                />
                {/* Needle Blade */}
                <polygon
                  points="177,180 183,180 181,46 179,46"
                  fill="url(#speedNeedleGrad)"
                  filter="drop-shadow(0 0 6px #0284c7)"
                />
                {/* Needle Tip Highlight */}
                <circle cx="180" cy="46" r="2.5" fill="#e0f2fe" />
              </g>

              {/* Center Metallic Hub Cap */}
              <circle cx="180" cy="180" r="24" fill="url(#centerHubGrad)" stroke="#38bdf8" strokeWidth="1.5" />
              <circle cx="180" cy="180" r="14" fill="#090d16" stroke="#1e293b" strokeWidth="1" />
              <circle cx="180" cy="180" r="5" fill="#38bdf8" opacity="0.9" />
            </svg>

            {/* Odometer Drum Display Overlaid on Lower Center of Dial */}
            <div className="absolute bottom-8 xs:bottom-10 sm:bottom-11 flex flex-col items-center pointer-events-none">
              <span className="text-[9px] xs:text-[10px] font-mono font-extrabold uppercase tracking-widest text-cyan-400 mb-0.5 sm:mb-1 flex items-center space-x-1">
                <span>ODO</span>
              </span>

              {/* Classic / Modern Rolling Odometer Counter Box */}
              <div className="flex items-center bg-black/90 px-1.5 xs:px-2.5 py-0.5 sm:py-1 rounded-md border border-slate-700 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_0_10px_rgba(15,23,42,0.6)]">
                {/* 6 Digit Rollers */}
                {['0', '1', '2', '4', '5', '8'].map((digit, idx) => (
                  <div
                    key={idx}
                    className="w-4 h-5 xs:w-5 xs:h-6 mx-0.5 bg-gradient-to-b from-[#111827] via-[#1f2937] to-[#0b0f17] rounded flex items-center justify-center border-t border-b border-slate-600/80 shadow-inner"
                  >
                    <span className="font-mono text-xs xs:text-sm font-bold text-white tracking-wider">
                      {digit}
                    </span>
                  </div>
                ))}
                <span className="font-mono text-[9px] xs:text-[11px] font-bold text-slate-400 ml-1 uppercase">
                  km
                </span>
              </div>

              {/* Trip A Reference Readout */}
              <div className="mt-0.5 sm:mt-1 flex items-center space-x-1.5 font-mono text-[9px] sm:text-[10px] text-slate-500">
                <span>TRIP A</span>
                <span className="text-slate-300 font-semibold">342.1 km</span>
              </div>
            </div>
          </div>

          <span className="font-mono text-[11px] sm:text-xs font-bold text-slate-400 tracking-wider mt-1.5 sm:mt-2 uppercase text-center">
            VEHICLE ODOMETER &amp; SPEED
          </span>
        </div>

        {/* ================================================================ */}
        {/* CENTER CONSOLE: AUTOMOTIVE COCKPIT CAP CONTROLS (Cols 5-8)       */}
        {/* ================================================================ */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center space-y-4 sm:space-y-6 px-1 sm:px-2 w-full">
          {/* Central Prominent Cap Status Display */}
          <div
            className={`w-full max-w-xs sm:max-w-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 border transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden shadow-2xl ${
              capState === 'CLOSED'
                ? 'bg-gradient-to-b from-cyan-950/60 via-[#061224] to-[#040814] border-cyan-500/70 shadow-[0_0_35px_rgba(6,182,212,0.25)]'
                : 'bg-gradient-to-b from-amber-950/50 via-[#190f05] to-[#0c0803] border-amber-500/70 shadow-[0_0_35px_rgba(245,158,11,0.2)]'
            }`}
          >
            {/* Corner Cockpit Accent Decals */}
            <div className="absolute top-2 left-2 w-2 h-2 sm:w-2.5 sm:h-2.5 border-t-2 border-l-2 border-slate-500" />
            <div className="absolute top-2 right-2 w-2 h-2 sm:w-2.5 sm:h-2.5 border-t-2 border-r-2 border-slate-500" />
            <div className="absolute bottom-2 left-2 w-2 h-2 sm:w-2.5 sm:h-2.5 border-b-2 border-l-2 border-slate-500" />
            <div className="absolute bottom-2 right-2 w-2 h-2 sm:w-2.5 sm:h-2.5 border-b-2 border-r-2 border-slate-500" />

            <span className="text-[9px] sm:text-[10px] font-mono font-extrabold uppercase tracking-[0.2em] text-slate-400 mb-1.5 sm:mb-2">
              AUTOMOTIVE CAP MONITOR
            </span>

            {/* Status Icon */}
            <div
              className={`p-3 sm:p-4 rounded-full border mb-2 sm:mb-3 relative ${
                capState === 'CLOSED'
                  ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.5)]'
                  : 'bg-amber-950/80 border-amber-400 text-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.4)]'
              }`}
            >
              {capState === 'CLOSED' ? (
                <Lock className="w-7 h-7 sm:w-9 sm:h-9 fill-current" />
              ) : (
                <Unlock className="w-7 h-7 sm:w-9 sm:h-9" />
              )}
            </div>

            {/* Cap Status State Heading */}
            <h2
              className={`font-mono text-xl sm:text-3xl font-black uppercase tracking-widest ${
                capState === 'CLOSED'
                  ? 'text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]'
                  : 'text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.8)]'
              }`}
            >
              {capState === 'CLOSED' ? 'CAP CLOSED' : 'CAP OPEN'}
            </h2>

            {/* System Status Subtitle */}
            <div className="mt-2 sm:mt-3 px-2.5 sm:px-3 py-1 rounded-full bg-black/60 border border-slate-700 font-mono text-[10px] sm:text-[11px] text-slate-300">
              {systemState ||
                (capState === 'CLOSED'
                  ? 'AUTOMATION ACTIVE · MONITORING'
                  : 'AUTOMATION DISABLED · REFUEL READY')}
            </div>

            {/* Dynamic Status Activity Pulse */}
            {motorStatus === 'RUNNING' && (
              <div className="mt-2 text-[11px] sm:text-xs font-mono text-amber-400 flex items-center space-x-1.5 animate-pulse">
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>MOTOR ADJUSTING...</span>
              </div>
            )}
          </div>

          {/* Automotive Cockpit Dual Push-Buttons */}
          <div className="w-full max-w-xs sm:max-w-sm grid grid-cols-2 gap-3 sm:gap-4">
            {/* 1. CAP CLOSE BUTTON */}
            <button
              type="button"
              onClick={handleCapCloseClick}
              disabled={isControlDisabled}
              className={`group relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 min-h-[50px] sm:min-h-[64px] ${
                capState === 'CLOSED'
                  ? 'bg-gradient-to-b from-cyan-600 to-cyan-800 border-cyan-300 text-white shadow-[0_0_30px_rgba(6,182,212,0.6)]'
                  : 'bg-gradient-to-b from-[#0f172a] to-[#070b14] border-slate-700 hover:border-cyan-500 text-slate-200 shadow-lg'
              }`}
            >
              {/* LED Ring Glow */}
              <div
                className={`w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full border mb-1.5 sm:mb-2 transition-all ${
                  capState === 'CLOSED'
                    ? 'bg-cyan-200 border-white shadow-[0_0_12px_#ffffff]'
                    : 'bg-slate-800 border-slate-600'
                }`}
              />

              <div className="flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="font-mono text-xs sm:text-sm font-extrabold tracking-wider">CAP CLOSE</span>
              </div>
              <span className="font-mono text-[8px] sm:text-[9px] uppercase text-cyan-200/80 mt-0.5 sm:mt-1 text-center font-medium">
                ENABLE AUTO
              </span>
            </button>

            {/* 2. CAP OPEN BUTTON */}
            <button
              type="button"
              onClick={handleCapOpenClick}
              disabled={isControlDisabled}
              className={`group relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 min-h-[50px] sm:min-h-[64px] ${
                capState === 'OPEN'
                  ? 'bg-gradient-to-b from-amber-600 to-amber-800 border-amber-300 text-white shadow-[0_0_30px_rgba(245,158,11,0.6)]'
                  : 'bg-gradient-to-b from-[#0f172a] to-[#070b14] border-slate-700 hover:border-amber-500 text-slate-200 shadow-lg'
              }`}
            >
              {/* LED Ring Glow */}
              <div
                className={`w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full border mb-1.5 sm:mb-2 transition-all ${
                  capState === 'OPEN'
                    ? 'bg-amber-200 border-white shadow-[0_0_12px_#ffffff]'
                    : 'bg-slate-800 border-slate-600'
                }`}
              />

              <div className="flex items-center space-x-1.5">
                <Unlock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="font-mono text-xs sm:text-sm font-extrabold tracking-wider">CAP OPEN</span>
              </div>
              <span className="font-mono text-[8px] sm:text-[9px] uppercase text-amber-200/80 mt-0.5 sm:mt-1 text-center font-medium">
                DISABLE AUTO
              </span>
            </button>
          </div>

          {/* Subtle Driver Notice */}
          <div className="flex items-center space-x-1.5 text-[9px] sm:text-[10px] font-mono text-slate-500 tracking-wide text-center">
            <Radio className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400 shrink-0" />
            <span>RAW SENSOR: {formatNumber(stats.currentRaw)} ADC UNITS</span>
          </div>
        </div>

        {/* ================================================================ */}
        {/* RIGHT GAUGE: LIQUID FUEL METER CLUSTER (Cols 9-12)               */}
        {/* ================================================================ */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center">
          <div className="relative w-[260px] h-[260px] xs:w-[280px] xs:h-[280px] sm:w-[320px] sm:h-[320px] md:w-[340px] md:h-[340px] max-w-full aspect-square flex items-center justify-center">
            {/* Ambient Radial Backlight Glow (Dynamic Red for Low Fuel, Cyan for Normal) */}
            <div
              className={`absolute inset-4 rounded-full blur-2xl pointer-events-none transition-all duration-700 ${
                isLowFuel ? 'bg-rose-900/30' : 'bg-cyan-950/20'
              }`}
            />

            <svg
              className="w-full h-full drop-shadow-[0_0_20px_rgba(8,145,178,0.25)]"
              viewBox="0 0 360 360"
            >
              <defs>
                {/* Brushed Titanium Rim Gradient */}
                <radialGradient id="fuelRimGradient" cx="50%" cy="50%" r="50%">
                  <stop offset="90%" stopColor="#0f172a" />
                  <stop offset="96%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#020617" />
                </radialGradient>

                {/* Dark Recessed Dial Gradient */}
                <radialGradient id="fuelDialFace" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#090d16" />
                  <stop offset="75%" stopColor="#030712" />
                  <stop offset="100%" stopColor="#02040a" />
                </radialGradient>

                {/* Fuel Needle Gradient */}
                <linearGradient id="fuelNeedleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={isLowFuel ? '#f43f5e' : '#22d3ee'} />
                  <stop offset="60%" stopColor={isLowFuel ? '#e11d48' : '#0ea5e9'} />
                  <stop offset="100%" stopColor={isLowFuel ? '#be123c' : '#0284c7'} />
                </linearGradient>

                {/* Center Hub Metallic Gradient */}
                <radialGradient id="fuelCenterHubGrad" cx="40%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#64748b" />
                  <stop offset="50%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#090d16" />
                </radialGradient>
              </defs>

              {/* Outer Bezel Rings */}
              <circle cx="180" cy="180" r="172" fill="none" stroke="#1e293b" strokeWidth="2" />
              <circle cx="180" cy="180" r="168" fill="url(#fuelRimGradient)" stroke="#0ea5e9" strokeWidth="1" opacity="0.4" />
              <circle cx="180" cy="180" r="162" fill="url(#fuelDialFace)" stroke="#0f172a" strokeWidth="3" />
              <circle cx="180" cy="180" r="148" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />

              {/* Main Gauge Arc Track */}
              <path
                d="M 58.75 250 A 140 140 0 1 1 301.25 250"
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Low Fuel Warning Danger Arc (Empty to 15%) */}
              <path
                d="M 58.75 250 A 140 140 0 0 1 76.5 210"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.85"
              />

              {/* Liquid Fuel Ticks & Markings (E to F) */}
              {fuelTicks.map((tick, idx) => (
                <g key={idx}>
                  <line
                    x1={tick.x1}
                    y1={tick.y1}
                    x2={tick.x2}
                    y2={tick.y2}
                    stroke={
                      tick.isLow
                        ? '#f43f5e'
                        : tick.isMajor
                        ? '#e2e8f0'
                        : '#475569'
                    }
                    strokeWidth={tick.isMajor ? 2.5 : 1.2}
                    strokeLinecap="round"
                  />
                  {tick.label && (
                    <text
                      x={tick.lx}
                      y={tick.ly}
                      fill={tick.isLow ? '#fb7185' : '#94a3b8'}
                      fontSize={tick.isMajor ? '13' : '10'}
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {tick.label}
                    </text>
                  )}
                </g>
              ))}

              {/* Dynamic Animated Liquid Fuel Needle */}
              <g
                style={{
                  transform: `rotate(${fuelNeedleAngle}deg)`,
                  transformOrigin: '180px 180px',
                  transition: 'transform 0.8s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
                }}
              >
                {/* Needle Glow */}
                <line
                  x1="180"
                  y1="180"
                  x2="180"
                  y2="46"
                  stroke={isLowFuel ? '#f43f5e' : '#38bdf8'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  opacity="0.3"
                />
                {/* Needle Blade */}
                <polygon
                  points="177,180 183,180 181,46 179,46"
                  fill="url(#fuelNeedleGrad)"
                  filter={isLowFuel ? 'drop-shadow(0 0 6px #e11d48)' : 'drop-shadow(0 0 6px #0284c7)'}
                />
                {/* Needle Tip Highlight */}
                <circle
                  cx="180"
                  cy="46"
                  r="2.5"
                  fill={isLowFuel ? '#ffe4e6' : '#e0f2fe'}
                />
              </g>

              {/* Center Metallic Hub Cap */}
              <circle cx="180" cy="180" r="24" fill="url(#fuelCenterHubGrad)" stroke="#38bdf8" strokeWidth="1.5" />
              <circle cx="180" cy="180" r="14" fill="#090d16" stroke="#1e293b" strokeWidth="1" />
              <circle
                cx="180"
                cy="180"
                r="5"
                fill={isLowFuel ? '#f43f5e' : '#38bdf8'}
                opacity="0.9"
              />
            </svg>

            {/* Fuel Gauge Digital Readout & Low Level Indicator (Center Lower of Dial) */}
            <div className="absolute bottom-8 xs:bottom-10 sm:bottom-11 flex flex-col items-center pointer-events-none">
              {/* Low Fuel Warning Indicator */}
              {isLowFuel ? (
                <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-rose-950/90 border border-rose-500 text-rose-300 font-mono text-[9px] xs:text-[10px] font-extrabold animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.6)] mb-0.5 sm:mb-1">
                  <AlertTriangle className="w-2.5 h-2.5 xs:w-3 xs:h-3 text-rose-400" />
                  <span>LOW FUEL LEVEL</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-cyan-400 font-mono text-[9px] xs:text-[10px] uppercase font-bold tracking-widest mb-0.5 sm:mb-1">
                  <Fuel className="w-3 h-3 xs:w-3.5 xs:h-3.5" />
                  <span>FUEL VOLUME</span>
                </div>
              )}

              {/* Digital Volume Display in ml */}
              <div className="flex items-baseline space-x-1 bg-black/85 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md border border-slate-700/80 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
                <span className="font-mono text-xl sm:text-2xl font-black text-white tracking-tight">
                  {currentVolumeMl !== null ? formatNumber(currentVolumeMl, 1) : '—'}
                </span>
                <span className="font-mono text-[10px] sm:text-xs font-bold text-cyan-400 uppercase">ml</span>
              </div>

              {/* Percentage & Max Capacity */}
              <div className="mt-0.5 sm:mt-1 flex items-center space-x-1.5 sm:space-x-2 font-mono text-[9px] sm:text-[10px]">
                <span
                  className={`font-extrabold ${
                    isLowFuel ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {currentVolumeMl !== null ? `${fuelPercentage.toFixed(0)}%` : '0%'}
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">MAX {formatNumber(maxCapacity)} ml</span>
              </div>
            </div>
          </div>

          <span className="font-mono text-[11px] sm:text-xs font-bold text-slate-400 tracking-wider mt-1.5 sm:mt-2 uppercase text-center">
            LIQUID FUEL METER (LIVE)
          </span>
        </div>
      </div>

      {/* Bottom Automotive Status Strip */}
      <div className="relative z-10 pt-3 sm:pt-4 border-t border-cyan-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-4 font-mono text-[10px] sm:text-[11px] text-slate-400">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 uppercase">CALIBRATION:</span>
            <span
              className={`font-semibold ${
                volumeInterpolation.isCalibrated ? 'text-cyan-400' : 'text-amber-400'
              }`}
            >
              {volumeInterpolation.isCalibrated
                ? `${calibrationPoints.filter((p) => p.status === 'CONFIRMED').length} NVS POINTS`
                : 'UNCALIBRATED'}
            </span>
          </div>

          <span className="text-slate-700 hidden sm:inline">|</span>

          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 uppercase">MOTOR:</span>
            <span
              className={`font-semibold ${
                motorStatus === 'RUNNING'
                  ? 'text-amber-400 animate-pulse'
                  : motorStatus === 'IDLE'
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {motorStatus}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-slate-500 text-[9px] sm:text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block animate-ping shrink-0" />
          <span>REAL-TIME HARDWARE TELEMETRY</span>
        </div>
      </div>
    </div>
  );
};

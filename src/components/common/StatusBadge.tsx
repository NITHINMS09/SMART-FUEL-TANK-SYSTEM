import React from 'react';
import { StabilityStatus, ConnectionState, MotorStatus, HX711Status } from '../../types';

interface StatusBadgeProps {
  status:
    | StabilityStatus
    | ConnectionState
    | MotorStatus
    | HX711Status
    | 'CONFIRMED'
    | 'UNSAVED'
    | 'REJECTED'
    | 'OK'
    | 'OFFLINE';
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  let color = 'bg-slate-800 text-slate-300 border-slate-700';
  let dotColor = 'bg-slate-400';
  let pulse = false;

  switch (status) {
    case 'CONNECTED':
    case 'STABLE':
    case 'CONFIRMED':
    case 'OK':
    case 'COMPLETED':
      color = 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 shadow-glow-green';
      dotColor = 'bg-emerald-400';
      break;

    case 'CONNECTING':
    case 'RUNNING':
    case 'INITIALIZING':
      color = 'bg-cyan-950/60 text-cyan-400 border-cyan-500/40 shadow-glow-cyan';
      dotColor = 'bg-cyan-400';
      pulse = true;
      break;

    case 'UNSTABLE':
    case 'UNSAVED':
      color = 'bg-amber-950/60 text-amber-400 border-amber-500/40';
      dotColor = 'bg-amber-400';
      pulse = true;
      break;

    case 'ERROR':
    case 'REJECTED':
      color = 'bg-rose-950/60 text-rose-400 border-rose-500/40 shadow-glow-red';
      dotColor = 'bg-rose-400';
      break;

    case 'DISCONNECTED':
    case 'OFFLINE':
    case 'WAITING FOR READINGS':
    case 'IDLE':
    default:
      color = 'bg-slate-900/80 text-slate-400 border-slate-800';
      dotColor = 'bg-slate-500';
      break;
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 space-x-1.5',
    md: 'text-xs font-semibold px-2.5 py-1 space-x-2',
    lg: 'text-sm font-semibold px-3 py-1.5 space-x-2.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-md border font-mono tracking-wider transition-all duration-300 uppercase ${sizeClasses} ${color}`}
    >
      <span
        className={`w-2 h-2 rounded-full ${dotColor} ${pulse ? 'animate-ping' : ''}`}
      />
      <span>{status}</span>
    </span>
  );
};

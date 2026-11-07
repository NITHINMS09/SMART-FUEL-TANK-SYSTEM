import React from 'react';
import { LucideIcon } from 'lucide-react';

interface LiveCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon?: LucideIcon;
  variant?: 'cyan' | 'blue' | 'green' | 'amber' | 'red' | 'default';
  className?: string;
  badge?: React.ReactNode;
}

export const LiveCard: React.FC<LiveCardProps> = ({
  title,
  value,
  unit,
  subtext,
  icon: Icon,
  variant = 'cyan',
  className = '',
  badge,
}) => {
  const borderColors = {
    cyan: 'border-cyan-500/30 hover:border-cyan-400/60 shadow-glow-cyan',
    blue: 'border-sky-500/30 hover:border-sky-400/60 shadow-glow-blue',
    green: 'border-emerald-500/30 hover:border-emerald-400/60 shadow-glow-green',
    amber: 'border-amber-500/30 hover:border-amber-400/60',
    red: 'border-rose-500/30 hover:border-rose-400/60 shadow-glow-red',
    default: 'border-slate-800 hover:border-slate-700',
  }[variant];

  const iconColors = {
    cyan: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/40',
    blue: 'text-sky-400 bg-sky-950/40 border-sky-800/40',
    green: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
    amber: 'text-amber-400 bg-amber-950/40 border-amber-800/40',
    red: 'text-rose-400 bg-rose-950/40 border-rose-800/40',
    default: 'text-slate-400 bg-slate-900 border-slate-800',
  }[variant];

  const textColors = {
    cyan: 'text-cyan-400',
    blue: 'text-sky-400',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-rose-400',
    default: 'text-slate-200',
  }[variant];

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-[#0c1527]/80 backdrop-blur-md p-5 border transition-all duration-300 ${borderColors} ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        <div className="flex items-center space-x-2">
          {badge}
          {Icon && (
            <div className={`p-2 rounded-lg border ${iconColors}`}>
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-baseline space-x-2">
        <span className={`text-2xl lg:text-3xl font-mono font-bold tracking-tight ${textColors}`}>
          {value}
        </span>
        {unit && (
          <span className="text-sm font-mono font-medium text-slate-400">
            {unit}
          </span>
        )}
      </div>

      {subtext && (
        <div className="mt-2 text-xs font-mono text-slate-400 flex items-center space-x-1">
          <span>{subtext}</span>
        </div>
      )}
    </div>
  );
};


import React from 'react';
import {
  Gauge,
  LayoutDashboard,
  Activity,
  Scale,
  History,
  Sliders,
  Cog,
  Cpu,
  Settings,
  Database,
  ShieldCheck,
} from 'lucide-react';
import { OperatingMode } from '../../types';

export type PageId =
  | 'driver-dashboard'
  | 'dashboard'
  | 'live-monitoring'
  | 'calibration'
  | 'calibration-history'
  | 'motor-config'
  | 'motor-testing'
  | 'automation'
  | 'device-settings'
  | 'data-backup';

interface SidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  calibrationPointCount: number;
  motorProfileCount: number;
  mode: OperatingMode;
  isMotorRunning: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  calibrationPointCount,
  motorProfileCount,
  mode,
  isMotorRunning,
}) => {
  const navItems: {
    id: PageId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
    badgeColor?: string;
  }[] = [
    {
      id: 'driver-dashboard',
      label: 'Driver Dashboard',
      icon: Gauge,
      badge: 'CLUSTER',
      badgeColor: 'bg-cyan-950 text-cyan-300 border border-cyan-700/50',
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'live-monitoring',
      label: 'Live Monitoring',
      icon: Activity,
    },
    {
      id: 'calibration',
      label: 'Load Cell Calibration',
      icon: Scale,
      badge: calibrationPointCount,
      badgeColor: 'bg-cyan-950 text-cyan-400 border border-cyan-800/40',
    },
    {
      id: 'calibration-history',
      label: 'Calibration History',
      icon: History,
    },
    {
      id: 'motor-config',
      label: 'Motor Configuration',
      icon: Sliders,
      badge: motorProfileCount,
      badgeColor: 'bg-sky-950 text-sky-400 border border-sky-800/40',
    },
    {
      id: 'motor-testing',
      label: 'Motor Testing',
      icon: Cog,
      badge: isMotorRunning ? 'ACTIVE' : undefined,
      badgeColor: 'bg-emerald-950 text-emerald-400 border border-emerald-800/40 animate-pulse',
    },
    {
      id: 'automation',
      label: 'Automation',
      icon: Cpu,
      badge: mode,
      badgeColor: mode === 'AUTOMATIC' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/50' : 'bg-slate-900 text-slate-400 border border-slate-800',
    },
    {
      id: 'device-settings',
      label: 'Device Settings',
      icon: Settings,
    },
    {
      id: 'data-backup',
      label: 'Data Backup',
      icon: Database,
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#080d1a] border-r border-slate-800/80 flex flex-col justify-between select-none min-h-[calc(100vh-65px)]">
      {/* Navigation Links */}
      <div className="p-3 space-y-1">
        <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
          Navigation Control
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg font-mono text-xs transition-all duration-200 group text-left ${
                isActive
                  ? 'bg-cyan-950/60 text-cyan-300 font-semibold border border-cyan-500/40 shadow-glow-cyan'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive
                      ? 'text-cyan-400'
                      : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                    item.badgeColor || 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hardware Pin Status Quick Reference */}
      <div className="p-3 m-3 rounded-lg bg-[#050913] border border-slate-800/80 text-[11px] font-mono space-y-2">
        <div className="flex items-center justify-between text-slate-400 font-semibold">
          <span className="flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>ESP32-S3 Pin Map</span>
          </span>
          <span className="text-[10px] text-emerald-400">FIXED</span>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500">
          <div>HX711 DT: <span className="text-cyan-400">16</span></div>
          <div>HX711 SCK: <span className="text-cyan-400">17</span></div>
          <div>DRV STEP: <span className="text-cyan-400">4</span></div>
          <div>DRV DIR: <span className="text-cyan-400">5</span></div>
          <div>DRV EN: <span className="text-cyan-400">6</span></div>
          <div>BAUD: <span className="text-cyan-400">115200</span></div>
        </div>
      </div>
    </aside>
  );
};


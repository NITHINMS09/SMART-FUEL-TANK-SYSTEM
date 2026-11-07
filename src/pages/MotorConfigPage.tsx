import React, { useState } from 'react';
import { Sliders, Plus, Download, AlertTriangle, CheckCircle2, RotateCw, RotateCcw } from 'lucide-react';
import { MotorDirection, MotorProfile } from '../types';
import { MotorProfileTable } from '../components/motor/MotorProfileTable';
import { MotorProfileModal } from '../components/motor/MotorProfileModal';
import { StorageService } from '../services/storageService';

interface MotorConfigPageProps {
  profiles: MotorProfile[];
  onSaveProfile: (
    data: Omit<MotorProfile, 'id' | 'syncedToESP' | 'timestamp'>,
    existingId?: string
  ) => Promise<boolean>;
  onDeleteProfile: (id: string) => Promise<void>;
  onTestRotation: (type: 'OPEN' | 'CLOSE', degrees: number, direction: MotorDirection) => Promise<void>;
  isSaving: boolean;
  profileMessage: string | null;
  profileError: string | null;
  isMotorRunning: boolean;
}

export const MotorConfigPage: React.FC<MotorConfigPageProps> = ({
  profiles,
  onSaveProfile,
  onDeleteProfile,
  onTestRotation,
  isSaving,
  profileMessage,
  profileError,
  isMotorRunning,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<MotorProfile | null>(null);

  const handleOpenAdd = () => {
    setEditingProfile(null);
    setIsModalOpen(true);
  };

  const handleEdit = (profile: MotorProfile) => {
    setEditingProfile(profile);
    setIsModalOpen(true);
  };

  const handleExport = () => {
    const json = JSON.stringify(profiles, null, 2);
    StorageService.downloadJsonFile('esp32_smart_tank_motor_profiles.json', json);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-sky-950/60 border border-sky-800/40 text-sky-400 shadow-glow-blue">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase text-white tracking-wider">
              Dual Cap Open & Closed Motor Configuration
            </h2>
            <p className="text-slate-400 text-xs">
              Configure volume-dependent rotation angles, CW/CCW directions, and stepping profiles
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExport}
            disabled={profiles.length === 0}
            className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold flex items-center space-x-1.5 transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Export Profiles</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold flex items-center space-x-2 shadow-glow-cyan transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Volume Profile</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {profileMessage && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{profileMessage}</span>
        </div>
      )}

      {profileError && (
        <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-xs font-mono text-rose-300 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{profileError}</span>
        </div>
      )}

      {/* Profiles Table */}
      <MotorProfileTable
        profiles={profiles}
        onOpenAddModal={handleOpenAdd}
        onEditProfile={handleEdit}
        onDeleteProfile={onDeleteProfile}
        onTestRotation={onTestRotation}
        isMotorRunning={isMotorRunning}
      />

      {/* Add / Edit Profile Modal */}
      <MotorProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={onSaveProfile}
        initialProfile={editingProfile}
        isSaving={isSaving}
      />
    </div>
  );
};


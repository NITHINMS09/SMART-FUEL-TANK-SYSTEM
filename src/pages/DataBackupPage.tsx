import React, { useState, useRef } from 'react';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  ShieldCheck,
  Server,
} from 'lucide-react';
import {
  AutomationEvent,
  CalibrationPoint,
  ConnectionState,
  DeviceSettings,
  MotorProfile,
} from '../types';
import { StorageService } from '../services/storageService';
import { formatDateTime } from '../utils/formatters';

interface DataBackupPageProps {
  calibrationPoints: CalibrationPoint[];
  motorProfiles: MotorProfile[];
  settings: DeviceSettings;
  automationHistory: AutomationEvent[];
  connectionState: ConnectionState;
  onImportFullBackup: (
    points: CalibrationPoint[],
    profiles: MotorProfile[],
    settings?: DeviceSettings
  ) => void;
  onSyncWithESP32: () => Promise<void>;
}

export const DataBackupPage: React.FC<DataBackupPageProps> = ({
  calibrationPoints,
  motorProfiles,
  settings,
  automationHistory,
  connectionState,
  onImportFullBackup,
  onSyncWithESP32,
}) => {
  const [lastBackup, setLastBackup] = useState<string | null>(() =>
    StorageService.getLastBackupDate()
  );
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportFull = () => {
    const json = StorageService.exportFullBackup(
      calibrationPoints,
      motorProfiles,
      settings,
      automationHistory
    );
    StorageService.downloadJsonFile('esp32_smart_tank_full_backup.json', json);
    setLastBackup(new Date().toISOString());
  };

  const handleExportCal = () => {
    const json = JSON.stringify(calibrationPoints, null, 2);
    StorageService.downloadJsonFile('esp32_smart_tank_calibration.json', json);
  };

  const handleExportProfiles = () => {
    const json = JSON.stringify(motorProfiles, null, 2);
    StorageService.downloadJsonFile('esp32_smart_tank_motor_profiles.json', json);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportStatus(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const res = StorageService.parseImportData(content);

        if (!res.valid || !res.data) {
          setImportError(res.error || 'Failed to parse JSON file');
          return;
        }

        const confirmMsg =
          `Confirm restoring backup? This will replace current active configuration:\n` +
          `• ${res.data.calibrationPoints?.length || 0} Calibration Points\n` +
          `• ${res.data.motorProfiles?.length || 0} Motor Profiles\n` +
          `Are you sure you wish to proceed?`;

        if (window.confirm(confirmMsg)) {
          onImportFullBackup(
            res.data.calibrationPoints || [],
            res.data.motorProfiles || [],
            res.data.settings
          );
          setImportStatus('Backup successfully imported and loaded into active workspace!');
        }
      } catch (err: any) {
        setImportError(err.message || 'File read error');
      }
    };
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleManualSync = async () => {
    if (connectionState !== 'CONNECTED' || isSyncing) return;
    setIsSyncing(true);
    setImportStatus(null);
    try {
      await onSyncWithESP32();
      setImportStatus('ESP32 query sent (GET_DATA). Synchronizing authoritative NVS state...');
    } catch (err: any) {
      setImportError(`Sync failed: ${err.message}`);
    } finally {
      setTimeout(() => setIsSyncing(false), 2000);
    }
  };

  return (
    <div className="space-y-6 font-mono text-xs max-w-4xl">
      {/* Header */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shadow-glow-cyan">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase text-white tracking-wider">
              Data Backup & Hardware NVS Synchronization
            </h2>
            <p className="text-slate-400 text-xs">
              Complete JSON configuration export, import validation, and ESP32 NVS synchronization
            </p>
          </div>
        </div>

        {lastBackup && (
          <span className="text-[11px] text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            Last Backup: {formatDateTime(lastBackup)}
          </span>
        )}
      </div>

      {/* Authoritative Storage Disclaimer Card */}
      <div className="p-4 rounded-xl bg-[#091122] border border-cyan-500/40 space-y-2 text-cyan-200">
        <div className="flex items-center space-x-2 font-bold text-cyan-300 uppercase tracking-wide">
          <Server className="w-4 h-4" />
          <span>Authoritative Storage Principle</span>
        </div>
        <p className="text-slate-300 text-[11px] leading-relaxed">
          The ESP32-S3 onboard non-volatile storage (Preferences / NVS) is the authoritative hardware reference for all calibration points and motor rotation profiles. Browser local storage acts as a local fallback cache. Always synchronize with the physical device upon USB connection.
        </p>
      </div>

      {/* ESP32 Hardware Sync Action Card */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-sm font-bold text-white uppercase block">
            Synchronize with Connected ESP32 NVS
          </span>
          <p className="text-slate-400 text-[11px] mt-0.5">
            Transmits GET_DATA command over USB serial to read authoritative points directly from flash
          </p>
        </div>

        <button
          onClick={handleManualSync}
          disabled={connectionState !== 'CONNECTED' || isSyncing}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-slate-950 font-bold flex items-center space-x-2 shadow-glow-cyan transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Synchronizing...' : 'Query ESP32 NVS (GET_DATA)'}</span>
        </button>
      </div>

      {/* Notifications */}
      {importStatus && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{importStatus}</span>
        </div>
      )}

      {importError && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {/* Export Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Full Backup */}
        <div className="panel-glass rounded-xl p-5 border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="font-bold text-white uppercase block">Full System Backup</span>
            <p className="text-slate-400 text-[11px]">
              Complete archive containing calibration points, motor profiles, settings, and automation history.
            </p>
          </div>
          <button
            onClick={handleExportFull}
            className="w-full py-2.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/80 text-cyan-300 font-bold flex items-center justify-center space-x-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Full JSON</span>
          </button>
        </div>

        {/* Calibration Only */}
        <div className="panel-glass rounded-xl p-5 border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="font-bold text-white uppercase block">Calibration Points</span>
            <p className="text-slate-400 text-[11px]">
              Export {calibrationPoints.length} calibration references and raw ADC curves.
            </p>
          </div>
          <button
            onClick={handleExportCal}
            disabled={calibrationPoints.length === 0}
            className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold flex items-center justify-center space-x-2 transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Export Calibration</span>
          </button>
        </div>

        {/* Motor Profiles Only */}
        <div className="panel-glass rounded-xl p-5 border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="font-bold text-white uppercase block">Motor Profiles</span>
            <p className="text-slate-400 text-[11px]">
              Export {motorProfiles.length} volume-indexed dual open & closed rotation profiles.
            </p>
          </div>
          <button
            onClick={handleExportProfiles}
            disabled={motorProfiles.length === 0}
            className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold flex items-center justify-center space-x-2 transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Export Profiles</span>
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
          <Upload className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold uppercase text-white">
            Import Previously Exported JSON Backup
          </h3>
        </div>

        <p className="text-slate-400 leading-relaxed text-[11px]">
          Upload any previously exported JSON configuration file. The file will be structurally validated and require confirmation before overwriting active points.
        </p>

        <div className="flex items-center space-x-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".json,application/json"
            className="hidden"
            id="backup-file-upload"
          />
          <label
            htmlFor="backup-file-upload"
            className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold flex items-center space-x-2 cursor-pointer transition-colors"
          >
            <FileJson className="w-4 h-4 text-cyan-400" />
            <span>Select JSON Backup File</span>
          </label>
        </div>
      </div>
    </div>
  );
};

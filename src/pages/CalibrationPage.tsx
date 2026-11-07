import React, { useState } from 'react';
import { Scale, Download, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CalibrationPoint, ConnectionState, LoadCellStats, RawReading } from '../types';
import { CalibrationForm } from '../components/calibration/CalibrationForm';
import { CalibrationTable } from '../components/calibration/CalibrationTable';
import { CalibrationCurve } from '../components/calibration/CalibrationCurve';
import { StorageService } from '../services/storageService';

interface CalibrationPageProps {
  connectionState: ConnectionState;
  stats: LoadCellStats;
  recentReadings: RawReading[];
  points: CalibrationPoint[];
  isCalibrating: boolean;
  calibrationError: string | null;
  lastSavedMessage: string | null;
  stabilityThreshold: number;
  onStartCalibration: (volumeMl: number) => Promise<boolean>;
  onDeletePoint: (id: string) => Promise<void>;
  onUpdatePoint: (id: string, newVolume: number) => void;
  currentEstimatedVolume: number | null;
}

export const CalibrationPage: React.FC<CalibrationPageProps> = ({
  connectionState,
  stats,
  recentReadings,
  points,
  isCalibrating,
  calibrationError,
  lastSavedMessage,
  stabilityThreshold,
  onStartCalibration,
  onDeletePoint,
  onUpdatePoint,
  currentEstimatedVolume,
}) => {
  const [recalibratingVolume, setRecalibratingVolume] = useState<number | null>(null);

  const handleRecalibrate = async (volume: number) => {
    setRecalibratingVolume(volume);
    await onStartCalibration(volume);
    setRecalibratingVolume(null);
  };

  const handleExportPoints = () => {
    const json = JSON.stringify(points, null, 2);
    StorageService.downloadJsonFile('esp32_smart_tank_calibration_points.json', json);
  };

  return (
    <div className="space-y-6">
      {/* 1. Step-by-Step Calibration Form */}
      <CalibrationForm
        connectionState={connectionState}
        stats={stats}
        recentReadings={recentReadings}
        isCalibrating={isCalibrating}
        calibrationError={calibrationError}
        lastSavedMessage={lastSavedMessage}
        stabilityThreshold={stabilityThreshold}
        onStartCalibration={onStartCalibration}
      />

      {/* 2. Calibration Curve Visualizer */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <Scale className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-mono font-bold uppercase text-white tracking-wider">
                Linear Interpolation Calibration Curve
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Plots Water Volume (ml) against Raw ADC Strain Sensor Values
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2.5 py-1 rounded">
            {points.filter((p) => p.status === 'CONFIRMED').length} Points Plotted
          </span>
        </div>

        <CalibrationCurve
          points={points}
          currentRaw={stats.currentRaw}
          currentEstimatedVolume={currentEstimatedVolume}
        />
      </div>

      {/* 3. Calibration Points Table */}
      <CalibrationTable
        points={points}
        onDeletePoint={onDeletePoint}
        onUpdatePoint={onUpdatePoint}
        onRecalibrate={handleRecalibrate}
        onExport={handleExportPoints}
      />
    </div>
  );
};


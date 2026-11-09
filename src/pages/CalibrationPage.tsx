import React from 'react';
import { Scale } from 'lucide-react';
import {
  CalibrationPoint,
  ConnectionState,
  LoadCellStats,
  RawReading,
  CalResultData,
  CalibrationDebugLog,
} from '../types';
import { CalibrationForm } from '../components/calibration/CalibrationForm';
import { CalibrationTable } from '../components/calibration/CalibrationTable';
import { CalibrationCurve } from '../components/calibration/CalibrationCurve';
import { CalibrationDebugConsole } from '../components/calibration/CalibrationDebugConsole';
import { StorageService } from '../services/storageService';

interface CalibrationPageProps {
  connectionState: ConnectionState;
  stats: LoadCellStats;
  recentReadings: RawReading[];
  points: CalibrationPoint[];
  isCalibrating: boolean;
  calibrationError: string | null;
  lastSavedMessage: string | null;
  latestCalResult: CalResultData | null;
  calProcessingStatus: string;
  debugLogs: CalibrationDebugLog[];
  onClearDebugLogs: () => void;
  stabilityThreshold: number;
  onStartCalibration: (volumeMl: number) => Promise<boolean>;
  onCancelCalibration?: () => void;
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
  latestCalResult,
  calProcessingStatus,
  debugLogs,
  onClearDebugLogs,
  stabilityThreshold,
  onStartCalibration,
  onCancelCalibration,
  onDeletePoint,
  onUpdatePoint,
  currentEstimatedVolume,
}) => {
  const handleRecalibrate = async (volume: number) => {
    await onStartCalibration(volume);
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
        latestCalResult={latestCalResult}
        calProcessingStatus={calProcessingStatus}
        stabilityThreshold={stabilityThreshold}
        onStartCalibration={onStartCalibration}
        onCancelCalibration={onCancelCalibration}
      />

      {/* 2. Requirement 10: Dedicated Serial Communication Debug Console */}
      <CalibrationDebugConsole
        logs={debugLogs}
        onClearLogs={onClearDebugLogs}
        isCalibrating={isCalibrating}
        statusText={calProcessingStatus}
      />

      {/* 3. Calibration Curve Visualizer */}
      <div className="panel-glass rounded-xl p-4 sm:p-6 border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <Scale className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <h3 className="text-xs sm:text-sm font-mono font-bold uppercase text-white tracking-wider">
                Linear Interpolation Calibration Curve
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 font-mono">
                Plots Water Volume (ml) against Raw ADC Strain Sensor Values
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2.5 py-1 rounded">
            {points.filter((p) => p.status === 'CONFIRMED').length} Points Plotted
          </span>
        </div>

        <CalibrationCurve
          points={points}
          currentRaw={stats.currentRaw}
          currentEstimatedVolume={currentEstimatedVolume}
        />
      </div>

      {/* 4. Calibration Points Table */}
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

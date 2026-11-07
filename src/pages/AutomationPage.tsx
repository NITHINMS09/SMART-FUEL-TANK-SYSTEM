import React from 'react';
import {
  AutomationEvent,
  CalibrationPoint,
  ConnectionState,
  MotorProfile,
  OperatingMode,
} from '../types';
import { AutomationControl } from '../components/automation/AutomationControl';
import { AutomationHistory } from '../components/automation/AutomationHistory';
import { AutoCloseProgress } from '../services/automationService';

interface AutomationPageProps {
  mode: OperatingMode;
  onModeChange: (mode: OperatingMode) => void;
  isRunning: boolean;
  progress: AutoCloseProgress;
  onTriggerCapClose: () => Promise<void>;
  onTriggerCapOpen: () => Promise<void>;
  events: AutomationEvent[];
  onClearHistory: () => void;
  calibrationPoints: CalibrationPoint[];
  motorProfiles: MotorProfile[];
  connectionState: ConnectionState;
}

export const AutomationPage: React.FC<AutomationPageProps> = ({
  mode,
  onModeChange,
  isRunning,
  progress,
  onTriggerCapClose,
  onTriggerCapOpen,
  events,
  onClearHistory,
  calibrationPoints,
  motorProfiles,
  connectionState,
}) => {
  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <AutomationControl
        mode={mode}
        onModeChange={onModeChange}
        isRunning={isRunning}
        progress={progress}
        onTriggerCapClose={onTriggerCapClose}
        onTriggerCapOpen={onTriggerCapOpen}
        calibrationPoints={calibrationPoints}
        motorProfiles={motorProfiles}
        connectionState={connectionState}
      />

      {/* Operation History */}
      <AutomationHistory events={events} onClearHistory={onClearHistory} />
    </div>
  );
};


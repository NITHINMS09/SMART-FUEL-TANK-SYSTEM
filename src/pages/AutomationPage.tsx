import React from 'react';
import {
  AutomationEvent,
  AutomationFeedbackState,
  CalibrationPoint,
  ConnectionState,
  MotorProfile,
  OperatingMode,
} from '../types';
import { AutomationControl } from '../components/automation/AutomationControl';
import { AutomationHistory } from '../components/automation/AutomationHistory';

interface AutomationPageProps {
  mode: OperatingMode;
  onModeChange: (mode: OperatingMode) => void;
  feedbackState: AutomationFeedbackState;
  onTriggerCapClose: () => Promise<void>;
  onTriggerCapOpen: () => Promise<void>;
  onEmergencyStop: () => Promise<void>;
  onZeroPosition: () => Promise<void>;
  onUpdateConfig: (updates: Partial<any>) => void;
  events: AutomationEvent[];
  onClearHistory: () => void;
  calibrationPoints: CalibrationPoint[];
  motorProfiles: MotorProfile[];
  connectionState: ConnectionState;
}

export const AutomationPage: React.FC<AutomationPageProps> = ({
  mode,
  onModeChange,
  feedbackState,
  onTriggerCapClose,
  onTriggerCapOpen,
  onEmergencyStop,
  onZeroPosition,
  onUpdateConfig,
  events,
  onClearHistory,
  calibrationPoints,
  motorProfiles,
  connectionState,
}) => {
  return (
    <div className="space-y-6">
      {/* Control Panel & Continuous Automation Dashboard */}
      <AutomationControl
        mode={mode}
        onModeChange={onModeChange}
        feedbackState={feedbackState}
        onTriggerCapClose={onTriggerCapClose}
        onTriggerCapOpen={onTriggerCapOpen}
        onEmergencyStop={onEmergencyStop}
        onZeroPosition={onZeroPosition}
        onUpdateConfig={onUpdateConfig}
        calibrationPoints={calibrationPoints}
        motorProfiles={motorProfiles}
        connectionState={connectionState}
      />

      {/* Operation History */}
      <AutomationHistory events={events} onClearHistory={onClearHistory} />
    </div>
  );
};

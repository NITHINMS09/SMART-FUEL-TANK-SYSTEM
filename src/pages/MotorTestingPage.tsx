import React from 'react';
import { Cog } from 'lucide-react';
import { ConnectionState, MotorDirection, MotorStatus } from '../types';
import { MotorControlPad } from '../components/motor/MotorControlPad';

interface MotorTestingPageProps {
  motorStatus: MotorStatus;
  isMotorRunning: boolean;
  onRotate: (action: 'OPEN' | 'CLOSE', degrees: number, direction: MotorDirection) => Promise<void>;
  onEmergencyStop: () => Promise<void>;
  connectionState: ConnectionState;
}

export const MotorTestingPage: React.FC<MotorTestingPageProps> = ({
  motorStatus,
  isMotorRunning,
  onRotate,
  onEmergencyStop,
  connectionState,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="panel-glass rounded-xl p-4 sm:p-6 border-slate-800 flex items-center space-x-3 font-mono text-xs">
        <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 shadow-glow-green shrink-0">
          <Cog className={`w-5 h-5 ${isMotorRunning ? 'animate-spin' : ''}`} />
        </div>
        <div>
          <h2 className="text-xs sm:text-sm font-bold uppercase text-white tracking-wider">
            Dedicated Motor Direct Testing & Diagnostics
          </h2>
          <p className="text-slate-400 text-xs">
            Directly actuate the DRV8825 stepper motor controller with precise degrees and directional controls
          </p>
        </div>
      </div>

      {/* Control Pad Component */}
      <MotorControlPad
        motorStatus={motorStatus}
        isMotorRunning={isMotorRunning}
        onRotate={onRotate}
        onEmergencyStop={onEmergencyStop}
        isConnected={connectionState === 'CONNECTED'}
      />
    </div>
  );
};


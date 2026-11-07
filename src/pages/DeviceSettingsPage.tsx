import React, { useState } from 'react';
import { Settings, Save, CheckCircle2, ShieldCheck, Cpu, Gauge, Zap } from 'lucide-react';
import { DeviceSettings, HX711Status } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';

interface DeviceSettingsPageProps {
  settings: DeviceSettings;
  onSaveSettings: (settings: DeviceSettings) => void;
  hx711Status: HX711Status;
}

export const DeviceSettingsPage: React.FC<DeviceSettingsPageProps> = ({
  settings,
  onSaveSettings,
  hx711Status,
}) => {
  const [formData, setFormData] = useState<DeviceSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);

  const baudOptions = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
  const microstepOptions = ['Full Step (1)', 'Half Step (1/2)', '1/4 Step', '1/8 Step', '1/16 Step', '1/32 Step'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 font-mono text-xs max-w-4xl">
      {/* Header */}
      <div className="panel-glass rounded-xl p-6 border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shadow-glow-cyan">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase text-white tracking-wider">
              Hardware Parameters & Device Configuration
            </h2>
            <p className="text-slate-400 text-xs">
              Configure communication baud rates, load cell sampling, and stepper driver tuning
            </p>
          </div>
        </div>

        {savedSuccess && (
          <div className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-3 py-1.5 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings Saved</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Hardware Pin Mapping Reference (READ ONLY - DO NOT CHANGE) */}
        <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase text-white">
                ESP32-S3 Hardware Pin Mapping (Locked Specification)
              </h3>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded">
              HARDWARE VERIFIED
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 bg-[#070c18] rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase block">HX711 DT (Data)</span>
              <p className="text-white font-bold text-sm mt-0.5">GPIO 16</p>
            </div>
            <div className="p-3 bg-[#070c18] rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase block">HX711 SCK (Clock)</span>
              <p className="text-white font-bold text-sm mt-0.5">GPIO 17</p>
            </div>
            <div className="p-3 bg-[#070c18] rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase block">DRV8825 STEP</span>
              <p className="text-white font-bold text-sm mt-0.5">GPIO 4</p>
            </div>
            <div className="p-3 bg-[#070c18] rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase block">DRV8825 DIR</span>
              <p className="text-white font-bold text-sm mt-0.5">GPIO 5</p>
            </div>
            <div className="p-3 bg-[#070c18] rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase block">DRV8825 EN</span>
              <p className="text-white font-bold text-sm mt-0.5">GPIO 6</p>
            </div>
          </div>
        </div>

        {/* Communication & Sampling Settings */}
        <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
            <Gauge className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase text-white">
              Serial Communication & Load Cell Parameters
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 font-semibold mb-1 uppercase">
                Serial Baud Rate
              </label>
              <select
                value={formData.baudRate}
                onChange={(e) => setFormData({ ...formData, baudRate: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-cyan-300 font-bold focus:border-cyan-500 focus:outline-none"
              >
                {baudOptions.map((b) => (
                  <option key={b} value={b}>
                    {b} bps
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1 uppercase">
                Stability Range Threshold (units)
              </label>
              <input
                type="number"
                min="5"
                max="1000"
                value={formData.stabilityThreshold}
                onChange={(e) =>
                  setFormData({ ...formData, stabilityThreshold: Number(e.target.value) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1 uppercase">
                Calibration Samples Count
              </label>
              <input
                type="number"
                min="10"
                max="50"
                value={formData.calibrationSampleCount}
                onChange={(e) =>
                  setFormData({ ...formData, calibrationSampleCount: Number(e.target.value) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>
          </div>
        </div>

        {/* Stepper Motor Driver Tuning */}
        <div className="panel-glass rounded-xl p-6 border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
            <Zap className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase text-white">
              DRV8825 Stepper Motor Motion Parameters
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 font-semibold mb-1 uppercase">
                Microstepping Resolution
              </label>
              <select
                value={formData.microstepping}
                onChange={(e) => setFormData({ ...formData, microstepping: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-cyan-300 font-bold focus:border-cyan-500 focus:outline-none"
              >
                {microstepOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1 uppercase">
                Motor Steps Per Revolution (1.8° = 200)
              </label>
              <input
                type="number"
                min="100"
                max="800"
                value={formData.stepsPerRevolution}
                onChange={(e) =>
                  setFormData({ ...formData, stepsPerRevolution: Number(e.target.value) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1 uppercase">
                Maximum Stepper Speed (steps / sec)
              </label>
              <input
                type="number"
                min="200"
                max="5000"
                value={formData.maxMotorSpeed}
                onChange={(e) =>
                  setFormData({ ...formData, maxMotorSpeed: Number(e.target.value) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1 uppercase">
                Acceleration (steps / sec²)
              </label>
              <input
                type="number"
                min="100"
                max="5000"
                value={formData.motorAcceleration}
                onChange={(e) =>
                  setFormData({ ...formData, motorAcceleration: Number(e.target.value) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold uppercase tracking-wider flex items-center space-x-2 shadow-glow-cyan transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save Device Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { formatNumber, formatTimestamp } from '../../utils/formatters';

interface VolumeDataPoint {
  timestamp: number;
  volumeMl: number;
}

interface VolumeChartProps {
  history: VolumeDataPoint[];
  currentVolume: number | null;
  isCalibrated: boolean;
}

export const VolumeChart: React.FC<VolumeChartProps> = ({
  history,
  currentVolume,
  isCalibrated,
}) => {
  const chartData = history.map((item, idx) => ({
    index: idx + 1,
    time: formatTimestamp(item.timestamp),
    volume: item.volumeMl,
  }));

  const hasData = isCalibrated && chartData.length > 0;

  return (
    <div className="h-64 w-full">
      {!isCalibrated ? (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-lg p-4 text-center">
          <p className="text-amber-400 font-semibold mb-1">Calibration Missing or Incomplete</p>
          <span className="text-slate-400 text-[11px] max-w-xs">
            Volume calculation requires at least 2 confirmed calibration points. Visit Load Cell Calibration to calibrate.
          </span>
        </div>
      ) : !hasData ? (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-lg">
          <p>Awaiting volume measurements...</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" opacity={0.6} />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={10}
              fontFamily="JetBrains Mono"
              tickLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              fontFamily="JetBrains Mono"
              tickLine={false}
              unit=" ml"
              domain={[0, 'auto']}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-[#0b1222] border border-emerald-500/40 p-2.5 rounded-lg shadow-xl font-mono text-xs">
                      <div className="text-slate-400 text-[10px]">Time: {item.time}</div>
                      <div className="text-emerald-400 font-bold text-sm mt-0.5">
                        Volume: {formatNumber(item.volume, 1)} ml
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="volume"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#volumeGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};


import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { CalibrationPoint } from '../../types';
import { formatNumber } from '../../utils/formatters';

interface CalibrationCurveProps {
  points: CalibrationPoint[];
  currentRaw: number | null;
  currentEstimatedVolume: number | null;
}

export const CalibrationCurve: React.FC<CalibrationCurveProps> = ({
  points,
  currentRaw,
  currentEstimatedVolume,
}) => {
  const confirmedPoints = points
    .filter((p) => p.status === 'CONFIRMED')
    .sort((a, b) => a.volumeMl - b.volumeMl);

  const data = confirmedPoints.map((p) => ({
    volume: p.volumeMl,
    raw: p.averageRaw,
    min: p.minimum,
    max: p.maximum,
    range: p.range,
  }));

  const hasEnoughPoints = confirmedPoints.length >= 2;

  return (
    <div className="h-72 w-full">
      {!hasEnoughPoints ? (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-lg p-6 text-center">
          <p className="text-cyan-400 font-semibold mb-1">Calibration Curve Unavailable</p>
          <span className="text-slate-400 text-[11px] max-w-sm">
            At least 2 confirmed calibration points are required to plot the linear interpolation curve (currently {confirmedPoints.length} point{confirmedPoints.length === 1 ? '' : 's'}).
          </span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 15, right: 20, left: 20, bottom: 15 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" opacity={0.6} />
            <XAxis
              dataKey="volume"
              stroke="#64748b"
              fontSize={11}
              fontFamily="JetBrains Mono"
              unit=" ml"
              tickLine={false}
              label={{ value: 'Water Volume (ml)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }}
            />
            <YAxis
              dataKey="raw"
              stroke="#64748b"
              fontSize={11}
              fontFamily="JetBrains Mono"
              tickLine={false}
              domain={['auto', 'auto']}
              tickFormatter={(v) => formatNumber(v)}
              label={{ value: 'Raw HX711 Reading', angle: -90, position: 'insideLeft', offset: -10, fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-[#0b1222] border border-cyan-500/50 p-3 rounded-lg shadow-2xl font-mono text-xs space-y-1">
                      <div className="text-cyan-400 font-bold text-sm">
                        Volume: {item.volume} ml
                      </div>
                      <div className="text-slate-300">
                        Average Raw: <span className="text-white font-semibold">{formatNumber(item.raw)}</span>
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        Min: {formatNumber(item.min)} | Max: {formatNumber(item.max)}
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        Range: {formatNumber(item.range)} units
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Current live reading reference */}
            {currentRaw !== null && (
              <ReferenceLine
                y={currentRaw}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                label={{
                  value: `Live Raw: ${formatNumber(currentRaw)}`,
                  fill: '#f59e0b',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />
            )}

            {/* Current live volume reference */}
            {currentEstimatedVolume !== null && (
              <ReferenceLine
                x={currentEstimatedVolume}
                stroke="#10b981"
                strokeDasharray="3 3"
                label={{
                  value: `${formatNumber(currentEstimatedVolume, 1)} ml`,
                  fill: '#10b981',
                  fontSize: 10,
                  position: 'insideBottomRight',
                }}
              />
            )}

            <Line
              type="linear"
              dataKey="raw"
              stroke="#00e5ff"
              strokeWidth={2.5}
              dot={{ r: 5, fill: '#00e5ff', stroke: '#0a101f', strokeWidth: 2 }}
              activeDot={{ r: 7, fill: '#ffffff', stroke: '#00e5ff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

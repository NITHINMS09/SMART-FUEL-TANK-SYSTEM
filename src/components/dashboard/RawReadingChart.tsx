import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { RawReading } from '../../types';
import { formatNumber, formatTimestamp } from '../../utils/formatters';

interface RawReadingChartProps {
  readings: RawReading[];
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  targetCount?: number;
}

export const RawReadingChart: React.FC<RawReadingChartProps> = ({
  readings,
  average,
  minimum,
  maximum,
  targetCount = 20,
}) => {
  // Use last targetCount readings
  const windowReadings = readings.slice(-targetCount);

  const data = windowReadings.map((r, idx) => ({
    index: idx + 1,
    time: formatTimestamp(r.timestamp),
    raw: r.raw,
  }));

  const hasData = data.length > 0;

  return (
    <div className="h-64 w-full">
      {!hasData ? (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-lg">
          <p>Awaiting raw stream from ESP32 HX711...</p>
          <span className="text-[11px] text-slate-600 mt-1">Connect device to observe live readings</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 15, left: 15, bottom: 5 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" opacity={0.6} />
            <XAxis
              dataKey="index"
              stroke="#64748b"
              fontSize={11}
              fontFamily="JetBrains Mono"
              tickLine={false}
              label={{ value: 'Last 20 Samples', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 10 }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              fontFamily="JetBrains Mono"
              tickLine={false}
              domain={['auto', 'auto']}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-[#0b1222] border border-cyan-500/40 p-2.5 rounded-lg shadow-xl font-mono text-xs">
                      <div className="text-slate-400 text-[10px]">Sample #{item.index} · {item.time}</div>
                      <div className="text-cyan-400 font-bold text-sm mt-0.5">
                        Raw: {formatNumber(item.raw)}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {average !== null && (
              <ReferenceLine
                y={average}
                stroke="#00e5ff"
                strokeDasharray="4 4"
                label={{ value: `Avg: ${formatNumber(average)}`, fill: '#00e5ff', fontSize: 10, position: 'insideTopRight' }}
              />
            )}
            {minimum !== null && (
              <ReferenceLine
                y={minimum}
                stroke="#64748b"
                strokeDasharray="2 2"
                label={{ value: `Min: ${formatNumber(minimum)}`, fill: '#64748b', fontSize: 9, position: 'insideBottomLeft' }}
              />
            )}
            {maximum !== null && (
              <ReferenceLine
                y={maximum}
                stroke="#64748b"
                strokeDasharray="2 2"
                label={{ value: `Max: ${formatNumber(maximum)}`, fill: '#64748b', fontSize: 9, position: 'insideTopLeft' }}
              />
            )}
            <Line
              type="monotone"
              dataKey="raw"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 3, fill: '#00e5ff', stroke: '#070b14', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#00e5ff', stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};


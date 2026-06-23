'use client';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

export function RepoSparkline({ data }: { data: { day: string; stars: number }[] }) {
  if (!data || data.length < 2) return <div className="h-8 w-24" aria-hidden />;
  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="stars"
            stroke="#10b981"
            strokeWidth={1}
            fill="url(#spark-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

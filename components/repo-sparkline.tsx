'use client';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

export function RepoSparkline({ data }: { data: { day: string; stars: number }[] }) {
  if (!data || data.length < 2) return null;
  return (
    <div className="h-8 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line type="monotone" dataKey="stars" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

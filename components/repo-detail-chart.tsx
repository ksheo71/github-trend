'use client';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function RepoDetailChart({ data }: { data: { day: string; stars: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#27272a" />
          <XAxis dataKey="day" stroke="#71717a" fontSize={11} />
          <YAxis stroke="#71717a" fontSize={11} />
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6 }} />
          <Line type="monotone" dataKey="stars" stroke="#10b981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

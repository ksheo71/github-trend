'use client';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#22d3ee', '#f472b6', '#84cc16', '#f97316'];

export function LanguageBreakdown({ data }: {
  data: { language: string; hotRepoCount: number; totalStarsGained: number }[];
}) {
  if (data.length === 0) return <p className="text-zinc-500 text-sm">데이터 없음</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="hotRepoCount" nameKey="language" innerRadius={60} outerRadius={90} strokeWidth={0}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

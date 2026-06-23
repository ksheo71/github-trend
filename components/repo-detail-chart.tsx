'use client';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useTheme } from '@/lib/use-theme';

function formatDay(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function RepoDetailChart({ data }: { data: { day: string; stars: number }[] }) {
  const theme = useTheme();
  const c = theme === 'dark'
    ? { grid: '#27272a', axis: '#52525b', tipBg: '#09090b', tipBorder: '#27272a', tipLabel: '#a1a1aa' }
    : { grid: '#e4e4e7', axis: '#a1a1aa', tipBg: '#ffffff', tipBorder: '#e4e4e7', tipLabel: '#52525b' };
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="detail-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            stroke={c.axis}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatDay}
            minTickGap={24}
          />
          <YAxis stroke={c.axis} fontSize={10} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            contentStyle={{
              background: c.tipBg,
              border: `1px solid ${c.tipBorder}`,
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: c.tipLabel }}
            itemStyle={{ color: '#10b981' }}
            labelFormatter={(v) => formatDay(v as string)}
          />
          <Area
            type="monotone"
            dataKey="stars"
            stroke="#10b981"
            strokeWidth={1.5}
            fill="url(#detail-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

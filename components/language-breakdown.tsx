type Row = { language: string; hotRepoCount: number; totalStarsGained: number };

export function LanguageBreakdown({ data }: { data: Row[] }) {
  if (data.length === 0) return <p className="text-zinc-500 text-sm">데이터 없음</p>;
  const max = Math.max(...data.map((d) => d.hotRepoCount));
  const total = data.reduce((s, d) => s + d.hotRepoCount, 0);
  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const pct = max ? (d.hotRepoCount / max) * 100 : 0;
        const share = total ? Math.round((d.hotRepoCount / total) * 100) : 0;
        return (
          <li key={d.language} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3">
            <span className="text-sm text-zinc-100 truncate">{d.language}</span>
            <div className="h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-muted"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-mono text-zinc-500 text-right tabular-nums">
              {d.hotRepoCount}
              <span className="text-zinc-700"> · {share}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

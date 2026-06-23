import Link from 'next/link';
import type { KeywordCard } from '@/server/db/queries';

export function KeywordCloud({ items }: { items: KeywordCard[] }) {
  if (items.length === 0) return <p className="text-zinc-500 text-sm">뜨는 키워드가 아직 없습니다</p>;
  const maxMentions = Math.max(...items.map((k) => k.mentions));
  return (
    <ul className="-mx-2">
      {items.map((k) => {
        const pct = maxMentions ? (k.mentions / maxMentions) * 100 : 0;
        return (
          <li key={k.keyword}>
            <Link
              href={`/keyword/${encodeURIComponent(k.keyword)}` as any}
              className="group grid grid-cols-[1fr_8rem_4rem] items-center gap-3 px-2 py-1.5 rounded-md transition-colors hover:bg-zinc-900/60"
            >
              <span className="text-sm font-medium text-zinc-100 truncate">
                <span className="text-zinc-600">#</span>
                {k.keyword}
              </span>
              <span className="h-1 rounded-full bg-zinc-900 overflow-hidden">
                <span
                  className="block h-full rounded-full bg-accent/80 group-hover:bg-accent transition-colors"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="text-xs font-mono text-right tabular-nums">
                <span className="text-zinc-500">{k.mentions}</span>
                <span className="text-accent"> +{Math.round(k.deltaPct)}%</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

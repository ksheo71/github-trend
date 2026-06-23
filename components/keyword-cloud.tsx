import Link from 'next/link';
import { Badge } from './ui/badge';
import type { KeywordCard } from '@/server/db/queries';

export function KeywordCloud({ items }: { items: KeywordCard[] }) {
  if (items.length === 0) return <p className="text-zinc-500 text-sm">뜨는 키워드가 아직 없습니다</p>;
  return (
    <ul className="space-y-2">
      {items.map((k) => (
        <li key={k.keyword} className="flex items-center justify-between gap-2">
          <Link href={`/keyword/${encodeURIComponent(k.keyword)}` as any} className="text-zinc-100 hover:text-accent">
            #{k.keyword}
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">{k.mentions} repos</Badge>
            <Badge variant="accent">+{Math.round(k.deltaPct)}%</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

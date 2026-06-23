import Link from 'next/link';
import { Badge } from './ui/badge';
import { LinkButton } from './ui/button';
import type { HotRepo, Period, Sort } from '@/server/db/queries';
import { RepoSparkline } from './repo-sparkline';

export function HotRepoList({
  repos, period, lang, sort, sparklines,
}: {
  repos: HotRepo[]; period: Period; lang: string; sort: Sort;
  sparklines: Map<number, { day: string; stars: number }[]>;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
        <span className="text-zinc-400">정렬:</span>
        {(['gain', 'stars', 'forks', 'issues'] as Sort[]).map((s) => (
          <LinkButton key={s} active={s === sort}
            href={`/?period=${period}&lang=${encodeURIComponent(lang)}&sort=${s}`}>
            {s === 'gain' ? '증가율' : s === 'stars' ? '스타' : s === 'forks' ? '포크' : '이슈'}
          </LinkButton>
        ))}
      </div>
      <ol className="space-y-3">
        {repos.map((r, idx) => (
          <li key={r.id} className="flex gap-4 items-start p-3 rounded-md border border-zinc-800 bg-zinc-900/40">
            <span className="text-zinc-500 font-mono text-sm w-6 text-right pt-0.5">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/repo/${r.id}` as any} className="font-semibold text-zinc-100 hover:text-accent truncate">{r.fullName}</Link>
                {r.language && <Badge variant="outline">{r.language}</Badge>}
                {r.topics.slice(0, 4).map((t) => (
                  <Link key={t} href={`/keyword/${encodeURIComponent(t)}` as any}>
                    <Badge>{t}</Badge>
                  </Link>
                ))}
              </div>
              {r.description && <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{r.description}</p>}
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-2">
                <span>★ {r.stars.toLocaleString()}</span>
                <span className="text-accent">+{r.starGain.toLocaleString()}</span>
                <span>fork {r.forks.toLocaleString()}</span>
                <span>issue {r.openIssues.toLocaleString()}</span>
              </div>
            </div>
            <RepoSparkline data={sparklines.get(r.id) ?? []} />
          </li>
        ))}
      </ol>
    </div>
  );
}

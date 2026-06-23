import Link from 'next/link';
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
      <div className="flex flex-wrap items-center gap-1 mb-5 text-xs">
        <span className="text-[11px] font-medium tracking-widest uppercase text-zinc-500 mr-2">정렬</span>
        {(['gain', 'stars', 'forks', 'issues'] as Sort[]).map((s) => (
          <LinkButton key={s} active={s === sort}
            href={`/?period=${period}&lang=${encodeURIComponent(lang)}&sort=${s}`}>
            {s === 'gain' ? '증가율' : s === 'stars' ? '스타' : s === 'forks' ? '포크' : '이슈'}
          </LinkButton>
        ))}
      </div>
      <ol className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
        {repos.map((r, idx) => {
          const topics = r.topics.slice(0, 3);
          return (
            <li key={r.id} className="group py-4 first:pt-0 last:pb-0">
              <div className="grid grid-cols-[2.5rem_1fr_auto_6rem] gap-4 items-center">
                <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/repo/${r.id}` as any}
                    className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-accent dark:hover:text-accent transition-colors truncate block"
                  >
                    {r.fullName}
                  </Link>
                  <div className="mt-1 text-xs text-zinc-500 truncate">
                    {r.language && <span>{r.language}</span>}
                    {r.language && topics.length > 0 && <span className="text-zinc-300 dark:text-zinc-700"> · </span>}
                    {topics.map((t, i) => (
                      <span key={t}>
                        {i > 0 && <span className="text-zinc-300 dark:text-zinc-700"> · </span>}
                        <Link
                          href={`/keyword/${encodeURIComponent(t)}` as any}
                          className="hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
                        >
                          {t}
                        </Link>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right font-mono text-xs tabular-nums leading-tight">
                  <div className="text-zinc-700 dark:text-zinc-300">★ {r.stars.toLocaleString()}</div>
                  <div className="text-accent mt-0.5">+{r.starGain.toLocaleString()}</div>
                </div>
                <div className="flex justify-end">
                  <RepoSparkline data={sparklines.get(r.id) ?? []} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

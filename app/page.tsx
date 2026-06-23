import Link from 'next/link';
import { db } from '@/server/db/client';
import {
  queryHotRepos, queryTopKeywords, queryLanguageBreakdown, queryLastIngest, queryRepoTimeseries,
  type Period, type Sort,
} from '@/server/db/queries';
import { kstFormat } from '@/server/ingest/time';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PeriodTabs } from '@/components/period-tabs';
import { LanguageBreakdown } from '@/components/language-breakdown';
import { KeywordCloud } from '@/components/keyword-cloud';
import { HotRepoList } from '@/components/hot-repo-list';
import { StaleBanner } from '@/components/stale-banner';
import { ThemeToggle } from '@/components/theme-toggle';

export const revalidate = 600;

const ALLOWED_PERIODS: Period[] = ['day', 'week', 'month'];
const ALLOWED_SORTS: Sort[] = ['gain', 'stars', 'forks', 'issues'];

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const period = (ALLOWED_PERIODS.includes(sp.period as Period) ? sp.period : 'week') as Period;
  const lang = sp.lang ?? 'ALL';
  const sort = (ALLOWED_SORTS.includes(sp.sort as Sort) ? sp.sort : 'gain') as Sort;

  const [meta, langs, keywords, repos] = await Promise.all([
    queryLastIngest(db),
    queryLanguageBreakdown(db, period),
    queryTopKeywords(db, period, 12),
    queryHotRepos(db, period, lang, sort, 25),
  ]);

  const sparklines = new Map<number, { day: string; stars: number }[]>();
  await Promise.all(repos.map(async (r) => {
    sparklines.set(r.id, await queryRepoTimeseries(db, r.id, 30));
  }));

  const updated = meta?.finishedAt ? kstFormat(meta.finishedAt) : null;

  return (
    <>
      <StaleBanner meta={meta} />
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-10">
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">GitHub Trend</h1>
            {updated && (
              <p className="text-xs text-zinc-500 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                updated {updated} KST
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <PeriodTabs current={period} basePath="/" />
            <ThemeToggle />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>언어 점유</CardTitle></CardHeader>
            <CardContent><LanguageBreakdown data={langs.slice(0, 10)} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>뜨는 키워드</CardTitle></CardHeader>
            <CardContent><KeywordCloud items={keywords} /></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>핫 레포 · {period}</CardTitle>
            <Link
              href={`/trending?period=${period}` as any}
              className="text-[11px] font-medium tracking-widest uppercase text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
            >
              top 100 →
            </Link>
          </CardHeader>
          <CardContent>
            <HotRepoList repos={repos} period={period} lang={lang} sort={sort} sparklines={sparklines} />
          </CardContent>
        </Card>

        <footer className="pt-4 flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-600">
          <span>github-trend · daily snapshot</span>
          <a
            href="https://github.com/ksheo71/github-trend"
            className="hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
            target="_blank"
            rel="noreferrer"
          >
            source ↗
          </a>
        </footer>
      </main>
    </>
  );
}

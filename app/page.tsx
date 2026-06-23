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

  return (
    <>
      <StaleBanner meta={meta} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold tracking-tight">GitHub Trend</h1>
          <PeriodTabs current={period} basePath="/" />
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
          <CardHeader><CardTitle>핫 레포 ({period})</CardTitle></CardHeader>
          <CardContent>
            <HotRepoList repos={repos} period={period} lang={lang} sort={sort} sparklines={sparklines} />
          </CardContent>
        </Card>

        <footer className="pt-6 text-center text-xs text-zinc-500">
          마지막 업데이트: {meta?.finishedAt ? kstFormat(meta.finishedAt) : '아직 없음'}
        </footer>
      </main>
    </>
  );
}

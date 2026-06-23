import { db } from '@/server/db/client';
import { queryHotRepos, queryRepoTimeseries, type Period, type Sort } from '@/server/db/queries';
import { PeriodTabs } from '@/components/period-tabs';
import { HotRepoList } from '@/components/hot-repo-list';

export const revalidate = 600;

const ALLOWED_PERIODS: Period[] = ['day', 'week', 'month'];
const ALLOWED_SORTS: Sort[] = ['gain', 'stars', 'forks', 'issues'];

export default async function Trending({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const period = (ALLOWED_PERIODS.includes(sp.period as Period) ? sp.period : 'week') as Period;
  const lang = sp.lang ?? 'ALL';
  const sort = (ALLOWED_SORTS.includes(sp.sort as Sort) ? sp.sort : 'gain') as Sort;
  const repos = await queryHotRepos(db, period, lang, sort, 100);
  const sparklines = new Map<number, { day: string; stars: number }[]>();
  await Promise.all(repos.map(async (r) => sparklines.set(r.id, await queryRepoTimeseries(db, r.id, 30))));
  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-widest uppercase text-zinc-500">trending</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Top 100</h1>
        </div>
        <PeriodTabs current={period} basePath="/trending" />
      </header>
      <HotRepoList repos={repos} period={period} lang={lang} sort={sort} sparklines={sparklines} />
    </main>
  );
}

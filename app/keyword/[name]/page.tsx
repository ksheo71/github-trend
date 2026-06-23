import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { queryRepoTimeseries, type HotRepo } from '@/server/db/queries';
import { HotRepoList } from '@/components/hot-repo-list';
import { ThemeToggle } from '@/components/theme-toggle';

export const revalidate = 600;

async function reposForKeyword(keyword: string): Promise<HotRepo[]> {
  const res = await db.execute<any>(sql`
    SELECT r.id, r.full_name, r.description, r.language, r.topics,
           COALESCE(r.stars, 0) AS stars, COALESCE(r.forks, 0) AS forks,
           COALESCE(r.open_issues, 0) AS open_issues, t.star_gain
    FROM gh_trend.trend_repo t
    JOIN gh_trend.repos r ON r.id = t.repo_id
    WHERE t.period = 'week' AND t.language = 'ALL'
      AND ${keyword} = ANY(r.topics)
    ORDER BY t.star_gain DESC
    LIMIT 50
  `);
  return res.rows.map((r) => ({
    id: Number(r.id), fullName: r.full_name, description: r.description,
    language: r.language, topics: r.topics ?? [],
    stars: Number(r.stars), starGain: Number(r.star_gain),
    forks: Number(r.forks), openIssues: Number(r.open_issues),
  }));
}

export default async function KeywordPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const keyword = decodeURIComponent(name).toLowerCase();
  const repos = await reposForKeyword(keyword);
  const sparklines = new Map<number, { day: string; stars: number }[]>();
  await Promise.all(repos.map(async (r) => sparklines.set(r.id, await queryRepoTimeseries(db, r.id, 30))));
  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-widest uppercase text-zinc-500">keyword</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            <span className="text-zinc-400 dark:text-zinc-600">#</span>{keyword}
          </h1>
          <p className="text-sm text-zinc-500">최근 1주 핫 레포 중 이 토픽을 가진 레포</p>
        </div>
        <ThemeToggle />
      </header>
      <HotRepoList repos={repos} period="week" lang="ALL" sort="gain" sparklines={sparklines} />
    </main>
  );
}

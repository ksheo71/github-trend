import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { queryRepoTimeseries, type HotRepo } from '@/server/db/queries';
import { HotRepoList } from '@/components/hot-repo-list';

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
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">#{keyword}</h1>
      <p className="text-zinc-400 text-sm">최근 1주 핫 레포 중 이 토픽을 가진 레포</p>
      <HotRepoList repos={repos} period="week" lang="ALL" sort="gain" sparklines={sparklines} />
    </main>
  );
}

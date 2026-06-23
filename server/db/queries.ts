import { sql, eq, desc, asc } from 'drizzle-orm';
import type { DB } from './client';
import { repos, repoDailyStats, trendRepo, trendKeyword, trendLanguage, ingestRuns } from './schema';

export type Period = 'day' | 'week' | 'month';
export type Sort = 'gain' | 'stars' | 'forks' | 'issues';

export type HotRepo = {
  id: number; fullName: string; description: string | null;
  language: string | null; topics: string[]; stars: number;
  starGain: number; forks: number; openIssues: number;
};
export type KeywordCard = { keyword: string; mentions: number; deltaPct: number; sampleRepos: HotRepo[] };
export type LanguageBreakdown = { language: string; hotRepoCount: number; totalStarsGained: number };
export type LastIngestMeta = { day: string; finishedAt: Date | null; status: string };

function sortColumn(sort: Sort) {
  switch (sort) {
    case 'gain':   return sql`t.star_gain DESC`;
    case 'stars':  return sql`r.stars DESC NULLS LAST`;
    case 'forks':  return sql`r.forks DESC NULLS LAST`;
    case 'issues': return sql`r.open_issues DESC NULLS LAST`;
  }
}

export async function queryHotRepos(
  db: DB, period: Period, lang: string, sort: Sort, limit = 25,
): Promise<HotRepo[]> {
  const order = sortColumn(sort);
  const res = await db.execute<any>(sql`
    SELECT r.id, r.full_name, r.description, r.language, r.topics,
           COALESCE(r.stars, 0) AS stars, COALESCE(r.forks, 0) AS forks,
           COALESCE(r.open_issues, 0) AS open_issues, t.star_gain
    FROM gh_trend.trend_repo t
    JOIN gh_trend.repos r ON r.id = t.repo_id
    WHERE t.period = ${period} AND t.language = ${lang}
    ORDER BY ${order}
    LIMIT ${limit}
  `);
  return res.rows.map((r) => ({
    id: Number(r.id), fullName: r.full_name, description: r.description,
    language: r.language, topics: r.topics ?? [],
    stars: Number(r.stars), starGain: Number(r.star_gain),
    forks: Number(r.forks), openIssues: Number(r.open_issues),
  }));
}

export async function queryRepo(db: DB, repoId: number): Promise<HotRepo | null> {
  const res = await db.execute<any>(sql`
    SELECT r.id, r.full_name, r.description, r.language, r.topics,
           COALESCE(r.stars, 0) AS stars, COALESCE(r.forks, 0) AS forks,
           COALESCE(r.open_issues, 0) AS open_issues
    FROM gh_trend.repos r WHERE r.id = ${repoId}
  `);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id), fullName: r.full_name, description: r.description,
    language: r.language, topics: r.topics ?? [],
    stars: Number(r.stars), starGain: 0,
    forks: Number(r.forks), openIssues: Number(r.open_issues),
  };
}

export async function queryTopKeywords(db: DB, period: Period, limit = 12): Promise<KeywordCard[]> {
  const kw = await db.select().from(trendKeyword)
    .where(eq(trendKeyword.period, period))
    .orderBy(desc(trendKeyword.deltaPct))
    .limit(limit);
  const ids = new Set<number>();
  for (const k of kw) for (const i of k.sampleRepoIds ?? []) ids.add(Number(i));
  const idList = [...ids];
  const repoRows = ids.size
    ? await db.execute<any>(sql`
        SELECT id, full_name, description, language, topics,
               COALESCE(stars, 0) AS stars, COALESCE(forks, 0) AS forks,
               COALESCE(open_issues, 0) AS open_issues
        FROM gh_trend.repos WHERE id = ANY(${sql.raw(`ARRAY[${idList.join(',')}]`)}::bigint[])
      `)
    : { rows: [] as any[] };
  const byId = new Map<number, HotRepo>(repoRows.rows.map((r) => [Number(r.id), {
    id: Number(r.id), fullName: r.full_name, description: r.description,
    language: r.language, topics: r.topics ?? [],
    stars: Number(r.stars), starGain: 0,
    forks: Number(r.forks), openIssues: Number(r.open_issues),
  }]));
  return kw.map((k) => ({
    keyword: k.keyword, mentions: k.mentions, deltaPct: Number(k.deltaPct),
    sampleRepos: (k.sampleRepoIds ?? []).map((i) => byId.get(Number(i))).filter((x): x is HotRepo => !!x),
  }));
}

export async function queryLanguageBreakdown(db: DB, period: Period): Promise<LanguageBreakdown[]> {
  const res = await db.select().from(trendLanguage)
    .where(eq(trendLanguage.period, period))
    .orderBy(desc(trendLanguage.hotRepoCount));
  return res.map((r) => ({ language: r.language, hotRepoCount: r.hotRepoCount, totalStarsGained: Number(r.totalStarsGained) }));
}

export async function queryRepoTimeseries(db: DB, repoId: number, days: number) {
  const res = await db.execute<{ day: string; stars: number }>(sql`
    SELECT day::text AS day, stars FROM gh_trend.repo_daily_stats
    WHERE repo_id = ${repoId}
    ORDER BY day ASC
    LIMIT ${days}
  `);
  return res.rows;
}

export async function queryLastIngest(db: DB): Promise<LastIngestMeta | null> {
  const rows = await db.select().from(ingestRuns)
    .where(eq(ingestRuns.status, 'success'))
    .orderBy(desc(ingestRuns.day))
    .limit(1);
  if (!rows[0]) return null;
  return { day: rows[0].day, finishedAt: rows[0].finishedAt, status: rows[0].status };
}

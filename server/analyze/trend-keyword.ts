import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { addDays } from '../ingest/time';
import { STOPWORDS } from './stopwords';
import { normalizeTopics } from './normalize';

const PRIOR: Record<'day' | 'week' | 'month', (end: string) => { start: string; end: string }> = {
  day:   (e) => ({ start: addDays(e, -1), end: addDays(e, -1) }),
  week:  (e) => ({ start: addDays(e, -13), end: addDays(e, -7) }),
  month: (e) => ({ start: addDays(e, -59), end: addDays(e, -30) }),
};

const CANDIDATES_LIMIT = 200;
type Executor = Pick<DB, 'execute'>;

type RepoRow = { repo_id: number; topics: string[] | null; star_gain: number };

async function candidateRepos(db: Executor, period: 'day' | 'week' | 'month'): Promise<RepoRow[]> {
  const res = await db.execute<RepoRow>(sql`
    SELECT t.repo_id, r.topics, t.star_gain
    FROM gh_trend.trend_repo t
    JOIN gh_trend.repos r ON r.id = t.repo_id
    WHERE t.period = ${period} AND t.language = 'ALL'
    ORDER BY t.rank_by_star_gain
    LIMIT ${CANDIDATES_LIMIT}
  `);
  return res.rows;
}

async function priorCounts(db: Executor, period: 'day' | 'week' | 'month', endDay: string): Promise<Map<string, number>> {
  const range = PRIOR[period](endDay);
  const res = await db.execute<{ repo_id: number; topics: string[] | null; star_gain: number }>(sql`
    WITH gained AS (
      SELECT repo_id, SUM(stars_delta)::int AS star_gain
      FROM gh_trend.repo_daily_stats
      WHERE day BETWEEN ${range.start} AND ${range.end} AND stars_delta > 0
      GROUP BY repo_id
    )
    SELECT g.repo_id, r.topics, g.star_gain
    FROM gained g JOIN gh_trend.repos r ON r.id = g.repo_id
    WHERE g.star_gain > 0
    ORDER BY g.star_gain DESC
    LIMIT ${CANDIDATES_LIMIT}
  `);
  return countKeywords(res.rows);
}

function countKeywords(rows: RepoRow[]): Map<string, number> {
  const c = new Map<string, number>();
  for (const r of rows) {
    for (const t of normalizeTopics(r.topics)) c.set(t, (c.get(t) ?? 0) + 1);
  }
  return c;
}

function topSampleIds(rows: RepoRow[], keyword: string, n: number): number[] {
  return rows
    .filter((r) => normalizeTopics(r.topics).includes(keyword))
    .sort((a, b) => b.star_gain - a.star_gain)
    .slice(0, n)
    .map((r) => Number(r.repo_id));
}

export async function rebuildTrendKeywordAll(db: Executor, endDay: string): Promise<void> {
  await db.execute(sql`TRUNCATE gh_trend.trend_keyword`);

  for (const period of ['day', 'week', 'month'] as const) {
    const now = await candidateRepos(db, period);
    const nowCounts = countKeywords(now);
    const prevCounts = await priorCounts(db, period, endDay);

    for (const [kw, mentions] of nowCounts) {
      if (mentions < 3) continue;
      if (STOPWORDS.has(kw)) continue;
      const prev = prevCounts.get(kw) ?? 0;
      const deltaPct = ((mentions - prev) / Math.max(1, prev)) * 100;
      if (deltaPct < 10) continue;
      const sample = topSampleIds(now, kw, 5);
      await db.execute(sql`
        INSERT INTO gh_trend.trend_keyword (period, keyword, mentions, delta_pct, sample_repo_ids)
        VALUES (${period}, ${kw}, ${mentions}, ${deltaPct.toFixed(2)}, ${sql.raw(`ARRAY[${sample.join(',')}]::bigint[]`)}  )
      `);
    }
  }
}

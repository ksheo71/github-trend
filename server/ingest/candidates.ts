import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';

export async function selectCandidates(db: DB, day: string): Promise<number[]> {
  const rows = await db.execute<{ repo_id: number }>(sql`
    SELECT repo_id FROM (
      SELECT repo_id FROM gh_trend.events_daily WHERE day = ${day} AND watch_events >= 10
      UNION
      SELECT id AS repo_id FROM gh_trend.repos WHERE fetched_at IS NULL
      UNION
      SELECT DISTINCT repo_id FROM gh_trend.trend_repo
    ) u
  `);
  return rows.rows.map((r) => Number(r.repo_id));
}

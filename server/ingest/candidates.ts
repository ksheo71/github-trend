import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';

// Hot-repo candidate threshold. WatchEvent count over the day.
// 1 keeps the candidate set in the low-thousands range on a typical GHArchive day
// (e.g. 2026-06-22 produced ~3,800 candidates at this threshold across ~860k touched repos).
const WATCH_EVENTS_THRESHOLD = 1;

export async function selectCandidates(db: DB, day: string): Promise<number[]> {
  const rows = await db.execute<{ repo_id: number }>(sql`
    SELECT repo_id FROM (
      SELECT repo_id FROM gh_trend.events_daily
        WHERE day = ${day} AND watch_events >= ${WATCH_EVENTS_THRESHOLD}
      UNION
      SELECT DISTINCT repo_id FROM gh_trend.trend_repo
    ) u
  `);
  return rows.rows.map((r) => Number(r.repo_id));
}

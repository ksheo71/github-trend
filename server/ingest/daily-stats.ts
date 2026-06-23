import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { addDays } from './time';

export type RepoStat = { repoId: number; stars: number; forks: number; watchers: number };

export async function upsertDailyStats(db: DB, day: string, stats: RepoStat[]): Promise<void> {
  if (stats.length === 0) return;
  const prevDay = addDays(day, -1);

  await db.transaction(async (tx) => {
    for (const s of stats) {
      await tx.execute(sql`
        WITH prev AS (
          SELECT stars FROM gh_trend.repo_daily_stats
          WHERE repo_id = ${s.repoId} AND day = ${prevDay}
        )
        INSERT INTO gh_trend.repo_daily_stats (repo_id, day, stars, forks, watchers, stars_delta)
        VALUES (
          ${s.repoId}, ${day}, ${s.stars}, ${s.forks}, ${s.watchers},
          (SELECT ${s.stars} - stars FROM prev)
        )
        ON CONFLICT (repo_id, day) DO UPDATE SET
          stars = EXCLUDED.stars,
          forks = EXCLUDED.forks,
          watchers = EXCLUDED.watchers,
          stars_delta = EXCLUDED.stars_delta
      `);
    }
  });
}

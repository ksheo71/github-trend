import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';

type Executor = Pick<DB, 'execute'>;

export async function rebuildTrendLanguageAll(db: Executor): Promise<void> {
  await db.execute(sql`TRUNCATE gh_trend.trend_language`);
  await db.execute(sql`
    INSERT INTO gh_trend.trend_language (period, language, hot_repo_count, total_stars_gained)
    SELECT t.period, COALESCE(r.language, 'Unknown') AS language,
           COUNT(*) AS hot_repo_count,
           SUM(t.star_gain)::bigint AS total_stars_gained
    FROM gh_trend.trend_repo t
    JOIN gh_trend.repos r ON r.id = t.repo_id
    WHERE t.language = 'ALL'
    GROUP BY t.period, COALESCE(r.language, 'Unknown')
  `);
}

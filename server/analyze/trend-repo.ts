import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { addDays } from '../ingest/time';

export const TOP_LANGUAGE_COUNT = 10;
const PERIODS: Array<{ name: 'day' | 'week' | 'month'; days: number }> = [
  { name: 'day', days: 1 }, { name: 'week', days: 7 }, { name: 'month', days: 30 },
];

type Executor = Pick<DB, 'execute'>;

export async function rebuildTrendRepoAll(db: Executor, endDay: string): Promise<void> {
  await db.execute(sql`TRUNCATE gh_trend.trend_repo`);

  const topLangsRes = await db.execute<{ language: string }>(sql`
    SELECT r.language FROM gh_trend.repos r
    JOIN gh_trend.repo_daily_stats s ON s.repo_id = r.id
    WHERE s.day > ${addDays(endDay, -30)} AND s.day <= ${endDay}
      AND r.language IS NOT NULL AND s.stars_delta > 0
    GROUP BY r.language
    ORDER BY SUM(s.stars_delta) DESC NULLS LAST
    LIMIT ${TOP_LANGUAGE_COUNT}
  `);
  const topLangs = topLangsRes.rows.map((r) => r.language);

  for (const period of PERIODS) {
    const start = addDays(endDay, -(period.days - 1));
    await db.execute(sql`
      INSERT INTO gh_trend.trend_repo (period, language, repo_id, star_gain, rank_by_star_gain, rank_by_stars)
      WITH gained AS (
        SELECT repo_id, COALESCE(SUM(stars_delta), 0)::int AS star_gain
        FROM gh_trend.repo_daily_stats
        WHERE day BETWEEN ${start} AND ${endDay} AND stars_delta > 0
        GROUP BY repo_id
      ),
      joined AS (
        SELECT r.id, r.language, g.star_gain, r.stars
        FROM gained g JOIN gh_trend.repos r ON r.id = g.repo_id
        WHERE r.stars IS NOT NULL AND g.star_gain > 0
      )
      SELECT ${period.name}::text AS period,
             'ALL'::text AS language,
             id, star_gain,
             ROW_NUMBER() OVER (ORDER BY star_gain DESC, stars DESC) AS rank_by_star_gain,
             ROW_NUMBER() OVER (ORDER BY stars DESC) AS rank_by_stars
      FROM joined
      ORDER BY star_gain DESC
      LIMIT 100
    `);

    for (const lang of topLangs) {
      await db.execute(sql`
        INSERT INTO gh_trend.trend_repo (period, language, repo_id, star_gain, rank_by_star_gain, rank_by_stars)
        WITH gained AS (
          SELECT repo_id, COALESCE(SUM(stars_delta), 0)::int AS star_gain
          FROM gh_trend.repo_daily_stats
          WHERE day BETWEEN ${start} AND ${endDay} AND stars_delta > 0
          GROUP BY repo_id
        ),
        joined AS (
          SELECT r.id, r.language, g.star_gain, r.stars
          FROM gained g JOIN gh_trend.repos r ON r.id = g.repo_id
          WHERE r.language = ${lang} AND r.stars IS NOT NULL AND g.star_gain > 0
        )
        SELECT ${period.name}::text, ${lang}::text, id, star_gain,
               ROW_NUMBER() OVER (ORDER BY star_gain DESC, stars DESC),
               ROW_NUMBER() OVER (ORDER BY stars DESC)
        FROM joined
        ORDER BY star_gain DESC
        LIMIT 100
      `);
    }
  }
}

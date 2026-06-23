import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startPg } from '../helpers/pg';
import { rebuildTrendRepoAll } from '../../server/analyze/trend-repo';
import { repos, repoDailyStats, trendRepo } from '../../server/db/schema';
import { and, eq } from 'drizzle-orm';

let env: Awaited<ReturnType<typeof startPg>>;

beforeAll(async () => { env = await startPg(); }, 120_000);
afterAll(async () => { await env.pool.end(); await env.container.stop(); });

beforeEach(async () => {
  await env.pool.query('TRUNCATE gh_trend.repo_daily_stats, gh_trend.repos, gh_trend.trend_repo');
});

describe('rebuildTrendRepoAll', () => {
  it('ranks by star_gain for "day" and writes ALL + language rows', async () => {
    await env.db.insert(repos).values([
      { id: 1, fullName: 'a/b', language: 'TypeScript', stars: 1000 },
      { id: 2, fullName: 'c/d', language: 'TypeScript', stars: 500 },
      { id: 3, fullName: 'e/f', language: 'Rust', stars: 200 },
    ]);
    await env.db.insert(repoDailyStats).values([
      { repoId: 1, day: '2026-06-22', stars: 1000, starsDelta: 100 },
      { repoId: 2, day: '2026-06-22', stars: 500, starsDelta: 200 },
      { repoId: 3, day: '2026-06-22', stars: 200, starsDelta: 50 },
    ]);

    await rebuildTrendRepoAll(env.db, '2026-06-22');

    const dayAll = await env.db.select().from(trendRepo)
      .where(and(eq(trendRepo.period, 'day'), eq(trendRepo.language, 'ALL')));
    const ordered = dayAll.sort((a, b) => (a.rankByStarGain ?? 0) - (b.rankByStarGain ?? 0));
    expect(ordered.map((r) => r.repoId)).toEqual([2, 1, 3]);

    const ts = await env.db.select().from(trendRepo)
      .where(and(eq(trendRepo.period, 'day'), eq(trendRepo.language, 'TypeScript')));
    expect(ts.map((r) => r.repoId).sort()).toEqual([1, 2]);
  });

  it('skips rows with NULL stars_delta (newly observed)', async () => {
    await env.db.insert(repos).values([{ id: 1, fullName: 'a/b', language: 'TypeScript', stars: 1000 }]);
    await env.db.insert(repoDailyStats).values([
      { repoId: 1, day: '2026-06-22', stars: 1000, starsDelta: null },
    ]);
    await rebuildTrendRepoAll(env.db, '2026-06-22');
    const rows = await env.db.select().from(trendRepo);
    expect(rows).toHaveLength(0);
  });

  it('week sums 7 days', async () => {
    await env.db.insert(repos).values([{ id: 1, fullName: 'a/b', language: 'TypeScript', stars: 1000 }]);
    const dates = ['2026-06-16','2026-06-17','2026-06-18','2026-06-19','2026-06-20','2026-06-21','2026-06-22'];
    await env.db.insert(repoDailyStats).values(
      dates.map((d) => ({ repoId: 1, day: d, stars: 1000, starsDelta: 10 })),
    );
    await rebuildTrendRepoAll(env.db, '2026-06-22');
    const week = await env.db.select().from(trendRepo)
      .where(and(eq(trendRepo.period, 'week'), eq(trendRepo.language, 'ALL'), eq(trendRepo.repoId, 1)));
    expect(week[0].starGain).toBe(70);
  });
});

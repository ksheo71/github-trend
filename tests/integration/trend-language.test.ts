import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startPg } from '../helpers/pg';
import { rebuildTrendRepoAll } from '../../server/analyze/trend-repo';
import { rebuildTrendLanguageAll } from '../../server/analyze/trend-language';
import { repos, repoDailyStats, trendLanguage } from '../../server/db/schema';
import { eq } from 'drizzle-orm';

let env: Awaited<ReturnType<typeof startPg>>;
beforeAll(async () => { env = await startPg(); }, 120_000);
afterAll(async () => { await env.pool.end(); await env.container.stop(); });
beforeEach(async () => {
  await env.pool.query('TRUNCATE gh_trend.repo_daily_stats, gh_trend.repos, gh_trend.trend_repo, gh_trend.trend_language');
});

describe('rebuildTrendLanguageAll', () => {
  it('aggregates language share over period ALL', async () => {
    await env.db.insert(repos).values([
      { id: 1, fullName: 'a/1', language: 'TypeScript', stars: 100 },
      { id: 2, fullName: 'a/2', language: 'TypeScript', stars: 100 },
      { id: 3, fullName: 'a/3', language: 'Rust', stars: 100 },
    ]);
    await env.db.insert(repoDailyStats).values([
      { repoId: 1, day: '2026-06-22', stars: 100, starsDelta: 100 },
      { repoId: 2, day: '2026-06-22', stars: 100, starsDelta: 50 },
      { repoId: 3, day: '2026-06-22', stars: 100, starsDelta: 30 },
    ]);
    await rebuildTrendRepoAll(env.db, '2026-06-22');
    await rebuildTrendLanguageAll(env.db);

    const day = await env.db.select().from(trendLanguage).where(eq(trendLanguage.period, 'day'));
    const ts = day.find((r) => r.language === 'TypeScript');
    const rs = day.find((r) => r.language === 'Rust');
    expect(ts?.hotRepoCount).toBe(2);
    expect(ts?.totalStarsGained).toBe(150);
    expect(rs?.hotRepoCount).toBe(1);
    expect(rs?.totalStarsGained).toBe(30);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startPg } from '../helpers/pg';
import { rebuildTrendKeywordAll } from '../../server/analyze/trend-keyword';
import { rebuildTrendRepoAll } from '../../server/analyze/trend-repo';
import { repos, repoDailyStats, trendKeyword } from '../../server/db/schema';
import { and, eq } from 'drizzle-orm';

let env: Awaited<ReturnType<typeof startPg>>;

beforeAll(async () => { env = await startPg(); }, 120_000);
afterAll(async () => { await env.pool.end(); await env.container.stop(); });

beforeEach(async () => {
  await env.pool.query('TRUNCATE gh_trend.repo_daily_stats, gh_trend.repos, gh_trend.trend_repo, gh_trend.trend_keyword');
});

describe('rebuildTrendKeywordAll', () => {
  it('emits keywords that meet mentions >= 3 and delta_pct >= 10%', async () => {
    // Now-period: 'agent' on 3 repos, 'rag' on 3 repos
    // Prior-period (day-1): 'agent' on 1 repo, 'rag' on 3 repos
    await env.db.insert(repos).values([
      { id: 1, fullName: 'a/1', stars: 100, topics: ['agent', 'rag'] },
      { id: 2, fullName: 'a/2', stars: 100, topics: ['agent'] },
      { id: 3, fullName: 'a/3', stars: 100, topics: ['agent', 'rag'] },
      { id: 4, fullName: 'a/4', stars: 100, topics: ['rag'] },
      { id: 5, fullName: 'a/5', stars: 100, topics: ['agent'] },        // prior-only
      { id: 6, fullName: 'a/6', stars: 100, topics: ['rag'] },          // prior-only
      { id: 7, fullName: 'a/7', stars: 100, topics: ['rag'] },          // prior-only
      // Correction 2: third prior 'rag' repo so prior 'rag' count = 3 (repos 6,7,8)
      { id: 8, fullName: 'a/8', stars: 100, topics: ['rag'] },          // prior-only
    ]);
    await env.db.insert(repoDailyStats).values([
      { repoId: 1, day: '2026-06-22', stars: 100, starsDelta: 50 },
      { repoId: 2, day: '2026-06-22', stars: 100, starsDelta: 40 },
      { repoId: 3, day: '2026-06-22', stars: 100, starsDelta: 30 },
      { repoId: 4, day: '2026-06-22', stars: 100, starsDelta: 20 },
      { repoId: 5, day: '2026-06-21', stars: 100, starsDelta: 30 },
      { repoId: 6, day: '2026-06-21', stars: 100, starsDelta: 30 },
      { repoId: 7, day: '2026-06-21', stars: 100, starsDelta: 30 },
      // Correction 2: stats for repo 8
      { repoId: 8, day: '2026-06-21', stars: 100, starsDelta: 30 },
    ]);

    // Correction 1: only one rebuildTrendRepoAll call (for endDay='2026-06-22')
    // The second call from the brief (`rebuildTrendRepoAll(env.db, '2026-06-21')`) is intentionally
    // omitted — it would TRUNCATE trend_repo and rebuild for the wrong end day, breaking candidateRepos().
    await rebuildTrendRepoAll(env.db, '2026-06-22');
    // For trend_keyword we expect day-period to compare yesterday vs day-before
    await rebuildTrendKeywordAll(env.db, '2026-06-22');

    const rows = await env.db.select().from(trendKeyword)
      .where(eq(trendKeyword.period, 'day'));
    const byKw = Object.fromEntries(rows.map((r) => [r.keyword, r]));
    expect(byKw['agent']).toBeTruthy();      // 3 mentions, +200%
    expect(byKw['rag']).toBeFalsy();         // 3 mentions, 0%, filtered out
  });
});

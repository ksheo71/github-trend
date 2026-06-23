import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startPg } from '../helpers/pg';
import { repos, repoDailyStats, trendRepo, trendKeyword, trendLanguage, ingestRuns } from '../../server/db/schema';
import { queryHotRepos, queryTopKeywords, queryLanguageBreakdown, queryLastIngest, queryRepoTimeseries } from '../../server/db/queries';

let env: Awaited<ReturnType<typeof startPg>>;
beforeAll(async () => { env = await startPg(); }, 120_000);
afterAll(async () => { await env.pool.end(); await env.container.stop(); });
beforeEach(async () => {
  await env.pool.query(`
    TRUNCATE gh_trend.ingest_runs RESTART IDENTITY;
    TRUNCATE gh_trend.repo_daily_stats, gh_trend.repos,
             gh_trend.trend_repo, gh_trend.trend_keyword, gh_trend.trend_language;
  `);
});

describe('queries', () => {
  it('queryHotRepos sorts by gain by default', async () => {
    await env.db.insert(repos).values([
      { id: 1, fullName: 'a/1', language: 'TypeScript', stars: 100, forks: 1, openIssues: 0, topics: ['agent'] },
      { id: 2, fullName: 'a/2', language: 'TypeScript', stars: 200, forks: 2, openIssues: 0, topics: [] },
    ]);
    await env.db.insert(trendRepo).values([
      { period: 'day', language: 'ALL', repoId: 1, starGain: 50, rankByStarGain: 2, rankByStars: 2 },
      { period: 'day', language: 'ALL', repoId: 2, starGain: 80, rankByStarGain: 1, rankByStars: 1 },
    ]);
    const result = await queryHotRepos(env.db, 'day', 'ALL', 'gain', 10);
    expect(result.map((r) => r.id)).toEqual([2, 1]);
    expect(result[0].topics).toEqual([]);
  });

  it('queryTopKeywords returns sorted-by-delta cards with sample repos', async () => {
    await env.db.insert(repos).values([
      { id: 1, fullName: 'a/1', language: 'TypeScript', stars: 100, topics: ['agent'] },
    ]);
    await env.db.insert(trendKeyword).values([
      { period: 'day', keyword: 'agent', mentions: 5, deltaPct: '200', sampleRepoIds: [1] },
      { period: 'day', keyword: 'mcp', mentions: 4, deltaPct: '300', sampleRepoIds: [] },
    ]);
    const result = await queryTopKeywords(env.db, 'day', 12);
    expect(result.map((r) => r.keyword)).toEqual(['mcp', 'agent']);
    expect(result[1].sampleRepos[0].fullName).toBe('a/1');
  });

  it('queryRepoTimeseries returns chronological stars', async () => {
    await env.db.insert(repos).values([{ id: 1, fullName: 'a/1' }]);
    await env.db.insert(repoDailyStats).values([
      { repoId: 1, day: '2026-06-20', stars: 100 },
      { repoId: 1, day: '2026-06-22', stars: 150 },
      { repoId: 1, day: '2026-06-21', stars: 120 },
    ]);
    const ts = await queryRepoTimeseries(env.db, 1, 30);
    expect(ts.map((t) => t.day)).toEqual(['2026-06-20', '2026-06-21', '2026-06-22']);
  });

  it('queryLastIngest returns most recent success', async () => {
    await env.db.insert(ingestRuns).values([
      { day: '2026-06-21', status: 'success', finishedAt: new Date('2026-06-22T04:30:00Z') },
      { day: '2026-06-22', status: 'success', finishedAt: new Date('2026-06-23T04:30:00Z') },
    ]);
    const last = await queryLastIngest(env.db);
    expect(last?.day).toBe('2026-06-22');
  });

  it('queryLanguageBreakdown returns sorted breakdown', async () => {
    await env.db.insert(trendLanguage).values([
      { period: 'day', language: 'TypeScript', hotRepoCount: 10, totalStarsGained: 500 },
      { period: 'day', language: 'Rust', hotRepoCount: 5, totalStarsGained: 200 },
    ]);
    const lb = await queryLanguageBreakdown(env.db, 'day');
    expect(lb[0].language).toBe('TypeScript');
  });
});

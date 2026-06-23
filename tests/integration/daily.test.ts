import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { startPg } from '../helpers/pg';
import { runDailyIngest } from '../../server/cron/daily';
import { ingestRuns, repos, repoDailyStats, trendRepo } from '../../server/db/schema';
import { eq } from 'drizzle-orm';

let env: Awaited<ReturnType<typeof startPg>>;

beforeAll(async () => { env = await startPg(); }, 120_000);
afterAll(async () => { await env.pool.end(); await env.container.stop(); });
beforeEach(async () => {
  await env.pool.query(`
    TRUNCATE gh_trend.ingest_runs RESTART IDENTITY;
    TRUNCATE gh_trend.repo_daily_stats, gh_trend.events_daily, gh_trend.repos,
             gh_trend.trend_repo, gh_trend.trend_keyword, gh_trend.trend_language;
  `);
});

function fakeHour(repoId: number, name: string) {
  const lines = Array.from({ length: 15 }, () => JSON.stringify({
    type: 'WatchEvent', repo: { id: repoId, name },
  })).join('\n') + '\n';
  return Readable.from([gzipSync(lines)]);
}

describe('runDailyIngest', () => {
  it('marks success and writes ingest_runs row', async () => {
    const result = await runDailyIngest({
      day: '2026-06-22', db: env.db,
      deps: {
        fetchHourStream: async () => fakeHour(101, 'octo/popular'),
        fetchRepo: async () => ({
          id: 101, fullName: 'octo/popular', description: 'desc',
          language: 'TypeScript', topics: ['agent'],
          homepage: null, license: 'MIT',
          stars: 500, forks: 10, openIssues: 1,
          createdAt: new Date('2026-06-01'), pushedAt: new Date('2026-06-22'),
        }),
      },
    });
    expect(result.status).toBe('success');

    const runs = await env.db.select().from(ingestRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('success');

    const r = await env.db.select().from(repos).where(eq(repos.id, 101));
    expect(r[0].language).toBe('TypeScript');

    const stats = await env.db.select().from(repoDailyStats).where(eq(repoDailyStats.repoId, 101));
    expect(stats[0].stars).toBe(500);

    const trend = await env.db.select().from(trendRepo).where(eq(trendRepo.repoId, 101));
    expect(trend.length).toBeGreaterThan(0);
  });

  it('is idempotent — second run for same day is skipped', async () => {
    const deps = {
      fetchHourStream: async () => fakeHour(101, 'octo/popular'),
      fetchRepo: async () => ({
        id: 101, fullName: 'octo/popular', description: null,
        language: 'TypeScript', topics: [],
        homepage: null, license: null,
        stars: 100, forks: 0, openIssues: 0,
        createdAt: new Date(), pushedAt: null,
      }),
    };
    await runDailyIngest({ day: '2026-06-22', db: env.db, deps });
    const second = await runDailyIngest({ day: '2026-06-22', db: env.db, deps });
    expect(second.status).toBe('skipped');
  });
});

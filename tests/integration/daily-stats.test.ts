import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg } from '../helpers/pg';
import { upsertDailyStats } from '../../server/ingest/daily-stats';
import { repos, repoDailyStats } from '../../server/db/schema';
import { eq, and } from 'drizzle-orm';

let env: Awaited<ReturnType<typeof startPg>>;

beforeAll(async () => { env = await startPg(); }, 120_000);
afterAll(async () => { await env.pool.end(); await env.container.stop(); });

describe('upsertDailyStats', () => {
  it('computes stars_delta vs prior day; NULL when no prior row', async () => {
    await env.db.insert(repos).values([{ id: 1, fullName: 'a/b' }]);

    await upsertDailyStats(env.db, '2026-06-21', [{ repoId: 1, stars: 100, forks: 5, watchers: 10 }]);
    const first = await env.db.select().from(repoDailyStats)
      .where(and(eq(repoDailyStats.repoId, 1), eq(repoDailyStats.day, '2026-06-21')));
    expect(first[0].starsDelta).toBeNull();

    await upsertDailyStats(env.db, '2026-06-22', [{ repoId: 1, stars: 130, forks: 5, watchers: 12 }]);
    const second = await env.db.select().from(repoDailyStats)
      .where(and(eq(repoDailyStats.repoId, 1), eq(repoDailyStats.day, '2026-06-22')));
    expect(second[0].starsDelta).toBe(30);
  });

  it('overwrites the same day on re-run', async () => {
    await env.db.insert(repos).values([{ id: 2, fullName: 'c/d' }]);
    await upsertDailyStats(env.db, '2026-06-22', [{ repoId: 2, stars: 50, forks: 1, watchers: 0 }]);
    await upsertDailyStats(env.db, '2026-06-22', [{ repoId: 2, stars: 80, forks: 1, watchers: 0 }]);
    const rows = await env.db.select().from(repoDailyStats)
      .where(and(eq(repoDailyStats.repoId, 2), eq(repoDailyStats.day, '2026-06-22')));
    expect(rows).toHaveLength(1);
    expect(rows[0].stars).toBe(80);
  });
});

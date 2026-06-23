import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg } from '../helpers/pg';
import { selectCandidates } from '../../server/ingest/candidates';
import { repos, eventsDaily, trendRepo } from '../../server/db/schema';

let env: Awaited<ReturnType<typeof startPg>>;

beforeAll(async () => { env = await startPg(); }, 120_000);
afterAll(async () => { await env.pool.end(); await env.container.stop(); });

describe('selectCandidates', () => {
  it('returns union of hot-today (watch_events ≥ 1) and previously-tracked', async () => {
    await env.db.insert(repos).values([
      { id: 1, fullName: 'a/b' },
      { id: 2, fullName: 'c/d' },
      { id: 3, fullName: 'e/f' },
      { id: 4, fullName: 'g/h' },
    ]);
    await env.db.insert(eventsDaily).values([
      { day: '2026-06-22', repoId: 1, watchEvents: 15 },           // hot
      { day: '2026-06-22', repoId: 2, watchEvents: 0 },            // not hot
      { day: '2026-06-22', repoId: 3, watchEvents: 2 },            // hot (≥1)
    ]);
    await env.db.insert(trendRepo).values([
      { period: 'week', language: 'ALL', repoId: 4, starGain: 50 }, // cold but in trend_repo
    ]);

    const ids = await selectCandidates(env.db, '2026-06-22');
    expect(ids.sort()).toEqual([1, 3, 4]);
  });
});

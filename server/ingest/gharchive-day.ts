import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { parseHourStream, type EventCounts, type RepoTouch } from './gharchive';
import { logger } from '../logger';

export type FetchHourStream = (day: string, hour: number) => Promise<NodeJS.ReadableStream>;

export const defaultFetchHourStream: FetchHourStream = async (day, hour) => {
  const url = `https://data.gharchive.org/${day}-${hour}.json.gz`;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`fetch ${url} ${res.status}`);
  // node 22 supports Web stream → Node stream
  const { Readable } = await import('node:stream');
  return Readable.fromWeb(res.body as any);
};

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 500 * 2 ** i)); }
  }
  throw last;
}

export async function ingestDay(
  db: DB,
  day: string,
  fetchHour: FetchHourStream = defaultFetchHourStream,
  concurrency = 4,
): Promise<{ filesParsed: number; reposTouched: number; events: number }> {
  const allCounts = new Map<number, EventCounts>();
  const allRepos = new Map<number, RepoTouch>();

  const hours = Array.from({ length: 24 }, (_, i) => i);
  let cursor = 0; let filesParsed = 0;

  async function worker() {
    while (cursor < hours.length) {
      const h = hours[cursor++];
      try {
        const { counts, repos } = await withRetry(async () =>
          parseHourStream(await fetchHour(day, h)));
        for (const [id, c] of counts) {
          const cur = allCounts.get(id);
          allCounts.set(id, cur ? sumCounts(cur, c) : c);
        }
        for (const [id, r] of repos) if (!allRepos.has(id)) allRepos.set(id, r);
        filesParsed++;
        logger.info({ stage: 'gharchive', day, hour: h, filesParsed }, 'hour parsed');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // GHArchive occasionally has missing/delayed hour files. Skip them rather than
        // aborting the whole day — partial coverage is more useful than nothing.
        if (/\b404\b/.test(msg)) {
          logger.warn({ stage: 'gharchive', day, hour: h, err: msg }, 'hour not available, skipping');
          continue;
        }
        throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  await db.transaction(async (tx) => {
    for (const rc of chunk([...allRepos.values()], INSERT_CHUNK)) {
      await tx.execute(sql`
        INSERT INTO gh_trend.repos (id, full_name)
        VALUES ${sql.join(rc.map((r) => sql`(${r.id}, ${r.fullName})`), sql`, `)}
        ON CONFLICT (id) DO NOTHING
      `);
    }
    for (const ec of chunk([...allCounts.entries()], INSERT_CHUNK)) {
      const values = ec.map(([id, c]) => sql`(
        ${day}, ${id}, ${c.watchEvents}, ${c.forkEvents}, ${c.pushEvents}, ${c.prEvents}, ${c.issueEvents}
      )`);
      await tx.execute(sql`
        INSERT INTO gh_trend.events_daily (day, repo_id, watch_events, fork_events, push_events, pr_events, issue_events)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (day, repo_id) DO UPDATE SET
          watch_events = EXCLUDED.watch_events,
          fork_events  = EXCLUDED.fork_events,
          push_events  = EXCLUDED.push_events,
          pr_events    = EXCLUDED.pr_events,
          issue_events = EXCLUDED.issue_events
      `);
    }
  });

  let totalEvents = 0;
  for (const c of allCounts.values()) totalEvents += c.watchEvents + c.forkEvents + c.pushEvents + c.prEvents + c.issueEvents;
  return { filesParsed, reposTouched: allRepos.size, events: totalEvents };
}

// Chunked INSERTs avoid Drizzle's recursive sql.join blowing the stack on large batches
// (24h of GHArchive can produce 100k+ event rows).
const INSERT_CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sumCounts(a: EventCounts, b: EventCounts): EventCounts {
  return {
    watchEvents: a.watchEvents + b.watchEvents,
    forkEvents:  a.forkEvents  + b.forkEvents,
    pushEvents:  a.pushEvents  + b.pushEvents,
    prEvents:    a.prEvents    + b.prEvents,
    issueEvents: a.issueEvents + b.issueEvents,
  };
}

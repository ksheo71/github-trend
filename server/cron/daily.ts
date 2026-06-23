import { sql, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { ingestRuns, repos } from '../db/schema';
import { logger } from '../logger';
import { ingestDay, type FetchHourStream, defaultFetchHourStream } from '../ingest/gharchive-day';
import { selectCandidates } from '../ingest/candidates';
import { fetchRepo as defaultFetchRepo, type RepoMeta, RateLimiter } from '../ingest/github-api';
import { upsertDailyStats } from '../ingest/daily-stats';
import { runAllAggregations } from '../analyze/aggregate';
import { addDays } from '../ingest/time';

export type Deps = {
  fetchHourStream: FetchHourStream;
  fetchRepo: (fullName: string) => Promise<RepoMeta | null>;
};

const RETENTION_DAYS = 35;

export async function runDailyIngest(opts: {
  day: string;
  db: DB;
  deps?: Partial<Deps>;
}): Promise<{ status: 'success' | 'failed' | 'skipped'; stats: Record<string, unknown> }> {
  const { day, db } = opts;
  const deps: Deps = {
    fetchHourStream: opts.deps?.fetchHourStream ?? defaultFetchHourStream,
    fetchRepo: opts.deps?.fetchRepo ?? ((name) => defaultFetchRepo(name)),
  };

  // 1. Lock / idempotency
  const existing = await db.select().from(ingestRuns).where(eq(ingestRuns.day, day));
  const finished = existing.find((r) => r.status === 'success');
  if (finished) {
    logger.info({ day }, 'already finished, skipping');
    return { status: 'skipped', stats: { reason: 'already-success' } };
  }
  const [run] = await db.insert(ingestRuns).values({ day, status: 'running' }).returning();

  try {
    // 2. GHArchive parsing
    const gh = await ingestDay(db, day, deps.fetchHourStream);
    logger.info({ stage: 'gharchive-day', ...gh }, 'parsed');

    // 3. Candidate selection
    const candidates = await selectCandidates(db, day);
    logger.info({ candidates: candidates.length }, 'candidates');

    // 4. GitHub REST enrichment (concurrency 5, 1000ms gate via RateLimiter)
    const limiter = new RateLimiter(5, 1_000);
    const metas: RepoMeta[] = [];
    await Promise.all(candidates.map(async (id) => {
      await limiter.acquire();
      const row = await db.select({ fullName: repos.fullName }).from(repos).where(eq(repos.id, id));
      const fullName = row[0]?.fullName;
      if (!fullName) return;
      try {
        const m = await deps.fetchRepo(fullName);
        if (m) metas.push(m);
      } catch (e) {
        logger.warn({ fullName, err: String(e) }, 'github fetch failed');
      }
    }));

    // upsert metadata + fetched_at
    if (metas.length) {
      await db.transaction(async (tx) => {
        for (const m of metas) {
          const topicsExpr = m.topics.length === 0
            ? sql.raw(`ARRAY[]::text[]`)
            : sql.raw(`ARRAY[${m.topics.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]`);
          await tx.execute(sql`
            INSERT INTO gh_trend.repos (id, full_name, description, language, topics, homepage, license,
                                        stars, forks, open_issues, created_at, pushed_at, fetched_at)
            VALUES (${m.id}, ${m.fullName}, ${m.description}, ${m.language}, ${topicsExpr}, ${m.homepage}, ${m.license},
                    ${m.stars}, ${m.forks}, ${m.openIssues}, ${m.createdAt}, ${m.pushedAt}, NOW())
            ON CONFLICT (id) DO UPDATE SET
              full_name = EXCLUDED.full_name, description = EXCLUDED.description,
              language = EXCLUDED.language, topics = EXCLUDED.topics,
              homepage = EXCLUDED.homepage, license = EXCLUDED.license,
              stars = EXCLUDED.stars, forks = EXCLUDED.forks, open_issues = EXCLUDED.open_issues,
              created_at = EXCLUDED.created_at, pushed_at = EXCLUDED.pushed_at,
              fetched_at = NOW()
          `);
        }
      });
    }

    // 5. Daily snapshot
    await upsertDailyStats(db, day, metas.map((m) => ({
      repoId: m.id, stars: m.stars, forks: m.forks, watchers: m.stars,
    })));

    // Backfill stars_delta for new repos with no prior day row (treat initial stars as gain)
    await db.execute(sql`
      UPDATE gh_trend.repo_daily_stats
      SET stars_delta = stars
      WHERE day = ${day} AND stars_delta IS NULL AND stars > 0
    `);

    // 6. Aggregations
    await runAllAggregations(db, day);

    // 7. Retention
    const cutoff = addDays(day, -RETENTION_DAYS);
    await db.execute(sql`DELETE FROM gh_trend.repo_daily_stats WHERE day < ${cutoff}`);
    await db.execute(sql`DELETE FROM gh_trend.events_daily WHERE day < ${cutoff}`);
    await db.execute(sql`DELETE FROM gh_trend.ingest_runs WHERE started_at < NOW() - INTERVAL '30 days'`);

    // 8. Mark success
    const stats = {
      gharchive: gh, candidates: candidates.length, enriched: metas.length,
    };
    await db.update(ingestRuns)
      .set({ status: 'success', finishedAt: new Date(), stats })
      .where(eq(ingestRuns.id, run.id));

    logger.info({ day, stats }, 'ingest success');
    return { status: 'success', stats };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    logger.error({ day, err: msg }, 'ingest failed');
    await db.update(ingestRuns)
      .set({ status: 'failed', finishedAt: new Date(), error: msg })
      .where(eq(ingestRuns.id, run.id));
    return { status: 'failed', stats: {} };
  }
}

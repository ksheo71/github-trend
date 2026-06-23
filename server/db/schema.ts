import {
  pgSchema,
  bigint,
  bigserial,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  numeric,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const gh = pgSchema('gh_trend');

export const repos = gh.table(
  'repos',
  {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    fullName: text('full_name').notNull(),
    description: text('description'),
    language: text('language'),
    topics: text('topics').array(),
    homepage: text('homepage'),
    license: text('license'),
    stars: integer('stars'),
    forks: integer('forks'),
    openIssues: integer('open_issues'),
    createdAt: timestamp('created_at', { withTimezone: true }),
    pushedAt: timestamp('pushed_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  },
  (t) => ({ fullNameIdx: index('repos_full_name_idx').on(t.fullName) }),
);

export const repoDailyStats = gh.table(
  'repo_daily_stats',
  {
    repoId: bigint('repo_id', { mode: 'number' }).notNull().references(() => repos.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    stars: integer('stars'),
    forks: integer('forks'),
    watchers: integer('watchers'),
    starsDelta: integer('stars_delta'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.repoId, t.day] }), dayIdx: index('rds_day_idx').on(t.day) }),
);

export const eventsDaily = gh.table(
  'events_daily',
  {
    day: date('day').notNull(),
    repoId: bigint('repo_id', { mode: 'number' }).notNull(),
    watchEvents: integer('watch_events').notNull().default(0),
    forkEvents: integer('fork_events').notNull().default(0),
    pushEvents: integer('push_events').notNull().default(0),
    prEvents: integer('pr_events').notNull().default(0),
    issueEvents: integer('issue_events').notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.day, t.repoId] }) }),
);

export const trendRepo = gh.table(
  'trend_repo',
  {
    period: text('period').notNull(),
    language: text('language').notNull(),
    repoId: bigint('repo_id', { mode: 'number' }).notNull(),
    starGain: integer('star_gain').notNull().default(0),
    rankByStarGain: integer('rank_by_star_gain'),
    rankByStars: integer('rank_by_stars'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.period, t.language, t.repoId] }) }),
);

export const trendKeyword = gh.table(
  'trend_keyword',
  {
    period: text('period').notNull(),
    keyword: text('keyword').notNull(),
    mentions: integer('mentions').notNull(),
    deltaPct: numeric('delta_pct').notNull(),
    sampleRepoIds: bigint('sample_repo_ids', { mode: 'number' }).array().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.period, t.keyword] }) }),
);

export const trendLanguage = gh.table(
  'trend_language',
  {
    period: text('period').notNull(),
    language: text('language').notNull(),
    hotRepoCount: integer('hot_repo_count').notNull(),
    totalStarsGained: bigint('total_stars_gained', { mode: 'number' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.period, t.language] }) }),
);

export const ingestRuns = gh.table('ingest_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  day: date('day').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(),
  stats: jsonb('stats'),
  error: text('error'),
});

# GitHub Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public daily GitHub trend dashboard served at https://github-trend.myazit.kr.

**Architecture:** Single Next.js (App Router) container on a Mac mini, behind the user's Caddy (which is fronted by an existing Cloudflare Tunnel for `*.myazit.kr`). A node-cron worker inside the same process runs once at 04:00 KST to stream-parse the previous day's GHArchive `.json.gz` files and enrich hot-repo candidates via the GitHub REST API, then rebuilds three materialized aggregate tables in a shared Postgres (schema `gh_trend`). All pages SSR by reading only the aggregate tables — they never hit GitHub.

**Tech Stack:**
- Next.js 15 (App Router, TypeScript, server components)
- Drizzle ORM + node-postgres against a shared Postgres
- Vitest + Testcontainers for integration
- node-cron for scheduling
- pino for logging
- Recharts + shadcn/ui + Tailwind for the UI
- Docker (node:22-alpine) + docker-compose, runs alongside an external `shared_pg` and `caddy_net` docker network

## Global Constraints

- Domain: `https://github-trend.myazit.kr`
- Public, no auth
- All timestamps stored in UTC; KST shown only at render time. `TZ=Asia/Seoul` in the container so cron strings are interpreted as KST.
- Postgres schema namespace: `gh_trend`. Never create tables outside this schema.
- GitHub repo `id` (bigint) is the canonical PK everywhere. `full_name` is mutable.
- Data retention: `repo_daily_stats` and `events_daily` are deleted when `day < now() − 35 days`. `ingest_runs` deleted when older than 30 days.
- One ingest run per UTC day (`ingest_runs` enforces idempotency). Manual re-run via CLI is allowed and must overwrite cleanly.
- Page cache: `revalidate = 600` (10 minutes).
- Discord webhook URL is optional; if `DISCORD_WEBHOOK_URL` is unset, fall back to console-only error reporting.
- No host port exposure in compose — Caddy reaches the container by name on `caddy_net`.

---

## File Structure

```
github-trend/
├─ app/
│  ├─ layout.tsx
│  ├─ globals.css
│  ├─ page.tsx                          main dashboard
│  ├─ error.tsx                         user-facing fallback
│  ├─ trending/page.tsx                 full top-100 list
│  ├─ keyword/[name]/page.tsx           keyword detail
│  ├─ repo/[id]/page.tsx                repo detail + sparkline
│  └─ api/
│     ├─ trending/route.ts
│     ├─ keywords/route.ts
│     ├─ languages/route.ts
│     └─ repo/[id]/timeseries/route.ts
├─ components/
│  ├─ ui/                               shadcn primitives (button, card, tabs, badge)
│  ├─ period-tabs.tsx
│  ├─ language-breakdown.tsx
│  ├─ keyword-cloud.tsx
│  ├─ hot-repo-list.tsx
│  ├─ repo-sparkline.tsx
│  └─ stale-banner.tsx
├─ server/
│  ├─ db/
│  │  ├─ client.ts
│  │  ├─ schema.ts
│  │  └─ queries.ts                     page-side query functions
│  ├─ ingest/
│  │  ├─ time.ts                        UTC-yesterday + KST helpers
│  │  ├─ gharchive.ts                   stream-parse one .json.gz
│  │  ├─ gharchive-day.ts               24-file orchestration
│  │  ├─ github-api.ts                  REST client with rate-limit
│  │  ├─ candidates.ts                  hot-repo candidate selection
│  │  └─ daily-stats.ts                 repo_daily_stats upsert
│  ├─ analyze/
│  │  ├─ stopwords.ts
│  │  ├─ normalize.ts
│  │  ├─ trend-repo.ts
│  │  ├─ trend-keyword.ts
│  │  ├─ trend-language.ts
│  │  └─ aggregate.ts                   transaction wrapper
│  ├─ cron/
│  │  ├─ daily.ts                       runDailyIngest
│  │  └─ register.ts                    boot-time cron registration
│  ├─ notify/
│  │  └─ discord.ts
│  └─ logger.ts
├─ scripts/
│  ├─ ingest.ts                         CLI wrapper for runDailyIngest
│  └─ migrate.ts                        runs drizzle migrations
├─ db/migrations/                       drizzle output
├─ tests/
│  ├─ unit/
│  └─ integration/
├─ docker/
│  ├─ Dockerfile
│  └─ entrypoint.sh
├─ docker-compose.yml
├─ drizzle.config.ts
├─ next.config.ts
├─ tailwind.config.ts
├─ postcss.config.mjs
├─ tsconfig.json
├─ vitest.config.ts
├─ package.json
├─ .env.example
├─ .gitignore
├─ .dockerignore
└─ README.md
```

Each `server/` subpackage holds one concern. Anything UI lives in `components/` or `app/`. CLI scripts only orchestrate; they never reimplement business logic.

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `.gitignore`, `.dockerignore`, `.env.example`, `vitest.config.ts`, `README.md`

**Interfaces:**
- Consumes: nothing
- Produces: a runnable Next.js skeleton; subsequent tasks add server code under `server/` and pages under `app/`.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.next/
.env
.env.local
dist/
coverage/
.DS_Store
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
.next
.git
coverage
tests
docs
*.md
.env*
!.env.example
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "github-trend",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate:generate": "drizzle-kit generate",
    "migrate": "tsx scripts/migrate.ts",
    "ingest": "tsx scripts/ingest.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "next": "^15.1.0",
    "node-cron": "^3.0.3",
    "pg": "^8.13.0",
    "pino": "^9.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.13.0",
    "tailwind-merge": "^2.5.0",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.16.0",
    "@types/node": "^22.10.0",
    "@types/node-cron": "^3.0.11",
    "@types/pg": "^8.11.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.30.0",
    "msw": "^2.6.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "testcontainers": "^10.16.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create `next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { typedRoutes: true },
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 6: Create Tailwind/PostCSS configs**

`tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#10b981', foreground: '#052e1d' },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
```

`postcss.config.mjs`:
```javascript
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 7: Create `app/globals.css`, `app/layout.tsx`, placeholder `app/page.tsx`**

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html { color-scheme: dark; }
body { @apply bg-zinc-950 text-zinc-100 antialiased; }
```

`app/layout.tsx`:
```tsx
import './globals.css';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata = {
  title: 'GitHub Trend',
  description: '매일 새벽 갱신되는 GitHub 트렌드 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
```

`app/page.tsx` (placeholder, replaced in Task 17):
```tsx
export default function Home() {
  return <main className="p-8">GitHub Trend — work in progress</main>;
}
```

- [ ] **Step 8: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
  resolve: { alias: { '@': '/' } },
});
```

- [ ] **Step 9: Create `.env.example`**

```
DATABASE_URL=postgres://gh_trend:password@localhost:5432/postgres
GITHUB_TOKEN=
DISCORD_WEBHOOK_URL=
LOG_LEVEL=info
TZ=Asia/Seoul
```

- [ ] **Step 10: Create a minimal `README.md` placeholder (final content in Task 20)**

```markdown
# GitHub Trend

Public daily GitHub repository trend dashboard. See `docs/superpowers/specs/2026-06-23-github-trend-design.md` for the design.

## Status

Bootstrap stage. See `docs/superpowers/plans/2026-06-23-github-trend.md` for the implementation plan.
```

- [ ] **Step 11: Install and verify the skeleton builds**

```bash
npm install
npm run build
```

Expected: build succeeds; `.next/standalone` is produced.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next.js + Tailwind + Vitest skeleton"
```

---

## Task 2: Database Schema and Migrations

**Files:**
- Create: `server/db/schema.ts`, `server/db/client.ts`, `drizzle.config.ts`, `scripts/migrate.ts`, `db/migrations/0000_init.sql` (generated)

**Interfaces:**
- Consumes: env var `DATABASE_URL`
- Produces:
  - `db` (drizzle instance) and `pool` (pg Pool) from `@/server/db/client`
  - Drizzle table objects exported from `@/server/db/schema`: `repos`, `repoDailyStats`, `eventsDaily`, `trendRepo`, `trendKeyword`, `trendLanguage`, `ingestRuns`

- [ ] **Step 1: Create `server/db/client.ts`**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

export const pool = new Pool({ connectionString: url, max: 10 });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
```

- [ ] **Step 2: Create `server/db/schema.ts`**

```typescript
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
```

- [ ] **Step 3: Create `drizzle.config.ts`**

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './server/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  schemaFilter: ['gh_trend'],
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

- [ ] **Step 4: Create `scripts/migrate.ts`**

```typescript
import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../server/db/client';

async function main() {
  await pool.query('CREATE SCHEMA IF NOT EXISTS gh_trend');
  await migrate(db, { migrationsFolder: './db/migrations' });
  await pool.end();
  console.log('migration complete');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Add `dotenv` to deps:

```bash
npm install dotenv
```

- [ ] **Step 5: Generate the initial migration**

```bash
DATABASE_URL=postgres://stub:stub@localhost:5432/stub npm run migrate:generate
```

Expected: `db/migrations/0000_init.sql` and `meta/_journal.json` are created.

- [ ] **Step 6: Write a smoke integration test for schema bring-up**

`tests/integration/schema.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../../server/db/schema';

let container: StartedPostgreSqlContainer;
let pool: Pool;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await pool.query('CREATE SCHEMA gh_trend');
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: './db/migrations' });
}, 120_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
});

describe('schema', () => {
  it('creates all expected tables in gh_trend', async () => {
    const { rows } = await pool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'gh_trend' ORDER BY table_name
    `);
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual([
      'events_daily',
      'ingest_runs',
      'repo_daily_stats',
      'repos',
      'trend_keyword',
      'trend_language',
      'trend_repo',
    ]);
  });
});
```

- [ ] **Step 7: Run the test**

```bash
npm test -- schema
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): drizzle schema and migrations for gh_trend"
```

---

## Task 3: Time Utilities

**Files:**
- Create: `server/ingest/time.ts`, `tests/unit/time.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions, accept a `now: Date` parameter for testability)
- Produces:
  - `utcDayBefore(now: Date): string` → ISO date `YYYY-MM-DD` (UTC) for the day before `now`
  - `kstFormat(d: Date): string` → e.g. `2026-06-23 04:42 KST`
  - `addDays(day: string, delta: number): string` → ISO date arithmetic
  - `dayRange(end: string, len: number): string[]` → inclusive list ending at `end`, length `len`

- [ ] **Step 1: Write failing tests**

`tests/unit/time.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { utcDayBefore, kstFormat, addDays, dayRange } from '../../server/ingest/time';

describe('time utilities', () => {
  it('utcDayBefore returns yesterday in UTC', () => {
    expect(utcDayBefore(new Date('2026-06-23T19:00:00Z'))).toBe('2026-06-22');
    expect(utcDayBefore(new Date('2026-06-23T00:00:01Z'))).toBe('2026-06-22');
  });

  it('kstFormat renders KST wall clock', () => {
    expect(kstFormat(new Date('2026-06-22T19:42:00Z'))).toBe('2026-06-23 04:42 KST');
  });

  it('addDays advances/regresses ISO date', () => {
    expect(addDays('2026-06-22', 1)).toBe('2026-06-23');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('dayRange returns inclusive list ending at end', () => {
    expect(dayRange('2026-06-22', 3)).toEqual(['2026-06-20', '2026-06-21', '2026-06-22']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- time
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `server/ingest/time.ts`**

```typescript
export function utcDayBefore(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function dayRange(end: string, len: number): string[] {
  const out: string[] = [];
  for (let i = len - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

export function kstFormat(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} KST`;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- time
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingest): time utilities"
```

---

## Task 4: Keyword Normalization and Stopwords

**Files:**
- Create: `server/analyze/stopwords.ts`, `server/analyze/normalize.ts`, `tests/unit/normalize.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `STOPWORDS: ReadonlySet<string>`
  - `normalizeTopics(topics: string[] | null | undefined): string[]` — lowercases, trims, dedupes, removes stopwords. Returns `[]` for nullish input.

- [ ] **Step 1: Write failing test**

`tests/unit/normalize.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { normalizeTopics } from '../../server/analyze/normalize';

describe('normalizeTopics', () => {
  it('lowercases and trims', () => {
    expect(normalizeTopics(['  ML ', 'Agentic'])).toEqual(['ml', 'agentic']);
  });
  it('removes stopwords (generic + language names)', () => {
    expect(normalizeTopics(['awesome', 'python', 'agent'])).toEqual(['agent']);
  });
  it('dedupes', () => {
    expect(normalizeTopics(['ai', 'AI', 'ai'])).toEqual(['ai']);
  });
  it('handles nullish', () => {
    expect(normalizeTopics(null)).toEqual([]);
    expect(normalizeTopics(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- normalize
```

- [ ] **Step 3: Implement**

`server/analyze/stopwords.ts`:
```typescript
export const STOPWORDS: ReadonlySet<string> = new Set([
  'awesome', 'tutorial', 'learning', 'example', 'examples',
  'boilerplate', 'template', 'starter', 'demo',
  'python', 'javascript', 'typescript', 'rust', 'go', 'golang',
  'cpp', 'c-plus-plus', 'csharp', 'java', 'kotlin', 'swift',
  'ruby', 'php', 'shell', 'bash', 'html', 'css',
  'nodejs', 'react', 'vue', 'angular',
]);
```

`server/analyze/normalize.ts`:
```typescript
import { STOPWORDS } from './stopwords';

export function normalizeTopics(topics: readonly string[] | null | undefined): string[] {
  if (!topics) return [];
  const seen = new Set<string>();
  for (const raw of topics) {
    const t = raw.trim().toLowerCase();
    if (!t || STOPWORDS.has(t)) continue;
    seen.add(t);
  }
  return [...seen];
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- normalize
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analyze): keyword normalization + stopwords"
```

---

## Task 5: GHArchive Event Parser

**Files:**
- Create: `server/ingest/gharchive.ts`, `tests/unit/gharchive.test.ts`, `tests/fixtures/gharchive-sample.json.gz`

**Interfaces:**
- Consumes: `server/db/schema` (only for the upsert in next task — here parse is pure)
- Produces:
  - Type `EventCounts = { watchEvents: number; forkEvents: number; pushEvents: number; prEvents: number; issueEvents: number }`
  - Type `RepoTouch = { id: number; fullName: string }`
  - `parseHourStream(stream: NodeJS.ReadableStream): Promise<{ counts: Map<number, EventCounts>; repos: Map<number, RepoTouch> }>` — accepts a gzipped JSON-lines stream (so `gunzip` is built in), returns aggregated counts keyed by repo id.

- [ ] **Step 1: Create fixture (5 lines covering each event type + duplicates)**

```bash
node -e '
const events = [
  {type:"WatchEvent",repo:{id:1,name:"a/b"}},
  {type:"WatchEvent",repo:{id:1,name:"a/b"}},
  {type:"ForkEvent",repo:{id:2,name:"c/d"}},
  {type:"PushEvent",repo:{id:1,name:"a/b"}},
  {type:"PullRequestEvent",repo:{id:2,name:"c/d"}},
  {type:"IssuesEvent",repo:{id:2,name:"c/d"}},
  {type:"CreateEvent",repo:{id:3,name:"e/f"}}
];
const zlib = require("zlib"); const fs = require("fs");
const lines = events.map(e=>JSON.stringify(e)).join("\n") + "\n";
fs.writeFileSync("tests/fixtures/gharchive-sample.json.gz", zlib.gzipSync(lines));
'
```

- [ ] **Step 2: Write failing test**

`tests/unit/gharchive.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createReadStream } from 'node:fs';
import { parseHourStream } from '../../server/ingest/gharchive';

describe('parseHourStream', () => {
  it('aggregates relevant event counts and ignores unrelated types', async () => {
    const s = createReadStream('tests/fixtures/gharchive-sample.json.gz');
    const { counts, repos } = await parseHourStream(s);

    expect(counts.size).toBe(2);
    expect(counts.get(1)).toEqual({
      watchEvents: 2, forkEvents: 0, pushEvents: 1, prEvents: 0, issueEvents: 0,
    });
    expect(counts.get(2)).toEqual({
      watchEvents: 0, forkEvents: 1, pushEvents: 0, prEvents: 1, issueEvents: 1,
    });
    expect(repos.get(1)).toEqual({ id: 1, fullName: 'a/b' });
    expect(repos.get(2)).toEqual({ id: 2, fullName: 'c/d' });
    expect(counts.has(3)).toBe(false);
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

```bash
npm test -- gharchive
```

- [ ] **Step 4: Implement**

`server/ingest/gharchive.ts`:
```typescript
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

export type EventCounts = {
  watchEvents: number;
  forkEvents: number;
  pushEvents: number;
  prEvents: number;
  issueEvents: number;
};

export type RepoTouch = { id: number; fullName: string };

const EMPTY: EventCounts = {
  watchEvents: 0, forkEvents: 0, pushEvents: 0, prEvents: 0, issueEvents: 0,
};

function add(c: EventCounts, key: keyof EventCounts): EventCounts {
  return { ...c, [key]: c[key] + 1 };
}

export async function parseHourStream(input: NodeJS.ReadableStream): Promise<{
  counts: Map<number, EventCounts>;
  repos: Map<number, RepoTouch>;
}> {
  const counts = new Map<number, EventCounts>();
  const repos = new Map<number, RepoTouch>();
  const stream = input.pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let e: { type?: string; repo?: { id?: number; name?: string } };
    try { e = JSON.parse(line); } catch { continue; }
    const id = e.repo?.id;
    const fullName = e.repo?.name;
    if (typeof id !== 'number' || typeof fullName !== 'string') continue;
    let key: keyof EventCounts | null = null;
    switch (e.type) {
      case 'WatchEvent':       key = 'watchEvents'; break;
      case 'ForkEvent':        key = 'forkEvents'; break;
      case 'PushEvent':        key = 'pushEvents'; break;
      case 'PullRequestEvent': key = 'prEvents'; break;
      case 'IssuesEvent':      key = 'issueEvents'; break;
      default: continue;
    }
    counts.set(id, add(counts.get(id) ?? EMPTY, key));
    if (!repos.has(id)) repos.set(id, { id, fullName });
  }
  return { counts, repos };
}
```

- [ ] **Step 5: Run, expect PASS**

```bash
npm test -- gharchive
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ingest): stream-parse GHArchive hourly file"
```

---

## Task 6: GitHub REST Client

**Files:**
- Create: `server/ingest/github-api.ts`, `tests/unit/github-api.test.ts`

**Interfaces:**
- Consumes: env `GITHUB_TOKEN`
- Produces:
  - Type `RepoMeta = { id: number; fullName: string; description: string | null; language: string | null; topics: string[]; homepage: string | null; license: string | null; stars: number; forks: number; openIssues: number; createdAt: Date; pushedAt: Date | null }`
  - `fetchRepo(fullName: string, opts?: { fetch?: typeof fetch }): Promise<RepoMeta | null>` — returns `null` on 404/410/451 (private/deleted). Throws on other non-2xx so the orchestrator can decide.
  - `RateLimiter` class:
    - `constructor(perInterval: number, intervalMs: number)` — token-bucket
    - `acquire(): Promise<void>`
  - Internal: on rate-limit response (`x-ratelimit-remaining`) ≤ 100, sleeps until `x-ratelimit-reset`.

- [ ] **Step 1: Write failing tests using a fake fetch**

`tests/unit/github-api.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { fetchRepo, RateLimiter } from '../../server/ingest/github-api';

function makeFetch(response: { status: number; body?: object; headers?: Record<string, string> }) {
  return async () => new Response(JSON.stringify(response.body ?? {}), {
    status: response.status,
    headers: response.headers,
  });
}

describe('fetchRepo', () => {
  it('maps 200 response to RepoMeta', async () => {
    process.env.GITHUB_TOKEN = 'test';
    const fake = makeFetch({
      status: 200,
      body: {
        id: 42, full_name: 'a/b', description: 'desc',
        language: 'TypeScript', topics: ['ai', 'agent'],
        homepage: 'https://x', license: { spdx_id: 'MIT' },
        stargazers_count: 100, forks_count: 5, open_issues_count: 2,
        created_at: '2026-01-01T00:00:00Z', pushed_at: '2026-06-01T00:00:00Z',
      },
      headers: { 'x-ratelimit-remaining': '500', 'x-ratelimit-reset': '0' },
    });
    const r = await fetchRepo('a/b', { fetch: fake });
    expect(r).toMatchObject({ id: 42, fullName: 'a/b', stars: 100, topics: ['ai', 'agent'], license: 'MIT' });
  });

  it('returns null on 404', async () => {
    process.env.GITHUB_TOKEN = 'test';
    const fake = makeFetch({ status: 404 });
    expect(await fetchRepo('x/y', { fetch: fake })).toBeNull();
  });

  it('throws on 500', async () => {
    process.env.GITHUB_TOKEN = 'test';
    const fake = makeFetch({ status: 500 });
    await expect(fetchRepo('x/y', { fetch: fake })).rejects.toThrow();
  });
});

describe('RateLimiter', () => {
  it('allows N tokens before blocking', async () => {
    const rl = new RateLimiter(3, 1_000);
    await rl.acquire(); await rl.acquire(); await rl.acquire();
    const start = Date.now();
    const pending = rl.acquire();
    await new Promise((r) => setTimeout(r, 50));
    expect(Date.now() - start).toBeLessThan(900);
    // we don't await pending in test; allow GC
    void pending;
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- github-api
```

- [ ] **Step 3: Implement**

`server/ingest/github-api.ts`:
```typescript
export type RepoMeta = {
  id: number;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  homepage: string | null;
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: Date;
  pushedAt: Date | null;
};

export class RateLimiter {
  private tokens: number;
  private queue: Array<() => void> = [];
  constructor(private readonly perInterval: number, private readonly intervalMs: number) {
    this.tokens = perInterval;
    setInterval(() => {
      this.tokens = perInterval;
      while (this.tokens > 0 && this.queue.length) {
        this.tokens--;
        this.queue.shift()!();
      }
    }, intervalMs).unref?.();
  }
  acquire(): Promise<void> {
    if (this.tokens > 0) { this.tokens--; return Promise.resolve(); }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }
}

const NULL_SET = new Set([404, 410, 451]);

type FetchLike = typeof fetch;

export async function fetchRepo(fullName: string, opts: { fetch?: FetchLike } = {}): Promise<RepoMeta | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set');
  const f = opts.fetch ?? fetch;
  const res = await f(`https://api.github.com/repos/${fullName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'github-trend-bot',
    },
  });
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? '5000');
  if (remaining <= 100) {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? '0') * 1000;
    const wait = Math.max(0, reset - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  if (NULL_SET.has(res.status)) return null;
  if (!res.ok) throw new Error(`github ${fullName} ${res.status}`);
  const j = (await res.json()) as any;
  return {
    id: j.id,
    fullName: j.full_name,
    description: j.description ?? null,
    language: j.language ?? null,
    topics: Array.isArray(j.topics) ? j.topics : [],
    homepage: j.homepage ?? null,
    license: j.license?.spdx_id ?? null,
    stars: j.stargazers_count ?? 0,
    forks: j.forks_count ?? 0,
    openIssues: j.open_issues_count ?? 0,
    createdAt: new Date(j.created_at),
    pushedAt: j.pushed_at ? new Date(j.pushed_at) : null,
  };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- github-api
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingest): GitHub REST client with rate limiter"
```

---

## Task 7: Candidate Selection

**Files:**
- Create: `server/ingest/candidates.ts`, `tests/integration/candidates.test.ts`, `tests/helpers/pg.ts`

**Interfaces:**
- Consumes: `db: DB`, parameter `day: string`
- Produces:
  - `selectCandidates(db: DB, day: string): Promise<number[]>` — returns repo ids that satisfy: `events_daily.watch_events >= 10` on `day`, OR newly-touched (no row in `repos.fetched_at` yet), OR repo ids present in `trend_repo` from the previous successful run.

- [ ] **Step 1: Add shared Testcontainers helper**

`tests/helpers/pg.ts`:
```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../../server/db/schema';

export async function startPg() {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  await pool.query('CREATE SCHEMA gh_trend');
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: './db/migrations' });
  return { container, pool, db };
}
```

- [ ] **Step 2: Write failing test**

`tests/integration/candidates.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg } from '../helpers/pg';
import { selectCandidates } from '../../server/ingest/candidates';
import { repos, eventsDaily, trendRepo } from '../../server/db/schema';

let env: Awaited<ReturnType<typeof startPg>>;

beforeAll(async () => { env = await startPg(); }, 120_000);
afterAll(async () => { await env.pool.end(); await env.container.stop(); });

describe('selectCandidates', () => {
  it('returns union of hot/new/previously-tracked', async () => {
    await env.db.insert(repos).values([
      { id: 1, fullName: 'a/b', fetchedAt: new Date() },           // existing-meta
      { id: 2, fullName: 'c/d', fetchedAt: new Date() },           // existing-meta
      { id: 3, fullName: 'e/f', fetchedAt: null },                 // newly seen
      { id: 4, fullName: 'g/h', fetchedAt: new Date() },           // existing-meta but cold
    ]);
    await env.db.insert(eventsDaily).values([
      { day: '2026-06-22', repoId: 1, watchEvents: 15 },           // hot
      { day: '2026-06-22', repoId: 2, watchEvents: 5 },            // not hot
      { day: '2026-06-22', repoId: 3, watchEvents: 0 },            // new
    ]);
    await env.db.insert(trendRepo).values([
      { period: 'week', language: 'ALL', repoId: 4, starGain: 50 },
    ]);

    const ids = await selectCandidates(env.db, '2026-06-22');
    expect(ids.sort()).toEqual([1, 3, 4]);
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

```bash
npm test -- candidates
```

- [ ] **Step 4: Implement**

`server/ingest/candidates.ts`:
```typescript
import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';

export async function selectCandidates(db: DB, day: string): Promise<number[]> {
  const rows = await db.execute<{ repo_id: number }>(sql`
    SELECT repo_id FROM (
      SELECT repo_id FROM gh_trend.events_daily WHERE day = ${day} AND watch_events >= 10
      UNION
      SELECT id AS repo_id FROM gh_trend.repos WHERE fetched_at IS NULL
      UNION
      SELECT DISTINCT repo_id FROM gh_trend.trend_repo
    ) u
  `);
  return rows.rows.map((r) => Number(r.repo_id));
}
```

- [ ] **Step 5: Run, expect PASS**

```bash
npm test -- candidates
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ingest): hot-repo candidate selection"
```

---

## Task 8: Daily Stats Upsert

**Files:**
- Create: `server/ingest/daily-stats.ts`, `tests/integration/daily-stats.test.ts`

**Interfaces:**
- Consumes: `db`, `day`, `repoStats: { repoId: number; stars: number; forks: number; watchers: number }[]`
- Produces:
  - `upsertDailyStats(db: DB, day: string, repoStats: RepoStat[]): Promise<void>` — sets `stars_delta` from the prior day's row (NULL if absent), upserts on `(repo_id, day)`.
  - Type `RepoStat = { repoId: number; stars: number; forks: number; watchers: number }`

- [ ] **Step 1: Write failing test**

`tests/integration/daily-stats.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- daily-stats
```

- [ ] **Step 3: Implement**

`server/ingest/daily-stats.ts`:
```typescript
import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { addDays } from './time';

export type RepoStat = { repoId: number; stars: number; forks: number; watchers: number };

export async function upsertDailyStats(db: DB, day: string, stats: RepoStat[]): Promise<void> {
  if (stats.length === 0) return;
  const prevDay = addDays(day, -1);

  await db.transaction(async (tx) => {
    for (const s of stats) {
      await tx.execute(sql`
        WITH prev AS (
          SELECT stars FROM gh_trend.repo_daily_stats
          WHERE repo_id = ${s.repoId} AND day = ${prevDay}
        )
        INSERT INTO gh_trend.repo_daily_stats (repo_id, day, stars, forks, watchers, stars_delta)
        VALUES (
          ${s.repoId}, ${day}, ${s.stars}, ${s.forks}, ${s.watchers},
          (SELECT ${s.stars} - stars FROM prev)
        )
        ON CONFLICT (repo_id, day) DO UPDATE SET
          stars = EXCLUDED.stars,
          forks = EXCLUDED.forks,
          watchers = EXCLUDED.watchers,
          stars_delta = EXCLUDED.stars_delta
      `);
    }
  });
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- daily-stats
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingest): repo_daily_stats upsert with delta"
```

---

## Task 9: trend_repo Aggregation

**Files:**
- Create: `server/analyze/trend-repo.ts`, `tests/integration/trend-repo.test.ts`

**Interfaces:**
- Consumes: `db`, parameter `endDay: string` (most recent day inclusive)
- Produces:
  - `rebuildTrendRepoAll(tx: PgTransaction | DB, endDay: string): Promise<void>` — TRUNCATEs `trend_repo` and rebuilds for all (`day`/`week`/`month`) × (`ALL` + top-10 languages).
  - `TOP_LANGUAGE_COUNT = 10`

- [ ] **Step 1: Write failing test**

`tests/integration/trend-repo.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- trend-repo
```

- [ ] **Step 3: Implement**

`server/analyze/trend-repo.ts`:
```typescript
import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { addDays } from '../ingest/time';

export const TOP_LANGUAGE_COUNT = 10;
const PERIODS: Array<{ name: 'day' | 'week' | 'month'; days: number }> = [
  { name: 'day', days: 1 }, { name: 'week', days: 7 }, { name: 'month', days: 30 },
];

type Executor = Pick<DB, 'execute'>;

export async function rebuildTrendRepoAll(db: Executor, endDay: string): Promise<void> {
  await db.execute(sql`TRUNCATE gh_trend.trend_repo`);

  const topLangsRes = await db.execute<{ language: string }>(sql`
    SELECT r.language FROM gh_trend.repos r
    JOIN gh_trend.repo_daily_stats s ON s.repo_id = r.id
    WHERE s.day > ${addDays(endDay, -30)} AND s.day <= ${endDay}
      AND r.language IS NOT NULL AND s.stars_delta > 0
    GROUP BY r.language
    ORDER BY SUM(s.stars_delta) DESC NULLS LAST
    LIMIT ${TOP_LANGUAGE_COUNT}
  `);
  const topLangs = topLangsRes.rows.map((r) => r.language);

  for (const period of PERIODS) {
    const start = addDays(endDay, -(period.days - 1));
    await db.execute(sql`
      INSERT INTO gh_trend.trend_repo (period, language, repo_id, star_gain, rank_by_star_gain, rank_by_stars)
      WITH gained AS (
        SELECT repo_id, COALESCE(SUM(stars_delta), 0)::int AS star_gain
        FROM gh_trend.repo_daily_stats
        WHERE day BETWEEN ${start} AND ${endDay} AND stars_delta > 0
        GROUP BY repo_id
      ),
      joined AS (
        SELECT r.id, r.language, g.star_gain, r.stars
        FROM gained g JOIN gh_trend.repos r ON r.id = g.repo_id
        WHERE r.stars IS NOT NULL AND g.star_gain > 0
      )
      SELECT ${period.name}::text AS period,
             'ALL'::text AS language,
             id, star_gain,
             ROW_NUMBER() OVER (ORDER BY star_gain DESC, stars DESC) AS rank_by_star_gain,
             ROW_NUMBER() OVER (ORDER BY stars DESC) AS rank_by_stars
      FROM joined
      ORDER BY star_gain DESC
      LIMIT 100
    `);

    for (const lang of topLangs) {
      await db.execute(sql`
        INSERT INTO gh_trend.trend_repo (period, language, repo_id, star_gain, rank_by_star_gain, rank_by_stars)
        WITH gained AS (
          SELECT repo_id, COALESCE(SUM(stars_delta), 0)::int AS star_gain
          FROM gh_trend.repo_daily_stats
          WHERE day BETWEEN ${start} AND ${endDay} AND stars_delta > 0
          GROUP BY repo_id
        ),
        joined AS (
          SELECT r.id, r.language, g.star_gain, r.stars
          FROM gained g JOIN gh_trend.repos r ON r.id = g.repo_id
          WHERE r.language = ${lang} AND r.stars IS NOT NULL AND g.star_gain > 0
        )
        SELECT ${period.name}::text, ${lang}::text, id, star_gain,
               ROW_NUMBER() OVER (ORDER BY star_gain DESC, stars DESC),
               ROW_NUMBER() OVER (ORDER BY stars DESC)
        FROM joined
        ORDER BY star_gain DESC
        LIMIT 100
      `);
    }
  }
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- trend-repo
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analyze): trend_repo rebuild for day/week/month × languages"
```

---

## Task 10: trend_keyword Aggregation

**Files:**
- Create: `server/analyze/trend-keyword.ts`, `tests/integration/trend-keyword.test.ts`

**Interfaces:**
- Consumes: `db`, `endDay`
- Produces:
  - `rebuildTrendKeywordAll(db: Executor, endDay: string): Promise<void>`
  - "Prior period" mapping: `day` → previous single day (endDay − 1); `week` → 14..7 days before endDay (7-day window); `month` → 60..30 days before endDay (30-day window).
  - Filter: `mentions ≥ 3 AND delta_pct ≥ 10`

- [ ] **Step 1: Write failing test**

`tests/integration/trend-keyword.test.ts`:
```typescript
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
  it('emits keywords that meet mentions ≥ 3 and delta_pct ≥ 10%', async () => {
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
    ]);
    await env.db.insert(repoDailyStats).values([
      { repoId: 1, day: '2026-06-22', stars: 100, starsDelta: 50 },
      { repoId: 2, day: '2026-06-22', stars: 100, starsDelta: 40 },
      { repoId: 3, day: '2026-06-22', stars: 100, starsDelta: 30 },
      { repoId: 4, day: '2026-06-22', stars: 100, starsDelta: 20 },
      { repoId: 5, day: '2026-06-21', stars: 100, starsDelta: 30 },
      { repoId: 6, day: '2026-06-21', stars: 100, starsDelta: 30 },
      { repoId: 7, day: '2026-06-21', stars: 100, starsDelta: 30 },
    ]);

    await rebuildTrendRepoAll(env.db, '2026-06-22');
    await rebuildTrendRepoAll(env.db, '2026-06-21'); // prior-period source
    // For trend_keyword we expect day-period to compare yesterday vs day-before
    await rebuildTrendKeywordAll(env.db, '2026-06-22');

    const rows = await env.db.select().from(trendKeyword)
      .where(eq(trendKeyword.period, 'day'));
    const byKw = Object.fromEntries(rows.map((r) => [r.keyword, r]));
    expect(byKw['agent']).toBeTruthy();      // 3 mentions, +200%
    expect(byKw['rag']).toBeFalsy();         // 3 mentions, 0%, filtered out
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- trend-keyword
```

- [ ] **Step 3: Implement**

`server/analyze/trend-keyword.ts`:
```typescript
import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { addDays } from '../ingest/time';
import { STOPWORDS } from './stopwords';
import { normalizeTopics } from './normalize';

const PRIOR: Record<'day' | 'week' | 'month', (end: string) => { start: string; end: string }> = {
  day:   (e) => ({ start: addDays(e, -1), end: addDays(e, -1) }),
  week:  (e) => ({ start: addDays(e, -13), end: addDays(e, -7) }),
  month: (e) => ({ start: addDays(e, -59), end: addDays(e, -30) }),
};

const CANDIDATES_LIMIT = 200;
type Executor = Pick<DB, 'execute'>;

type RepoRow = { repo_id: number; topics: string[] | null; star_gain: number };

async function candidateRepos(db: Executor, period: 'day'|'week'|'month'): Promise<RepoRow[]> {
  const res = await db.execute<RepoRow>(sql`
    SELECT t.repo_id, r.topics, t.star_gain
    FROM gh_trend.trend_repo t
    JOIN gh_trend.repos r ON r.id = t.repo_id
    WHERE t.period = ${period} AND t.language = 'ALL'
    ORDER BY t.rank_by_star_gain
    LIMIT ${CANDIDATES_LIMIT}
  `);
  return res.rows;
}

async function priorCounts(db: Executor, period: 'day'|'week'|'month', endDay: string): Promise<Map<string, number>> {
  const range = PRIOR[period](endDay);
  const res = await db.execute<{ repo_id: number; topics: string[] | null; star_gain: number }>(sql`
    WITH gained AS (
      SELECT repo_id, SUM(stars_delta)::int AS star_gain
      FROM gh_trend.repo_daily_stats
      WHERE day BETWEEN ${range.start} AND ${range.end} AND stars_delta > 0
      GROUP BY repo_id
    )
    SELECT g.repo_id, r.topics, g.star_gain
    FROM gained g JOIN gh_trend.repos r ON r.id = g.repo_id
    WHERE g.star_gain > 0
    ORDER BY g.star_gain DESC
    LIMIT ${CANDIDATES_LIMIT}
  `);
  return countKeywords(res.rows);
}

function countKeywords(rows: RepoRow[]): Map<string, number> {
  const c = new Map<string, number>();
  for (const r of rows) {
    for (const t of normalizeTopics(r.topics)) c.set(t, (c.get(t) ?? 0) + 1);
  }
  return c;
}

function topSampleIds(rows: RepoRow[], keyword: string, n: number): number[] {
  return rows
    .filter((r) => normalizeTopics(r.topics).includes(keyword))
    .sort((a, b) => b.star_gain - a.star_gain)
    .slice(0, n)
    .map((r) => Number(r.repo_id));
}

export async function rebuildTrendKeywordAll(db: Executor, endDay: string): Promise<void> {
  await db.execute(sql`TRUNCATE gh_trend.trend_keyword`);

  for (const period of ['day', 'week', 'month'] as const) {
    const now = await candidateRepos(db, period);
    const nowCounts = countKeywords(now);
    const prevCounts = await priorCounts(db, period, endDay);

    for (const [kw, mentions] of nowCounts) {
      if (mentions < 3) continue;
      if (STOPWORDS.has(kw)) continue;
      const prev = prevCounts.get(kw) ?? 0;
      const deltaPct = ((mentions - prev) / Math.max(1, prev)) * 100;
      if (deltaPct < 10) continue;
      const sample = topSampleIds(now, kw, 5);
      await db.execute(sql`
        INSERT INTO gh_trend.trend_keyword (period, keyword, mentions, delta_pct, sample_repo_ids)
        VALUES (${period}, ${kw}, ${mentions}, ${deltaPct.toFixed(2)}, ${sample})
      `);
    }
  }
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- trend-keyword
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analyze): trend_keyword with prior-period delta filter"
```

---

## Task 11: trend_language Aggregation

**Files:**
- Create: `server/analyze/trend-language.ts`, `tests/integration/trend-language.test.ts`

**Interfaces:**
- Consumes: `db`, `endDay`
- Produces:
  - `rebuildTrendLanguageAll(db: Executor): Promise<void>` — reads `trend_repo` (period, 'ALL') top-100 and groups by `repos.language`.

- [ ] **Step 1: Write failing test**

`tests/integration/trend-language.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- trend-language
```

- [ ] **Step 3: Implement**

`server/analyze/trend-language.ts`:
```typescript
import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';

type Executor = Pick<DB, 'execute'>;

export async function rebuildTrendLanguageAll(db: Executor): Promise<void> {
  await db.execute(sql`TRUNCATE gh_trend.trend_language`);
  await db.execute(sql`
    INSERT INTO gh_trend.trend_language (period, language, hot_repo_count, total_stars_gained)
    SELECT t.period, COALESCE(r.language, 'Unknown') AS language,
           COUNT(*) AS hot_repo_count,
           SUM(t.star_gain)::bigint AS total_stars_gained
    FROM gh_trend.trend_repo t
    JOIN gh_trend.repos r ON r.id = t.repo_id
    WHERE t.language = 'ALL'
    GROUP BY t.period, COALESCE(r.language, 'Unknown')
  `);
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- trend-language
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analyze): trend_language rollup"
```

---

## Task 12: Daily Orchestration (runDailyIngest)

**Files:**
- Create: `server/analyze/aggregate.ts`, `server/cron/daily.ts`, `server/logger.ts`, `server/ingest/gharchive-day.ts`, `tests/integration/daily.test.ts`

**Interfaces:**
- Consumes: `db`, `day`, `deps: { fetchRepo, fetchHourStream }`
- Produces:
  - `runDailyIngest(opts: { day: string; db: DB; deps?: Partial<Deps> }): Promise<{ status: 'success' | 'failed' | 'skipped'; stats: object }>` — performs steps 1–8 of section 4 of the spec.
  - `runAllAggregations(db: Executor, endDay: string)` — wraps `rebuildTrendRepoAll`, `rebuildTrendKeywordAll`, `rebuildTrendLanguageAll` in one transaction.

- [ ] **Step 1: Implement `server/logger.ts`**

```typescript
import pino from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
```

- [ ] **Step 2: Implement `server/analyze/aggregate.ts`**

```typescript
import type { DB } from '../db/client';
import { rebuildTrendRepoAll } from './trend-repo';
import { rebuildTrendKeywordAll } from './trend-keyword';
import { rebuildTrendLanguageAll } from './trend-language';

export async function runAllAggregations(db: DB, endDay: string): Promise<void> {
  await db.transaction(async (tx) => {
    await rebuildTrendRepoAll(tx, endDay);
    await rebuildTrendKeywordAll(tx, endDay);
    await rebuildTrendLanguageAll(tx);
  });
}
```

- [ ] **Step 3: Implement `server/ingest/gharchive-day.ts`**

```typescript
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
      const { counts, repos } = await withRetry(async () =>
        parseHourStream(await fetchHour(day, h)));
      for (const [id, c] of counts) {
        const cur = allCounts.get(id);
        allCounts.set(id, cur ? sumCounts(cur, c) : c);
      }
      for (const [id, r] of repos) if (!allRepos.has(id)) allRepos.set(id, r);
      filesParsed++;
      logger.info({ stage: 'gharchive', day, hour: h, filesParsed }, 'hour parsed');
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  await db.transaction(async (tx) => {
    if (allRepos.size > 0) {
      await tx.execute(sql`
        INSERT INTO gh_trend.repos (id, full_name)
        VALUES ${sql.join([...allRepos.values()].map((r) => sql`(${r.id}, ${r.fullName})`), sql`, `)}
        ON CONFLICT (id) DO NOTHING
      `);
    }
    if (allCounts.size > 0) {
      const values = [...allCounts.entries()].map(([id, c]) => sql`(
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

function sumCounts(a: EventCounts, b: EventCounts): EventCounts {
  return {
    watchEvents: a.watchEvents + b.watchEvents,
    forkEvents:  a.forkEvents  + b.forkEvents,
    pushEvents:  a.pushEvents  + b.pushEvents,
    prEvents:    a.prEvents    + b.prEvents,
    issueEvents: a.issueEvents + b.issueEvents,
  };
}
```

- [ ] **Step 4: Write failing test for runDailyIngest (using fakes for both external systems)**

`tests/integration/daily.test.ts`:
```typescript
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
```

- [ ] **Step 5: Implement `server/cron/daily.ts`**

```typescript
import { sql, eq, and } from 'drizzle-orm';
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

    // 4. GitHub REST enrichment (concurrency 5, 200ms gate via RateLimiter)
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
          await tx.execute(sql`
            INSERT INTO gh_trend.repos (id, full_name, description, language, topics, homepage, license,
                                        stars, forks, open_issues, created_at, pushed_at, fetched_at)
            VALUES (${m.id}, ${m.fullName}, ${m.description}, ${m.language}, ${m.topics}, ${m.homepage}, ${m.license},
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
```

- [ ] **Step 6: Run, expect PASS**

```bash
npm test -- daily
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cron): runDailyIngest orchestrator"
```

---

## Task 13: CLI + node-cron Registration

**Files:**
- Create: `scripts/ingest.ts`, `server/cron/register.ts`

**Interfaces:**
- Consumes: `runDailyIngest`
- Produces:
  - CLI: `npm run ingest -- --day YYYY-MM-DD` (defaults to UTC yesterday)
  - `registerCron()`: schedules `runDailyIngest` for 04:00 KST. Called from Next.js startup (`instrumentation.ts`).

- [ ] **Step 1: Implement `scripts/ingest.ts`**

```typescript
import 'dotenv/config';
import { db, pool } from '../server/db/client';
import { runDailyIngest } from '../server/cron/daily';
import { utcDayBefore } from '../server/ingest/time';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const day = arg('day') ?? utcDayBefore(new Date());
  const result = await runDailyIngest({ day, db });
  await pool.end();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'failed') process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Implement `server/cron/register.ts`**

```typescript
import cron from 'node-cron';
import { db } from '../db/client';
import { logger } from '../logger';
import { runDailyIngest } from './daily';
import { utcDayBefore } from '../ingest/time';
import { notifyFailure } from '../notify/discord';   // created in Task 14

let registered = false;

export function registerCron(): void {
  if (registered) return;
  registered = true;
  cron.schedule('0 4 * * *', async () => {
    const day = utcDayBefore(new Date());
    logger.info({ day }, 'cron fired');
    try {
      const result = await runDailyIngest({ day, db });
      if (result.status === 'failed') await notifyFailure(day, 'see logs');
    } catch (e) {
      logger.error({ err: String(e) }, 'cron unhandled');
      await notifyFailure(day, e instanceof Error ? e.message : String(e));
    }
  }, { timezone: 'Asia/Seoul' });
  logger.info('cron registered: 0 4 * * * Asia/Seoul');
}
```

- [ ] **Step 3: Wire boot-time hook (`instrumentation.ts` in repo root)**

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerCron } = await import('./server/cron/register');
    registerCron();
  }
}
```

Add to `next.config.ts` (replace existing):
```typescript
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  experimental: { typedRoutes: true, instrumentationHook: true },
  output: 'standalone',
};
export default nextConfig;
```

- [ ] **Step 4: Smoke-check CLI builds**

```bash
npx tsc --noEmit
```

Expected: no type errors. (CLI runtime is exercised in Task 20.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(cron): CLI + boot-time registration"
```

---

## Task 14: Discord Failure Notifier

**Files:**
- Create: `server/notify/discord.ts`, `tests/unit/discord.test.ts`

**Interfaces:**
- Consumes: env `DISCORD_WEBHOOK_URL` (optional)
- Produces:
  - `notifyFailure(day: string, message: string, opts?: { fetch?: typeof fetch }): Promise<void>` — POSTs an embed. If env unset, logs only.

- [ ] **Step 1: Write failing test**

`tests/unit/discord.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { notifyFailure } from '../../server/notify/discord';

describe('notifyFailure', () => {
  it('skips when env unset', async () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    await expect(notifyFailure('2026-06-22', 'boom')).resolves.toBeUndefined();
  });

  it('posts an embed when env set', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://example.com/webhook';
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response('', { status: 204 }); }) as typeof fetch;
    await notifyFailure('2026-06-22', 'boom', { fetch: fake });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://example.com/webhook');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.embeds[0].title).toContain('2026-06-22');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- discord
```

- [ ] **Step 3: Implement**

`server/notify/discord.ts`:
```typescript
import { logger } from '../logger';

type FetchLike = typeof fetch;

export async function notifyFailure(
  day: string,
  message: string,
  opts: { fetch?: FetchLike } = {},
): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) { logger.error({ day, message }, 'ingest failed (no Discord webhook configured)'); return; }
  const f = opts.fetch ?? fetch;
  const body = {
    embeds: [{
      title: `GitHub Trend ingest failed: ${day}`,
      description: message.slice(0, 1900),
      color: 0xef4444,
    }],
  };
  await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- discord
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(notify): Discord webhook for ingest failure"
```

---

## Task 15: Page Query Layer

**Files:**
- Create: `server/db/queries.ts`, `tests/integration/queries.test.ts`

**Interfaces:**
- Consumes: `db`
- Produces:
  - Types:
    ```typescript
    export type Period = 'day' | 'week' | 'month';
    export type Sort = 'gain' | 'stars' | 'forks' | 'issues';
    export type HotRepo = {
      id: number; fullName: string; description: string | null;
      language: string | null; topics: string[]; stars: number;
      starGain: number; forks: number; openIssues: number;
    };
    export type KeywordCard = { keyword: string; mentions: number; deltaPct: number; sampleRepos: HotRepo[] };
    export type LanguageBreakdown = { language: string; hotRepoCount: number; totalStarsGained: number };
    export type LastIngestMeta = { day: string; finishedAt: Date | null; status: string };
    ```
  - Functions:
    - `queryHotRepos(db, period, lang, sort, limit?): Promise<HotRepo[]>` — default `limit = 25`. Order by chosen sort.
    - `queryTopKeywords(db, period, limit?): Promise<KeywordCard[]>` — default 12, sorted by `deltaPct` desc.
    - `queryLanguageBreakdown(db, period): Promise<LanguageBreakdown[]>`
    - `queryRepoTimeseries(db, repoId, days): Promise<{ day: string; stars: number }[]>`
    - `queryLastIngest(db): Promise<LastIngestMeta | null>`
    - `queryRepo(db, repoId): Promise<HotRepo | null>`

- [ ] **Step 1: Write failing tests**

`tests/integration/queries.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- queries
```

- [ ] **Step 3: Implement**

`server/db/queries.ts`:
```typescript
import { sql, and, eq, desc, asc } from 'drizzle-orm';
import type { DB } from './client';
import { repos, repoDailyStats, trendRepo, trendKeyword, trendLanguage, ingestRuns } from './schema';

export type Period = 'day' | 'week' | 'month';
export type Sort = 'gain' | 'stars' | 'forks' | 'issues';

export type HotRepo = {
  id: number; fullName: string; description: string | null;
  language: string | null; topics: string[]; stars: number;
  starGain: number; forks: number; openIssues: number;
};
export type KeywordCard = { keyword: string; mentions: number; deltaPct: number; sampleRepos: HotRepo[] };
export type LanguageBreakdown = { language: string; hotRepoCount: number; totalStarsGained: number };
export type LastIngestMeta = { day: string; finishedAt: Date | null; status: string };

function sortColumn(sort: Sort) {
  switch (sort) {
    case 'gain':   return sql`t.star_gain DESC`;
    case 'stars':  return sql`r.stars DESC NULLS LAST`;
    case 'forks':  return sql`r.forks DESC NULLS LAST`;
    case 'issues': return sql`r.open_issues DESC NULLS LAST`;
  }
}

export async function queryHotRepos(
  db: DB, period: Period, lang: string, sort: Sort, limit = 25,
): Promise<HotRepo[]> {
  const order = sortColumn(sort);
  const res = await db.execute<any>(sql`
    SELECT r.id, r.full_name, r.description, r.language, r.topics,
           COALESCE(r.stars, 0) AS stars, COALESCE(r.forks, 0) AS forks,
           COALESCE(r.open_issues, 0) AS open_issues, t.star_gain
    FROM gh_trend.trend_repo t
    JOIN gh_trend.repos r ON r.id = t.repo_id
    WHERE t.period = ${period} AND t.language = ${lang}
    ORDER BY ${order}
    LIMIT ${limit}
  `);
  return res.rows.map((r) => ({
    id: Number(r.id), fullName: r.full_name, description: r.description,
    language: r.language, topics: r.topics ?? [],
    stars: Number(r.stars), starGain: Number(r.star_gain),
    forks: Number(r.forks), openIssues: Number(r.open_issues),
  }));
}

export async function queryRepo(db: DB, repoId: number): Promise<HotRepo | null> {
  const res = await db.execute<any>(sql`
    SELECT r.id, r.full_name, r.description, r.language, r.topics,
           COALESCE(r.stars, 0) AS stars, COALESCE(r.forks, 0) AS forks,
           COALESCE(r.open_issues, 0) AS open_issues
    FROM gh_trend.repos r WHERE r.id = ${repoId}
  `);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id), fullName: r.full_name, description: r.description,
    language: r.language, topics: r.topics ?? [],
    stars: Number(r.stars), starGain: 0,
    forks: Number(r.forks), openIssues: Number(r.open_issues),
  };
}

export async function queryTopKeywords(db: DB, period: Period, limit = 12): Promise<KeywordCard[]> {
  const kw = await db.select().from(trendKeyword)
    .where(eq(trendKeyword.period, period))
    .orderBy(desc(trendKeyword.deltaPct))
    .limit(limit);
  const ids = new Set<number>();
  for (const k of kw) for (const i of k.sampleRepoIds ?? []) ids.add(Number(i));
  const repoRows = ids.size
    ? await db.execute<any>(sql`
        SELECT id, full_name, description, language, topics,
               COALESCE(stars, 0) AS stars, COALESCE(forks, 0) AS forks,
               COALESCE(open_issues, 0) AS open_issues
        FROM gh_trend.repos WHERE id = ANY(${[...ids]})
      `)
    : { rows: [] as any[] };
  const byId = new Map<number, HotRepo>(repoRows.rows.map((r) => [Number(r.id), {
    id: Number(r.id), fullName: r.full_name, description: r.description,
    language: r.language, topics: r.topics ?? [],
    stars: Number(r.stars), starGain: 0,
    forks: Number(r.forks), openIssues: Number(r.open_issues),
  }]));
  return kw.map((k) => ({
    keyword: k.keyword, mentions: k.mentions, deltaPct: Number(k.deltaPct),
    sampleRepos: (k.sampleRepoIds ?? []).map((i) => byId.get(Number(i))).filter((x): x is HotRepo => !!x),
  }));
}

export async function queryLanguageBreakdown(db: DB, period: Period): Promise<LanguageBreakdown[]> {
  const res = await db.select().from(trendLanguage)
    .where(eq(trendLanguage.period, period))
    .orderBy(desc(trendLanguage.hotRepoCount));
  return res.map((r) => ({ language: r.language, hotRepoCount: r.hotRepoCount, totalStarsGained: Number(r.totalStarsGained) }));
}

export async function queryRepoTimeseries(db: DB, repoId: number, days: number) {
  const res = await db.execute<{ day: string; stars: number }>(sql`
    SELECT day::text AS day, stars FROM gh_trend.repo_daily_stats
    WHERE repo_id = ${repoId}
    ORDER BY day ASC
    LIMIT ${days}
  `);
  return res.rows;
}

export async function queryLastIngest(db: DB): Promise<LastIngestMeta | null> {
  const rows = await db.select().from(ingestRuns)
    .where(eq(ingestRuns.status, 'success'))
    .orderBy(desc(ingestRuns.day))
    .limit(1);
  if (!rows[0]) return null;
  return { day: rows[0].day, finishedAt: rows[0].finishedAt, status: rows[0].status };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- queries
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): page-side query functions"
```

---

## Task 16: Layout + shadcn-style primitives

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`
- Create: `components/ui/card.tsx`, `components/ui/badge.tsx`, `components/ui/button.tsx`, `components/ui/tabs.tsx`, `lib/utils.ts`

We avoid the shadcn CLI (extra moving parts) and hand-write the same primitives. Tailwind-only.

**Interfaces:**
- Consumes: nothing
- Produces:
  - `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`
  - `<Badge variant?: 'default' | 'outline' | 'accent'>`
  - `<Button>` (anchor-based for SSR-friendly links)
  - `<Tabs value>` (server-side rendered, link-based)
  - `cn(...classes)` helper

- [ ] **Step 1: Create `lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 2: Create `components/ui/card.tsx`**

```tsx
import { cn } from '@/lib/utils';

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur', className)} {...p} />;
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 border-b border-zinc-800 flex items-center justify-between', className)} {...p} />;
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold text-zinc-200 tracking-tight', className)} {...p} />;
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...p} />;
}
```

- [ ] **Step 3: Create `components/ui/badge.tsx`**

```tsx
import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-zinc-800 text-zinc-200',
  outline: 'border border-zinc-700 text-zinc-300',
  accent: 'bg-accent text-accent-foreground',
} as const;

export function Badge({
  variant = 'default', className, ...p
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', variants[variant], className)} {...p} />;
}
```

- [ ] **Step 4: Create `components/ui/button.tsx` (anchor-based for SSR routing)**

```tsx
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LinkButton({
  href, active, className, children,
}: { href: string; active?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href as any} className={cn(
      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
      active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
      className,
    )}>{children}</Link>
  );
}
```

- [ ] **Step 5: Create `components/ui/tabs.tsx`**

```tsx
import { LinkButton } from './button';

export function Tabs({ items, current }: {
  items: { value: string; label: string; href: string }[]; current: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-zinc-900 p-1 border border-zinc-800">
      {items.map((it) => (
        <LinkButton key={it.value} href={it.href} active={it.value === current}>{it.label}</LinkButton>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Update `app/globals.css` (add subtle background gradient + scrollbar)**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html { color-scheme: dark; }
body {
  @apply bg-zinc-950 text-zinc-100 antialiased;
  background-image: radial-gradient(60rem 30rem at 80% -10%, rgba(16, 185, 129, 0.08), transparent),
                    radial-gradient(50rem 25rem at -10% 80%, rgba(99, 102, 241, 0.06), transparent);
  background-attachment: fixed;
}
::selection { background-color: rgba(16, 185, 129, 0.35); }
```

- [ ] **Step 7: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): minimal shadcn-style primitives (Card/Badge/Button/Tabs)"
```

---

## Task 17: Main Dashboard Page

**Files:**
- Modify: `app/page.tsx`
- Create: `components/period-tabs.tsx`, `components/language-breakdown.tsx`, `components/keyword-cloud.tsx`, `components/hot-repo-list.tsx`, `components/repo-sparkline.tsx`, `components/stale-banner.tsx`

**Interfaces:**
- Consumes: queries from Task 15
- Produces: SSR'd dashboard at `/?period=…&lang=…&sort=…`

- [ ] **Step 1: Create `components/period-tabs.tsx`**

```tsx
import { Tabs } from './ui/tabs';

export function PeriodTabs({ current, basePath }: { current: 'day' | 'week' | 'month'; basePath: string }) {
  const make = (p: string) => `${basePath}?period=${p}`;
  return (
    <Tabs current={current} items={[
      { value: 'day', label: 'Today', href: make('day') },
      { value: 'week', label: 'This Week', href: make('week') },
      { value: 'month', label: 'This Month', href: make('month') },
    ]} />
  );
}
```

- [ ] **Step 2: Create `components/language-breakdown.tsx`**

```tsx
'use client';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#22d3ee', '#f472b6', '#84cc16', '#f97316'];

export function LanguageBreakdown({ data }: {
  data: { language: string; hotRepoCount: number; totalStarsGained: number }[];
}) {
  if (data.length === 0) return <p className="text-zinc-500 text-sm">데이터 없음</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="hotRepoCount" nameKey="language" innerRadius={60} outerRadius={90} strokeWidth={0}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/keyword-cloud.tsx`**

```tsx
import Link from 'next/link';
import { Badge } from './ui/badge';
import type { KeywordCard } from '@/server/db/queries';

export function KeywordCloud({ items }: { items: KeywordCard[] }) {
  if (items.length === 0) return <p className="text-zinc-500 text-sm">뜨는 키워드가 아직 없습니다</p>;
  return (
    <ul className="space-y-2">
      {items.map((k) => (
        <li key={k.keyword} className="flex items-center justify-between gap-2">
          <Link href={`/keyword/${encodeURIComponent(k.keyword)}`} className="text-zinc-100 hover:text-accent">
            #{k.keyword}
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">{k.mentions} repos</Badge>
            <Badge variant="accent">+{Math.round(k.deltaPct)}%</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Create `components/repo-sparkline.tsx`**

```tsx
'use client';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

export function RepoSparkline({ data }: { data: { day: string; stars: number }[] }) {
  if (!data || data.length < 2) return null;
  return (
    <div className="h-8 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line type="monotone" dataKey="stars" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 5: Create `components/hot-repo-list.tsx`**

```tsx
import Link from 'next/link';
import { Badge } from './ui/badge';
import { LinkButton } from './ui/button';
import type { HotRepo, Period, Sort } from '@/server/db/queries';
import { RepoSparkline } from './repo-sparkline';

export function HotRepoList({
  repos, period, lang, sort, sparklines,
}: {
  repos: HotRepo[]; period: Period; lang: string; sort: Sort;
  sparklines: Map<number, { day: string; stars: number }[]>;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
        <span className="text-zinc-400">정렬:</span>
        {(['gain', 'stars', 'forks', 'issues'] as Sort[]).map((s) => (
          <LinkButton key={s} active={s === sort}
            href={`/?period=${period}&lang=${encodeURIComponent(lang)}&sort=${s}`}>
            {s === 'gain' ? '증가율' : s === 'stars' ? '스타' : s === 'forks' ? '포크' : '이슈'}
          </LinkButton>
        ))}
      </div>
      <ol className="space-y-3">
        {repos.map((r, idx) => (
          <li key={r.id} className="flex gap-4 items-start p-3 rounded-md border border-zinc-800 bg-zinc-900/40">
            <span className="text-zinc-500 font-mono text-sm w-6 text-right pt-0.5">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/repo/${r.id}`} className="font-semibold text-zinc-100 hover:text-accent truncate">{r.fullName}</Link>
                {r.language && <Badge variant="outline">{r.language}</Badge>}
                {r.topics.slice(0, 4).map((t) => (
                  <Link key={t} href={`/keyword/${encodeURIComponent(t)}`}>
                    <Badge>{t}</Badge>
                  </Link>
                ))}
              </div>
              {r.description && <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{r.description}</p>}
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-2">
                <span>★ {r.stars.toLocaleString()}</span>
                <span className="text-accent">+{r.starGain.toLocaleString()}</span>
                <span>fork {r.forks.toLocaleString()}</span>
                <span>issue {r.openIssues.toLocaleString()}</span>
              </div>
            </div>
            <RepoSparkline data={sparklines.get(r.id) ?? []} />
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 6: Create `components/stale-banner.tsx`**

```tsx
import type { LastIngestMeta } from '@/server/db/queries';
import { kstFormat } from '@/server/ingest/time';

export function StaleBanner({ meta }: { meta: LastIngestMeta | null }) {
  if (!meta?.finishedAt) {
    return <div className="px-4 py-2 text-sm bg-amber-950/60 border-b border-amber-900 text-amber-200">⚠ 아직 첫 데이터 수집이 완료되지 않았습니다.</div>;
  }
  const stale = Date.now() - meta.finishedAt.getTime() > 36 * 60 * 60 * 1000;
  if (!stale) return null;
  return (
    <div className="px-4 py-2 text-sm bg-amber-950/60 border-b border-amber-900 text-amber-200">
      ⚠ 데이터가 1일 이상 갱신되지 않았습니다. 마지막 성공: {kstFormat(meta.finishedAt)}
    </div>
  );
}
```

- [ ] **Step 7: Replace `app/page.tsx`**

```tsx
import { db } from '@/server/db/client';
import {
  queryHotRepos, queryTopKeywords, queryLanguageBreakdown, queryLastIngest, queryRepoTimeseries,
  type Period, type Sort,
} from '@/server/db/queries';
import { kstFormat } from '@/server/ingest/time';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PeriodTabs } from '@/components/period-tabs';
import { LanguageBreakdown } from '@/components/language-breakdown';
import { KeywordCloud } from '@/components/keyword-cloud';
import { HotRepoList } from '@/components/hot-repo-list';
import { StaleBanner } from '@/components/stale-banner';

export const revalidate = 600;

const ALLOWED_PERIODS: Period[] = ['day', 'week', 'month'];
const ALLOWED_SORTS: Sort[] = ['gain', 'stars', 'forks', 'issues'];

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const period = (ALLOWED_PERIODS.includes(sp.period as Period) ? sp.period : 'week') as Period;
  const lang = sp.lang ?? 'ALL';
  const sort = (ALLOWED_SORTS.includes(sp.sort as Sort) ? sp.sort : 'gain') as Sort;

  const [meta, langs, keywords, repos] = await Promise.all([
    queryLastIngest(db),
    queryLanguageBreakdown(db, period),
    queryTopKeywords(db, period, 12),
    queryHotRepos(db, period, lang, sort, 25),
  ]);

  const sparklines = new Map<number, { day: string; stars: number }[]>();
  await Promise.all(repos.map(async (r) => {
    sparklines.set(r.id, await queryRepoTimeseries(db, r.id, 30));
  }));

  return (
    <>
      <StaleBanner meta={meta} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold tracking-tight">GitHub Trend</h1>
          <PeriodTabs current={period} basePath="/" />
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>언어 점유</CardTitle></CardHeader>
            <CardContent><LanguageBreakdown data={langs.slice(0, 10)} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>뜨는 키워드</CardTitle></CardHeader>
            <CardContent><KeywordCloud items={keywords} /></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>핫 레포 ({period})</CardTitle></CardHeader>
          <CardContent>
            <HotRepoList repos={repos} period={period} lang={lang} sort={sort} sparklines={sparklines} />
          </CardContent>
        </Card>

        <footer className="pt-6 text-center text-xs text-zinc-500">
          마지막 업데이트: {meta?.finishedAt ? kstFormat(meta.finishedAt) : '아직 없음'}
        </footer>
      </main>
    </>
  );
}
```

- [ ] **Step 8: Type check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: clean build.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(app): main dashboard page with charts, keywords, hot repos"
```

---

## Task 18: Subpages (trending / keyword / repo)

**Files:**
- Create: `app/trending/page.tsx`, `app/keyword/[name]/page.tsx`, `app/repo/[id]/page.tsx`
- Create: `components/repo-detail-chart.tsx`

**Interfaces:**
- Consumes: queries from Task 15

- [ ] **Step 1: Create `app/trending/page.tsx`**

```tsx
import { db } from '@/server/db/client';
import { queryHotRepos, queryRepoTimeseries, type Period, type Sort } from '@/server/db/queries';
import { PeriodTabs } from '@/components/period-tabs';
import { HotRepoList } from '@/components/hot-repo-list';

export const revalidate = 600;

const ALLOWED_PERIODS: Period[] = ['day', 'week', 'month'];
const ALLOWED_SORTS: Sort[] = ['gain', 'stars', 'forks', 'issues'];

export default async function Trending({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const period = (ALLOWED_PERIODS.includes(sp.period as Period) ? sp.period : 'week') as Period;
  const lang = sp.lang ?? 'ALL';
  const sort = (ALLOWED_SORTS.includes(sp.sort as Sort) ? sp.sort : 'gain') as Sort;
  const repos = await queryHotRepos(db, period, lang, sort, 100);
  const sparklines = new Map<number, { day: string; stars: number }[]>();
  await Promise.all(repos.map(async (r) => sparklines.set(r.id, await queryRepoTimeseries(db, r.id, 30))));
  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Trending Top 100</h1>
        <PeriodTabs current={period} basePath="/trending" />
      </header>
      <HotRepoList repos={repos} period={period} lang={lang} sort={sort} sparklines={sparklines} />
    </main>
  );
}
```

- [ ] **Step 2: Create `app/keyword/[name]/page.tsx`**

```tsx
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { queryRepoTimeseries, type HotRepo } from '@/server/db/queries';
import { HotRepoList } from '@/components/hot-repo-list';

export const revalidate = 600;

async function reposForKeyword(keyword: string): Promise<HotRepo[]> {
  const res = await db.execute<any>(sql`
    SELECT r.id, r.full_name, r.description, r.language, r.topics,
           COALESCE(r.stars, 0) AS stars, COALESCE(r.forks, 0) AS forks,
           COALESCE(r.open_issues, 0) AS open_issues, t.star_gain
    FROM gh_trend.trend_repo t
    JOIN gh_trend.repos r ON r.id = t.repo_id
    WHERE t.period = 'week' AND t.language = 'ALL'
      AND ${keyword} = ANY(r.topics)
    ORDER BY t.star_gain DESC
    LIMIT 50
  `);
  return res.rows.map((r) => ({
    id: Number(r.id), fullName: r.full_name, description: r.description,
    language: r.language, topics: r.topics ?? [],
    stars: Number(r.stars), starGain: Number(r.star_gain),
    forks: Number(r.forks), openIssues: Number(r.open_issues),
  }));
}

export default async function KeywordPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const keyword = decodeURIComponent(name).toLowerCase();
  const repos = await reposForKeyword(keyword);
  const sparklines = new Map<number, { day: string; stars: number }[]>();
  await Promise.all(repos.map(async (r) => sparklines.set(r.id, await queryRepoTimeseries(db, r.id, 30))));
  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">#{keyword}</h1>
      <p className="text-zinc-400 text-sm">최근 1주 핫 레포 중 이 토픽을 가진 레포</p>
      <HotRepoList repos={repos} period="week" lang="ALL" sort="gain" sparklines={sparklines} />
    </main>
  );
}
```

- [ ] **Step 3: Create `components/repo-detail-chart.tsx`**

```tsx
'use client';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function RepoDetailChart({ data }: { data: { day: string; stars: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#27272a" />
          <XAxis dataKey="day" stroke="#71717a" fontSize={11} />
          <YAxis stroke="#71717a" fontSize={11} />
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6 }} />
          <Line type="monotone" dataKey="stars" stroke="#10b981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Create `app/repo/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { queryRepo, queryRepoTimeseries } from '@/server/db/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RepoDetailChart } from '@/components/repo-detail-chart';

export const revalidate = 600;

export default async function RepoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repoId = Number(id);
  if (!Number.isFinite(repoId)) notFound();
  const r = await queryRepo(db, repoId);
  if (!r) notFound();
  const series = await queryRepoTimeseries(db, repoId, 30);
  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{r.fullName}</h1>
        {r.description && <p className="text-zinc-400 mt-2">{r.description}</p>}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {r.language && <Badge variant="outline">{r.language}</Badge>}
          {r.topics.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-400 mt-3">
          <span>★ {r.stars.toLocaleString()}</span>
          <span>fork {r.forks.toLocaleString()}</span>
          <span>issue {r.openIssues.toLocaleString()}</span>
          <a className="text-accent hover:underline" href={`https://github.com/${r.fullName}`} target="_blank" rel="noreferrer">github.com →</a>
        </div>
      </header>
      <Card>
        <CardHeader><CardTitle>30일 스타 추이</CardTitle></CardHeader>
        <CardContent><RepoDetailChart data={series} /></CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Build + type check**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(app): trending, keyword, repo detail pages"
```

---

## Task 19: API Routes + Error Page

**Files:**
- Create: `app/api/trending/route.ts`, `app/api/keywords/route.ts`, `app/api/languages/route.ts`, `app/api/repo/[id]/timeseries/route.ts`, `app/error.tsx`, `app/not-found.tsx`

**Interfaces:**
- Consumes: queries from Task 15
- Produces: JSON endpoints with cache headers `s-maxage=600`

- [ ] **Step 1: Create `app/api/trending/route.ts`**

```typescript
import { db } from '@/server/db/client';
import { queryHotRepos, type Period, type Sort } from '@/server/db/queries';

const PERIODS = new Set(['day', 'week', 'month']);
const SORTS = new Set(['gain', 'stars', 'forks', 'issues']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = (PERIODS.has(url.searchParams.get('period') ?? '') ? url.searchParams.get('period') : 'week') as Period;
  const lang = url.searchParams.get('lang') ?? 'ALL';
  const sort = (SORTS.has(url.searchParams.get('sort') ?? '') ? url.searchParams.get('sort') : 'gain') as Sort;
  const limit = Math.min(100, Number(url.searchParams.get('limit')) || 25);
  const repos = await queryHotRepos(db, period, lang, sort, limit);
  return Response.json({ period, lang, sort, repos }, { headers: { 'cache-control': 's-maxage=600' } });
}
```

- [ ] **Step 2: Create `app/api/keywords/route.ts`**

```typescript
import { db } from '@/server/db/client';
import { queryTopKeywords, type Period } from '@/server/db/queries';

const PERIODS = new Set(['day', 'week', 'month']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = (PERIODS.has(url.searchParams.get('period') ?? '') ? url.searchParams.get('period') : 'week') as Period;
  const items = await queryTopKeywords(db, period, 24);
  return Response.json({ period, items }, { headers: { 'cache-control': 's-maxage=600' } });
}
```

- [ ] **Step 3: Create `app/api/languages/route.ts`**

```typescript
import { db } from '@/server/db/client';
import { queryLanguageBreakdown, type Period } from '@/server/db/queries';

const PERIODS = new Set(['day', 'week', 'month']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = (PERIODS.has(url.searchParams.get('period') ?? '') ? url.searchParams.get('period') : 'week') as Period;
  const items = await queryLanguageBreakdown(db, period);
  return Response.json({ period, items }, { headers: { 'cache-control': 's-maxage=600' } });
}
```

- [ ] **Step 4: Create `app/api/repo/[id]/timeseries/route.ts`**

```typescript
import { db } from '@/server/db/client';
import { queryRepoTimeseries } from '@/server/db/queries';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const repoId = Number(id);
  if (!Number.isFinite(repoId)) return new Response('bad id', { status: 400 });
  const series = await queryRepoTimeseries(db, repoId, 30);
  return Response.json({ repoId, series }, { headers: { 'cache-control': 's-maxage=600' } });
}
```

- [ ] **Step 5: Create `app/error.tsx`**

```tsx
'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold">데이터를 불러올 수 없습니다</h1>
      <p className="text-zinc-400">잠시 후 다시 시도해 주세요.</p>
      <button onClick={reset} className="px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-900 text-sm">다시 시도</button>
    </main>
  );
}
```

- [ ] **Step 6: Create `app/not-found.tsx`**

```tsx
import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-zinc-400">찾을 수 없는 페이지입니다.</p>
      <Link className="text-accent hover:underline" href="/">메인으로 →</Link>
    </main>
  );
}
```

- [ ] **Step 7: Build**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): JSON endpoints + error/not-found pages"
```

---

## Task 20: Dockerfile, Compose, README, Smoke Run

**Files:**
- Create: `docker/Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: env file `.env`
- Produces: deployable container exposed on `caddy_net` as `github-trend-app:3000`

- [ ] **Step 1: Create `docker/Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV TZ=Asia/Seoul
WORKDIR /app
RUN apk add --no-cache tzdata
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server ./server
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/package.json ./package.json
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 2: Create `docker/entrypoint.sh`**

```bash
#!/bin/sh
set -e
echo "[entrypoint] running migrations"
node --experimental-strip-types scripts/migrate.ts
echo "[entrypoint] starting next server"
exec node server.js
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  app:
    container_name: github-trend-app
    build:
      context: .
      dockerfile: docker/Dockerfile
    env_file: .env
    networks: [shared_pg, caddy_net]
    restart: unless-stopped
networks:
  shared_pg: { external: true }
  caddy_net: { external: true }
```

- [ ] **Step 4: Replace `README.md`**

````markdown
# GitHub Trend

매일 새벽 GHArchive와 GitHub REST API에서 어제분 활동을 수집·집계해 보여주는 공개 트렌드 대시보드.

- 사이트: https://github-trend.myazit.kr
- 디자인: [`docs/superpowers/specs/2026-06-23-github-trend-design.md`](docs/superpowers/specs/2026-06-23-github-trend-design.md)
- 구현 플랜: [`docs/superpowers/plans/2026-06-23-github-trend.md`](docs/superpowers/plans/2026-06-23-github-trend.md)

## 로컬 개발

```bash
cp .env.example .env   # DATABASE_URL, GITHUB_TOKEN 채우기
npm install
npm run migrate
npm run dev            # http://localhost:3000
```

수동 ingest (예: 어제):
```bash
npm run ingest -- --day 2026-06-22
```

## 테스트

Docker가 켜져 있어야 합니다 (Testcontainers).

```bash
npm test
```

## 운영 (Mac mini)

전제: 공용 Postgres가 `shared_pg` docker network에, Caddy가 `caddy_net` docker network에 이미 떠 있음. Cloudflare Tunnel이 `*.myazit.kr → Caddy`로 라우팅 중.

1. 공용 Postgres에서 한 번:
   ```sql
   CREATE SCHEMA IF NOT EXISTS gh_trend;
   ```

2. `.env`를 같은 폴더에 두고:
   ```bash
   docker compose up -d --build
   ```

3. Caddy에 블록 추가 후 reload:
   ```caddy
   github-trend.myazit.kr {
       reverse_proxy github-trend-app:3000
   }
   ```

4. 첫 데이터 수집 (수동 1회):
   ```bash
   docker compose exec app node --experimental-strip-types scripts/ingest.ts --day 2026-06-22
   ```

5. 이후 매일 04:00 KST 자동 실행. 상태 확인:
   ```sql
   SELECT day, status, started_at, finished_at FROM gh_trend.ingest_runs ORDER BY id DESC LIMIT 5;
   ```

## 환경변수

| 키 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:pw@host:5432/db` (공용 Postgres) |
| `GITHUB_TOKEN` | yes | `public_repo` 권한 PAT |
| `DISCORD_WEBHOOK_URL` | no | 배치 실패 알림. 없으면 콘솔만 |
| `LOG_LEVEL` | no | `info`(기본) / `debug` / `warn` 등 |
| `TZ` | yes | `Asia/Seoul` — node-cron이 KST로 해석하도록 |
````

- [ ] **Step 5: Final build verification**

```bash
docker build -f docker/Dockerfile -t github-trend:test .
```

Expected: image builds without error.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(docker): Dockerfile, compose, ops README"
```

---

## Self-Review

**1. Spec coverage**
- ✅ §2 Architecture → Task 1, 13, 20
- ✅ §3 Data model → Task 2
- ✅ §4 Ingest pipeline → Tasks 3, 5, 6, 7, 8, 12, 13
- ✅ §5 Analysis → Tasks 4, 9, 10, 11
- ✅ §6 Web pages & API → Tasks 16, 17, 18, 19
- ✅ §7 Ops/observability/tests → Tasks 12, 14, 19 (error pages), 20 (README ops guide), and Vitest tests throughout
- ✅ §8 Directory structure → matches; Drizzle migrations under `db/migrations`
- ✅ §9 Deployment → Task 20 (Dockerfile + compose + Caddy block)
- ✅ §10 External dependencies → `.env.example` (Task 1), README table (Task 20)
- ✅ Global: UTC storage / KST display → Task 3 + Task 17; idempotency via `ingest_runs` → Task 12; retention 35/30 days → Task 12; revalidate 600 → Tasks 17, 18, 19.

**2. Placeholder scan**
- All code blocks contain runnable code. No `TBD`, no "implement later", no "similar to Task N".

**3. Type consistency**
- `RepoMeta` defined in Task 6, used in Task 12.
- `HotRepo`, `Period`, `Sort` defined in Task 15, consumed by Tasks 16, 17, 18, 19.
- `EventCounts`, `RepoTouch` defined in Task 5, consumed by Task 12.
- `Deps` for `runDailyIngest` introduced in Task 12 with `fetchHourStream`/`fetchRepo`; the test in Task 12 uses both keys — consistent.
- `rebuildTrendRepoAll`, `rebuildTrendKeywordAll`, `rebuildTrendLanguageAll` (Tasks 9-11) are called by `runAllAggregations` (Task 12) — names match.
- `LinkButton` defined in Task 16, used by Tabs (Task 16) and HotRepoList (Task 17).

Plan ready for execution.

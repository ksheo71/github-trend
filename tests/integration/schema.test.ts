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
  await pool.query('CREATE SCHEMA IF NOT EXISTS gh_trend');
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

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

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

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

export const pool = new Pool({ connectionString: url, max: 10 });
export const db = drizzle(pool, { schema });
export type DB = typeof db;

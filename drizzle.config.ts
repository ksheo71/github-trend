import type { Config } from 'drizzle-kit';

export default {
  schema: './server/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  schemaFilter: ['gh_trend'],
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;

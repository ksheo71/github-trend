import { db, pool } from '../server/db/client';
import { runDailyIngest } from '../server/cron/daily';
import { utcDayBefore } from '../server/ingest/time';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const day = arg('day') ?? utcDayBefore(new Date());
  const result = await runDailyIngest({ day, db, force: flag('force') });
  await pool.end();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'failed') process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

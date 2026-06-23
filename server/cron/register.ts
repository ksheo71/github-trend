import cron from 'node-cron';
import { db } from '../db/client';
import { logger } from '../logger';
import { runDailyIngest } from './daily';
import { utcDayBefore } from '../ingest/time';
import { notifyFailure } from '../notify/discord';

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

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

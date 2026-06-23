import { db } from '@/server/db/client';
import { queryTopKeywords, type Period } from '@/server/db/queries';

const PERIODS = new Set(['day', 'week', 'month']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = (PERIODS.has(url.searchParams.get('period') ?? '') ? url.searchParams.get('period') : 'week') as Period;
  const items = await queryTopKeywords(db, period, 24);
  return Response.json({ period, items }, { headers: { 'cache-control': 's-maxage=600' } });
}

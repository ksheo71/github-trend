import { db } from '@/server/db/client';
import { queryLanguageBreakdown, type Period } from '@/server/db/queries';

const PERIODS = new Set(['day', 'week', 'month']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = (PERIODS.has(url.searchParams.get('period') ?? '') ? url.searchParams.get('period') : 'week') as Period;
  const items = await queryLanguageBreakdown(db, period);
  return Response.json({ period, items }, { headers: { 'cache-control': 's-maxage=600' } });
}

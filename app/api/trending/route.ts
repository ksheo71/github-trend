import { db } from '@/server/db/client';
import { queryHotRepos, type Period, type Sort } from '@/server/db/queries';

const PERIODS = new Set(['day', 'week', 'month']);
const SORTS = new Set(['gain', 'stars', 'forks', 'issues']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = (PERIODS.has(url.searchParams.get('period') ?? '') ? url.searchParams.get('period') : 'week') as Period;
  const lang = url.searchParams.get('lang') ?? 'ALL';
  const sort = (SORTS.has(url.searchParams.get('sort') ?? '') ? url.searchParams.get('sort') : 'gain') as Sort;
  const limit = Math.min(100, Number(url.searchParams.get('limit')) || 25);
  const repos = await queryHotRepos(db, period, lang, sort, limit);
  return Response.json({ period, lang, sort, repos }, { headers: { 'cache-control': 's-maxage=600' } });
}

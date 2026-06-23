import { db } from '@/server/db/client';
import { queryRepoTimeseries } from '@/server/db/queries';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const repoId = Number(id);
  if (!Number.isFinite(repoId)) return new Response('bad id', { status: 400 });
  const series = await queryRepoTimeseries(db, repoId, 30);
  return Response.json({ repoId, series }, { headers: { 'cache-control': 's-maxage=600' } });
}

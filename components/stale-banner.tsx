import type { LastIngestMeta } from '@/server/db/queries';
import { kstFormat } from '@/server/ingest/time';

export function StaleBanner({ meta }: { meta: LastIngestMeta | null }) {
  if (!meta?.finishedAt) {
    return <div className="px-4 py-2 text-sm bg-amber-950/60 border-b border-amber-900 text-amber-200">⚠ 아직 첫 데이터 수집이 완료되지 않았습니다.</div>;
  }
  const stale = Date.now() - meta.finishedAt.getTime() > 36 * 60 * 60 * 1000;
  if (!stale) return null;
  return (
    <div className="px-4 py-2 text-sm bg-amber-950/60 border-b border-amber-900 text-amber-200">
      ⚠ 데이터가 1일 이상 갱신되지 않았습니다. 마지막 성공: {kstFormat(meta.finishedAt)}
    </div>
  );
}

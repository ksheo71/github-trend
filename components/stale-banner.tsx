import type { LastIngestMeta } from '@/server/db/queries';
import { kstFormat } from '@/server/ingest/time';

export function StaleBanner({ meta }: { meta: LastIngestMeta | null }) {
  if (!meta?.finishedAt) {
    return (
      <div className="px-6 py-2 text-xs bg-zinc-900/60 border-b border-zinc-800/60 text-zinc-400 flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
        아직 첫 데이터 수집이 완료되지 않았습니다.
      </div>
    );
  }
  const stale = Date.now() - meta.finishedAt.getTime() > 36 * 60 * 60 * 1000;
  if (!stale) return null;
  return (
    <div className="px-6 py-2 text-xs bg-zinc-900/60 border-b border-zinc-800/60 text-zinc-400 flex items-center gap-2">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
      데이터가 1일 이상 갱신되지 않았습니다 · 마지막 성공 {kstFormat(meta.finishedAt)}
    </div>
  );
}

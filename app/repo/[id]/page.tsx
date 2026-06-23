import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { queryRepo, queryRepoTimeseries } from '@/server/db/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RepoDetailChart } from '@/components/repo-detail-chart';

export const revalidate = 600;

export default async function RepoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repoId = Number(id);
  if (!Number.isFinite(repoId)) notFound();
  const r = await queryRepo(db, repoId);
  if (!r) notFound();
  const series = await queryRepoTimeseries(db, repoId, 30);
  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-widest uppercase text-zinc-500">repository</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 break-all">{r.fullName}</h1>
          {r.description && <p className="text-sm text-zinc-400 max-w-2xl">{r.description}</p>}
        </div>
        <div className="text-xs text-zinc-500">
          {r.language && <span className="text-zinc-300">{r.language}</span>}
          {r.language && r.topics.length > 0 && <span className="text-zinc-700"> · </span>}
          {r.topics.map((t, i) => (
            <span key={t}>
              {i > 0 && <span className="text-zinc-700"> · </span>}
              <Link
                href={`/keyword/${encodeURIComponent(t)}` as any}
                className="hover:text-zinc-300 transition-colors"
              >
                {t}
              </Link>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-5 text-xs font-mono tabular-nums">
          <span className="text-zinc-300">★ {r.stars.toLocaleString()}</span>
          <span className="text-zinc-500">fork {r.forks.toLocaleString()}</span>
          <span className="text-zinc-500">issue {r.openIssues.toLocaleString()}</span>
          <a
            className="ml-auto text-accent hover:underline"
            href={`https://github.com/${r.fullName}`}
            target="_blank"
            rel="noreferrer"
          >
            github.com ↗
          </a>
        </div>
      </header>
      <Card>
        <CardHeader><CardTitle>30일 스타 추이</CardTitle></CardHeader>
        <CardContent><RepoDetailChart data={series} /></CardContent>
      </Card>
    </main>
  );
}

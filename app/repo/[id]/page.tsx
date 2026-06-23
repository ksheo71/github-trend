import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { queryRepo, queryRepoTimeseries } from '@/server/db/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{r.fullName}</h1>
        {r.description && <p className="text-zinc-400 mt-2">{r.description}</p>}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {r.language && <Badge variant="outline">{r.language}</Badge>}
          {r.topics.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-400 mt-3">
          <span>★ {r.stars.toLocaleString()}</span>
          <span>fork {r.forks.toLocaleString()}</span>
          <span>issue {r.openIssues.toLocaleString()}</span>
          <a className="text-accent hover:underline" href={`https://github.com/${r.fullName}`} target="_blank" rel="noreferrer">github.com →</a>
        </div>
      </header>
      <Card>
        <CardHeader><CardTitle>30일 스타 추이</CardTitle></CardHeader>
        <CardContent><RepoDetailChart data={series} /></CardContent>
      </Card>
    </main>
  );
}

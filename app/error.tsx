'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold">데이터를 불러올 수 없습니다</h1>
      <p className="text-zinc-400">잠시 후 다시 시도해 주세요.</p>
      <button onClick={reset} className="px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-900 text-sm">다시 시도</button>
    </main>
  );
}

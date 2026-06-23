import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-zinc-400">찾을 수 없는 페이지입니다.</p>
      <Link className="text-accent hover:underline" href="/">메인으로 →</Link>
    </main>
  );
}

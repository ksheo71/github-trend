import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LinkButton({
  href,
  active,
  className,
  children,
}: {
  href: string;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as any}
      className={cn(
        'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
        active
          ? 'bg-zinc-100 text-zinc-900'
          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
        className,
      )}
    >
      {children}
    </Link>
  );
}

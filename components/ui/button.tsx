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
        'px-2.5 py-1 rounded-[5px] text-xs font-medium transition-colors duration-150',
        active
          ? 'bg-zinc-100 text-zinc-900 shadow-sm'
          : 'text-zinc-400 hover:text-zinc-100',
        className,
      )}
    >
      {children}
    </Link>
  );
}

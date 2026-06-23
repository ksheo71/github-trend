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
          ? 'bg-zinc-900 text-zinc-50 shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
        className,
      )}
    >
      {children}
    </Link>
  );
}

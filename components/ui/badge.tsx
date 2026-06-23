import { cn } from '@/lib/utils';

const variants = {
  default: 'text-zinc-500',
  outline: 'border border-zinc-800 text-zinc-400',
  accent: 'text-accent',
} as const;

export function Badge({
  variant = 'default',
  className,
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
        variants[variant],
        className,
      )}
      {...p}
    />
  );
}

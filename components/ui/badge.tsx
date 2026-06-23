import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-zinc-800 text-zinc-200',
  outline: 'border border-zinc-700 text-zinc-300',
  accent: 'bg-accent text-accent-foreground',
} as const;

export function Badge({
  variant = 'default',
  className,
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...p}
    />
  );
}

import { cn } from '@/lib/utils';

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur', className)} {...p} />;
}

export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 border-b border-zinc-800 flex items-center justify-between', className)} {...p} />;
}

export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold text-zinc-200 tracking-tight', className)} {...p} />;
}

export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...p} />;
}

import { LinkButton } from './button';

export function Tabs({
  items,
  current,
}: {
  items: { value: string; label: string; href: string }[];
  current: string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md p-0.5 border border-zinc-200 bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800">
      {items.map((it) => (
        <LinkButton key={it.value} href={it.href} active={it.value === current}>
          {it.label}
        </LinkButton>
      ))}
    </div>
  );
}

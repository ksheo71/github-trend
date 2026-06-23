import { LinkButton } from './button';

export function Tabs({
  items,
  current,
}: {
  items: { value: string; label: string; href: string }[];
  current: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-zinc-900 p-1 border border-zinc-800">
      {items.map((it) => (
        <LinkButton key={it.value} href={it.href} active={it.value === current}>
          {it.label}
        </LinkButton>
      ))}
    </div>
  );
}

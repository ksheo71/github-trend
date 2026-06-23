import { Tabs } from './ui/tabs';

export function PeriodTabs({ current, basePath }: { current: 'day' | 'week' | 'month'; basePath: string }) {
  const make = (p: string) => `${basePath}?period=${p}`;
  return (
    <Tabs current={current} items={[
      { value: 'day', label: 'Today', href: make('day') },
      { value: 'week', label: 'This Week', href: make('week') },
      { value: 'month', label: 'This Month', href: make('month') },
    ]} />
  );
}

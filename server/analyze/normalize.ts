import { STOPWORDS } from './stopwords';

export function normalizeTopics(topics: readonly string[] | null | undefined): string[] {
  if (!topics) return [];
  const seen = new Set<string>();
  for (const raw of topics) {
    const t = raw.trim().toLowerCase();
    if (!t || STOPWORDS.has(t)) continue;
    seen.add(t);
  }
  return [...seen];
}

import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

export type EventCounts = {
  watchEvents: number;
  forkEvents: number;
  pushEvents: number;
  prEvents: number;
  issueEvents: number;
};

export type RepoTouch = { id: number; fullName: string };

const EMPTY: EventCounts = {
  watchEvents: 0, forkEvents: 0, pushEvents: 0, prEvents: 0, issueEvents: 0,
};

function add(c: EventCounts, key: keyof EventCounts): EventCounts {
  return { ...c, [key]: c[key] + 1 };
}

export async function parseHourStream(input: NodeJS.ReadableStream): Promise<{
  counts: Map<number, EventCounts>;
  repos: Map<number, RepoTouch>;
}> {
  const counts = new Map<number, EventCounts>();
  const repos = new Map<number, RepoTouch>();
  const stream = input.pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let e: { type?: string; repo?: { id?: number; name?: string } };
    try { e = JSON.parse(line); } catch { continue; }
    const id = e.repo?.id;
    const fullName = e.repo?.name;
    if (typeof id !== 'number' || typeof fullName !== 'string') continue;
    let key: keyof EventCounts | null = null;
    switch (e.type) {
      case 'WatchEvent':       key = 'watchEvents'; break;
      case 'ForkEvent':        key = 'forkEvents'; break;
      case 'PushEvent':        key = 'pushEvents'; break;
      case 'PullRequestEvent': key = 'prEvents'; break;
      case 'IssuesEvent':      key = 'issueEvents'; break;
      default: continue;
    }
    counts.set(id, add(counts.get(id) ?? EMPTY, key));
    if (!repos.has(id)) repos.set(id, { id, fullName });
  }
  return { counts, repos };
}

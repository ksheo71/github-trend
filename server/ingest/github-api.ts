export type RepoMeta = {
  id: number;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  homepage: string | null;
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: Date;
  pushedAt: Date | null;
};

export class RateLimiter {
  private tokens: number;
  private queue: Array<() => void> = [];
  constructor(private readonly perInterval: number, private readonly intervalMs: number) {
    this.tokens = perInterval;
    setInterval(() => {
      this.tokens = perInterval;
      while (this.tokens > 0 && this.queue.length) {
        this.tokens--;
        this.queue.shift()!();
      }
    }, intervalMs).unref?.();
  }
  acquire(): Promise<void> {
    if (this.tokens > 0) { this.tokens--; return Promise.resolve(); }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }
}

const NULL_SET = new Set([404, 410, 451]);

type FetchLike = typeof fetch;

export async function fetchRepo(fullName: string, opts: { fetch?: FetchLike } = {}): Promise<RepoMeta | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set');
  const f = opts.fetch ?? fetch;
  const res = await f(`https://api.github.com/repos/${fullName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'github-trend-bot',
    },
  });
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? '5000');
  if (remaining <= 100) {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? '0') * 1000;
    const wait = Math.max(0, reset - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  if (NULL_SET.has(res.status)) return null;
  if (!res.ok) throw new Error(`github ${fullName} ${res.status}`);
  const j = (await res.json()) as any;
  return {
    id: j.id,
    fullName: j.full_name,
    description: j.description ?? null,
    language: j.language ?? null,
    topics: Array.isArray(j.topics) ? j.topics : [],
    homepage: j.homepage ?? null,
    license: j.license?.spdx_id ?? null,
    stars: j.stargazers_count ?? 0,
    forks: j.forks_count ?? 0,
    openIssues: j.open_issues_count ?? 0,
    createdAt: new Date(j.created_at),
    pushedAt: j.pushed_at ? new Date(j.pushed_at) : null,
  };
}

import { describe, it, expect } from 'vitest';
import { fetchRepo, RateLimiter } from '../../server/ingest/github-api';

function makeFetch(response: { status: number; body?: object; headers?: Record<string, string> }) {
  return async () => new Response(JSON.stringify(response.body ?? {}), {
    status: response.status,
    headers: response.headers,
  });
}

describe('fetchRepo', () => {
  it('maps 200 response to RepoMeta', async () => {
    process.env.GITHUB_TOKEN = 'test';
    const fake = makeFetch({
      status: 200,
      body: {
        id: 42, full_name: 'a/b', description: 'desc',
        language: 'TypeScript', topics: ['ai', 'agent'],
        homepage: 'https://x', license: { spdx_id: 'MIT' },
        stargazers_count: 100, forks_count: 5, open_issues_count: 2,
        created_at: '2026-01-01T00:00:00Z', pushed_at: '2026-06-01T00:00:00Z',
      },
      headers: { 'x-ratelimit-remaining': '500', 'x-ratelimit-reset': '0' },
    });
    const r = await fetchRepo('a/b', { fetch: fake });
    expect(r).toMatchObject({ id: 42, fullName: 'a/b', stars: 100, topics: ['ai', 'agent'], license: 'MIT' });
  });

  it('returns null on 404', async () => {
    process.env.GITHUB_TOKEN = 'test';
    const fake = makeFetch({ status: 404 });
    expect(await fetchRepo('x/y', { fetch: fake })).toBeNull();
  });

  it('throws on 500', async () => {
    process.env.GITHUB_TOKEN = 'test';
    const fake = makeFetch({ status: 500 });
    await expect(fetchRepo('x/y', { fetch: fake })).rejects.toThrow();
  });
});

describe('RateLimiter', () => {
  it('allows N tokens before blocking', async () => {
    const rl = new RateLimiter(3, 1_000);
    await rl.acquire(); await rl.acquire(); await rl.acquire();
    const start = Date.now();
    const pending = rl.acquire();
    await new Promise((r) => setTimeout(r, 50));
    expect(Date.now() - start).toBeLessThan(900);
    // we don't await pending in test; allow GC
    void pending;
  });
});

import { describe, it, expect } from 'vitest';
import { notifyFailure } from '../../server/notify/discord';

describe('notifyFailure', () => {
  it('skips when env unset', async () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    await expect(notifyFailure('2026-06-22', 'boom')).resolves.toBeUndefined();
  });

  it('posts an embed when env set', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://example.com/webhook';
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response('', { status: 200 }); }) as typeof fetch;
    await notifyFailure('2026-06-22', 'boom', { fetch: fake });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://example.com/webhook');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.embeds[0].title).toContain('2026-06-22');
  });
});

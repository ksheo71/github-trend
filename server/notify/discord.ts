import { logger } from '../logger';

type FetchLike = typeof fetch;

export async function notifyFailure(
  day: string,
  message: string,
  opts: { fetch?: FetchLike } = {},
): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) { logger.error({ day, message }, 'ingest failed (no Discord webhook configured)'); return; }
  const f = opts.fetch ?? fetch;
  const body = {
    embeds: [{
      title: `GitHub Trend ingest failed: ${day}`,
      description: message.slice(0, 1900),
      color: 0xef4444,
    }],
  };
  await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

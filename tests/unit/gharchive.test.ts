import { describe, it, expect } from 'vitest';
import { createReadStream } from 'node:fs';
import { parseHourStream } from '../../server/ingest/gharchive';

describe('parseHourStream', () => {
  it('aggregates relevant event counts and ignores unrelated types', async () => {
    const s = createReadStream('tests/fixtures/gharchive-sample.json.gz');
    const { counts, repos } = await parseHourStream(s);

    expect(counts.size).toBe(2);
    expect(counts.get(1)).toEqual({
      watchEvents: 2, forkEvents: 0, pushEvents: 1, prEvents: 0, issueEvents: 0,
    });
    expect(counts.get(2)).toEqual({
      watchEvents: 0, forkEvents: 1, pushEvents: 0, prEvents: 1, issueEvents: 1,
    });
    expect(repos.get(1)).toEqual({ id: 1, fullName: 'a/b' });
    expect(repos.get(2)).toEqual({ id: 2, fullName: 'c/d' });
    expect(counts.has(3)).toBe(false);
  });
});

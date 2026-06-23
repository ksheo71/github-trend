import { describe, it, expect } from 'vitest';
import { normalizeTopics } from '../../server/analyze/normalize';

describe('normalizeTopics', () => {
  it('lowercases and trims', () => {
    expect(normalizeTopics(['  ML ', 'Agentic'])).toEqual(['ml', 'agentic']);
  });
  it('removes stopwords (generic + language names)', () => {
    expect(normalizeTopics(['awesome', 'python', 'agent'])).toEqual(['agent']);
  });
  it('dedupes', () => {
    expect(normalizeTopics(['ai', 'AI', 'ai'])).toEqual(['ai']);
  });
  it('handles nullish', () => {
    expect(normalizeTopics(null)).toEqual([]);
    expect(normalizeTopics(undefined)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { utcDayBefore, kstFormat, addDays, dayRange } from '../../server/ingest/time';

describe('time utilities', () => {
  it('utcDayBefore returns yesterday in UTC', () => {
    expect(utcDayBefore(new Date('2026-06-23T19:00:00Z'))).toBe('2026-06-22');
    expect(utcDayBefore(new Date('2026-06-23T00:00:01Z'))).toBe('2026-06-22');
  });

  it('kstFormat renders KST wall clock', () => {
    expect(kstFormat(new Date('2026-06-22T19:42:00Z'))).toBe('2026-06-23 04:42 KST');
  });

  it('addDays advances/regresses ISO date', () => {
    expect(addDays('2026-06-22', 1)).toBe('2026-06-23');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('dayRange returns inclusive list ending at end', () => {
    expect(dayRange('2026-06-22', 3)).toEqual(['2026-06-20', '2026-06-21', '2026-06-22']);
  });
});

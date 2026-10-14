import { describe, it, expect } from 'vitest';
import { isUuidString, parseSafeDate, getDayStartTimestamp, getDayEndTimestamp } from '../utils/applicationHelpers';

describe('application helpers', () => {
  it('recognises uuid strings', () => {
    expect(isUuidString('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuidString('naukri')).toBe(false);
    expect(isUuidString(null)).toBe(false);
  });

  it('parses dates safely', () => {
    expect(parseSafeDate('not a date')).toBeNull();
    expect(parseSafeDate(null)).toBeNull();
    expect(parseSafeDate('2026-10-14T10:00:00Z')).toBeInstanceOf(Date);
  });

  it('day start is before day end for the same date', () => {
    const start = getDayStartTimestamp('2026-10-14');
    const end = getDayEndTimestamp('2026-10-14');
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    expect((end as number) > (start as number)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateCompleteness, defaultProfile, isProfileTabComplete, monthsFromHistory } from '../pages/profile/profileLogic';
import type { CandidateProfile } from '../types';

const skill = (n: string) => ({ skill_name: n }) as any;

describe('profile completeness', () => {
  it('lists what is missing on an empty profile', () => {
    const { score, missing } = calculateCompleteness(defaultProfile, 0);
    expect(score).toBe(0);
    expect(missing).toHaveLength(6);
  });

  it('scores a complete profile at 100 with nothing missing', () => {
    const p: CandidateProfile = {
      ...defaultProfile,
      headline: 'Engineer',
      phone: '1',
      location: 'Pune',
      expected_ctc: 10,
      skills: [skill('a'), skill('b'), skill('c')],
    };
    expect(calculateCompleteness(p, 1)).toEqual({ score: 100, missing: [] });
  });

  it('needs three skills and a resume to count', () => {
    const p = { ...defaultProfile, skills: [skill('a'), skill('b')] };
    expect(isProfileTabComplete('skills', p, 0, 0)).toBe(false);
    expect(isProfileTabComplete('resumes', p, 0, 0)).toBe(false);
    expect(isProfileTabComplete('resumes', p, 1, 0)).toBe(true);
    expect(isProfileTabComplete('answers', p, 0, 3)).toBe(true);
    expect(isProfileTabComplete('answers', p, 0, 2)).toBe(false);
  });
});

describe('monthsFromHistory', () => {
  const now = new Date('2026-01-15');
  it('adds separate jobs', () => {
    expect(monthsFromHistory([{ start_date: '2020-01-01', end_date: '2021-01-01' }, { start_date: '2022-01-01', end_date: '2023-01-01' }], now)).toBe(24);
  });
  it('counts overlapping jobs once', () => {
    expect(monthsFromHistory([{ start_date: '2020-01-01', end_date: '2022-01-01' }, { start_date: '2021-01-01', end_date: '2023-01-01' }], now)).toBe(36);
  });
  it('runs a current job to now', () => {
    expect(monthsFromHistory([{ start_date: '2025-01-01', is_current: true }], now)).toBe(12);
  });
  it('ignores entries with no usable start date and handles empty input', () => {
    expect(monthsFromHistory([{ start_date: 'garbage' }, {}], now)).toBe(0);
    expect(monthsFromHistory(undefined, now)).toBe(0);
  });
});

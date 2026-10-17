import { describe, it, expect } from 'vitest';
import {
  getDerivedStatus, formatExperience, formatSalary, computeStats, filterAndSortApplications,
} from '../pages/applications/applicationLogic';

const base = { selectedFilter: 'All', searchQuery: '', companyFilter: '', minMatchFilter: 0, fromDate: '', toDate: '', sortColumn: 'date' as const, sortDirection: 'desc' as const };
const app = (o: any) => ({ id: 'a', job_id: 'j', workflow_state: 'QUEUED', created_at: '2026-10-01T00:00:00Z', ...o });

describe('getDerivedStatus', () => {
  it('maps workflow state and failure reasons', () => {
    expect(getDerivedStatus(app({ workflow_state: 'APPLIED' }) as any).label).toBe('Applied');
    expect(getDerivedStatus(app({ failure_reason: 'Already applied' }) as any).label).toBe('Already applied');
    expect(getDerivedStatus(app({ failure_reason: 'redirect to company site' }) as any).label).toBe('Company site');
    expect(getDerivedStatus(app({ workflow_state: 'SUBMISSION_UNKNOWN' }) as any).label).toBe('Needs Verification');
    expect(getDerivedStatus(app({ workflow_state: 'FAILED' }) as any).label).toBe('Failed');
    expect(getDerivedStatus(app({ workflow_state: 'SKIPPED' }) as any).label).toBe('Skipped');
    expect(getDerivedStatus(app({}) as any).label).toBe('Pending');
  });
});

describe('formatters', () => {
  it('formats experience and salary', () => {
    expect(formatExperience({ min_experience_years: 2, max_experience_years: 5 } as any)).toBe('2-5 Yrs');
    expect(formatExperience({} as any)).toBe('-');
    expect(formatSalary({ min_salary: 600000, max_salary: 1200000 } as any)).toBe('6L - 12L');
    expect(formatSalary({} as any)).toBe('-');
  });
});

describe('computeStats', () => {
  it('prefers backend stats and counts review/attention locally otherwise', () => {
    const apps = [app({ id: '1', workflow_state: 'APPLIED' }), app({ id: '2', workflow_state: 'FAILED' }), app({ id: '3', workflow_state: 'APPROVAL_REQUIRED' })] as any;
    const local = computeStats(apps, new Map(), null);
    expect(local.total).toBe(3);
    expect(local.appliedCount).toBe(1);
    expect(local.reviewQueueCount).toBe(1);
    expect(local.needsAttentionCount).toBe(1);
    expect(computeStats(apps, new Map(), { total: 99, applied: 7 } as any).total).toBe(99);
  });
});

describe('filterAndSortApplications', () => {
  const apps = [
    app({ id: '1', job_id: 'j1', company: 'Acme', job_title: 'Data Engineer', match_score: 90, workflow_state: 'APPLIED', created_at: '2026-10-01T00:00:00Z' }),
    app({ id: '2', job_id: 'j2', company: 'Globex', job_title: 'Analyst', match_score: 50, workflow_state: 'FAILED', created_at: '2026-10-03T00:00:00Z' }),
  ] as any;
  it('filters by chip, search, and min match', () => {
    expect(filterAndSortApplications(apps, new Map(), { ...base, selectedFilter: 'Failed' }).map((a) => a.id)).toEqual(['2']);
    expect(filterAndSortApplications(apps, new Map(), { ...base, searchQuery: 'acme' }).map((a) => a.id)).toEqual(['1']);
    expect(filterAndSortApplications(apps, new Map(), { ...base, minMatchFilter: 60 }).map((a) => a.id)).toEqual(['1']);
  });
  it('sorts by date and match', () => {
    expect(filterAndSortApplications(apps, new Map(), base).map((a) => a.id)).toEqual(['2', '1']);
    expect(filterAndSortApplications(apps, new Map(), { ...base, sortColumn: 'match' }).map((a) => a.id)).toEqual(['1', '2']);
  });
  it('does not mutate the input', () => {
    const copy = [...apps];
    filterAndSortApplications(apps, new Map(), base);
    expect(apps).toEqual(copy);
  });
});

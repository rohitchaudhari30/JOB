import { describe, it, expect } from 'vitest';
import type { Application } from '../types';
import { getDerivedStatus, needsAttention, computeStats, filterAndSortApplications } from '../pages/applications/applicationLogic';

const base = (over: Partial<Application>): Application =>
  ({
    id: 'a', user_id: 'u', job_id: 'j', idempotency_key: 'k', workflow_state: 'DISCOVERED',
    created_at: '2026-10-01T10:00:00Z', questions: [], ...over,
  }) as Application;

describe('server-owned application status', () => {
  it('uses display_status from the API even when local rules would disagree', () => {
    const app = base({ workflow_state: 'FAILED', display_status: 'Already applied' });
    expect(getDerivedStatus(app).label).toBe('Already applied');
  });

  it('falls back to the local rule only when the server field is absent or unknown', () => {
    expect(getDerivedStatus(base({ workflow_state: 'FAILED' })).label).toBe('Failed');
    expect(getDerivedStatus(base({ workflow_state: 'FAILED', display_status: 'garbage' })).label).toBe('Failed');
  });

  it('uses needs_attention from the API, including for paused states the old count missed', () => {
    expect(needsAttention(base({ workflow_state: 'APPLIED', needs_attention: true }))).toBe(true);
    expect(needsAttention(base({ workflow_state: 'FAILED', needs_attention: false }))).toBe(false);
    expect(needsAttention(base({ workflow_state: 'PAUSED_AUTH_EXPIRED' }))).toBe(true);
  });

  it('chip count and filtered list agree', () => {
    const apps = [
      base({ id: '1', workflow_state: 'PAUSED_SESSION', needs_attention: true }),
      base({ id: '2', workflow_state: 'APPLIED', needs_attention: false }),
      base({ id: '3', workflow_state: 'SUBMISSION_UNKNOWN', needs_attention: true }),
    ];
    const stats = computeStats(apps, new Map(), null);
    const list = filterAndSortApplications(apps, new Map(), {
      selectedFilter: 'Needs Attention', searchQuery: '', companyFilter: '', minMatchFilter: 0,
      fromDate: '', toDate: '', sortColumn: 'date', sortDirection: 'desc',
    });
    expect(list.map((a) => a.id).sort()).toEqual(['1', '3']);
    expect(stats.needsAttentionCount).toBe(list.length);
  });
});

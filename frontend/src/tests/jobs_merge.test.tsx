import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render, screen, act, fireEvent } from '@testing-library/react';

const batch = vi.fn();
const evalOne = vi.fn();
vi.mock('../services/api', () => ({
  api: {
    batchQueueApplications: (...a: any[]) => batch(...a),
    evaluateMatch: (...a: any[]) => evalOne(...a),
    evaluateAllMatches: vi.fn(),
    listConnections: vi.fn().mockResolvedValue([]),
    listResumes: vi.fn().mockResolvedValue([]),
  },
}));
const toast = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));

import { useJobActions } from '../hooks/useJobActions';
import { useRecordRoute } from '../hooks/useRecordRoute';
import { getMatchScore, getRecommendationScore } from '../utils/matchScores';
import { JobDetailDrawer, matchToDetailModel } from '../pages/jobs/JobDetailDrawer';

beforeEach(() => {
  batch.mockReset();
  evalOne.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
  window.history.replaceState({}, '', '/jobs');
});

describe('score util keeps the two scores distinct', () => {
  it('prefers match_score, falls back to the deprecated alias, never to recommendation', () => {
    expect(getMatchScore({ match_score: 70, overall_score: 10 } as any)).toBe(70);
    expect(getMatchScore({ overall_score: 55 } as any)).toBe(55);
    expect(getMatchScore({} as any)).toBe(0);
    expect(getRecommendationScore({ recommendation_score: 0 } as any)).toBe(0);
    expect(getRecommendationScore({} as any)).toBeNull();
  });
});

describe('useJobActions', () => {
  it('queues through the batch endpoint without auto-executing', async () => {
    batch.mockResolvedValue({ queued_count: 1, skipped_count: 0 });
    const { result } = renderHook(() => useJobActions({ readinessMissing: [] }));
    await act(async () => {
      await result.current.queueJobs(['j1'], 'AI_MATCHES');
    });
    expect(batch).toHaveBeenCalledWith({ job_ids: ['j1'], source: 'AI_MATCHES', auto_execute: false });
  });

  it('blocks and routes to connections when readiness is missing', async () => {
    const nav = vi.fn();
    const { result } = renderHook(() => useJobActions({ onNavigate: nav, readinessMissing: ['connection'] }));
    let r: any;
    await act(async () => {
      r = await result.current.queueJobs(['j1'], 'JOB_DISCOVERY');
    });
    expect(r).toBeNull();
    expect(batch).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('connections');
  });

  it('refuses an empty selection', async () => {
    const { result } = renderHook(() => useJobActions({ readinessMissing: [] }));
    await act(async () => {
      await result.current.queueJobs([], 'JOB_DISCOVERY');
    });
    expect(batch).not.toHaveBeenCalled();
    expect(toast.showWarning).toHaveBeenCalled();
  });

  it('returns null and toasts when evaluation fails', async () => {
    evalOne.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useJobActions({ readinessMissing: [] }));
    let r: any = 'x';
    await act(async () => {
      r = await result.current.evaluateJob('j1');
    });
    expect(r).toBeNull();
    expect(toast.showError).toHaveBeenCalled();
    expect(result.current.evaluatingIds.size).toBe(0);
  });
});

describe('useRecordRoute', () => {
  it('reads, opens and closes a record, ignoring reserved segments', () => {
    window.history.replaceState({}, '', '/jobs/matches');
    const { result } = renderHook(() => useRecordRoute('/jobs', 'discovery', ['matches']));
    expect(result.current.id).toBeNull();
    act(() => result.current.open('abc'));
    expect(window.location.pathname).toBe('/jobs/abc');
    expect(result.current.id).toBe('abc');
    act(() => result.current.close());
    expect(result.current.id).toBeNull();
  });

  it('picks up a deep link and follows Back', () => {
    window.history.replaceState({}, '', '/jobs/xyz');
    const { result } = renderHook(() => useRecordRoute('/jobs', 'discovery', ['matches']));
    expect(result.current.id).toBe('xyz');
    act(() => {
      window.history.pushState({}, '', '/jobs');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.id).toBeNull();
  });
});

describe('JobDetailDrawer', () => {
  const match: any = {
    job_id: 'j1', job_title: 'Data Engineer', company: 'Acme', match_score: 82,
    decision: 'AUTO_APPLY', matched_skills: ['sql'], missing_skills: ['spark'],
  };

  it('renders nothing without a model', () => {
    const { container } = render(
      <JobDetailDrawer model={null} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
    );
    expect(container.textContent).toBe('');
  });

  it('shows the match score, hides recommendation when absent, and wires actions', () => {
    const onQueue = vi.fn();
    const onEvaluate = vi.fn();
    render(
      <JobDetailDrawer model={matchToDetailModel(match)} onClose={() => {}} onEvaluate={onEvaluate} onQueue={onQueue} evaluating={false} queueing={false} />
    );
    expect(screen.getAllByText(/Data Engineer/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/82/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Recommendation priority/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /queue/i }));
    expect(onQueue).toHaveBeenCalledWith('j1');
    fireEvent.click(screen.getByRole('button', { name: /re-evaluate/i }));
    expect(onEvaluate).toHaveBeenCalledWith('j1');
  });
});

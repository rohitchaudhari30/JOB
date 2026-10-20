import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';

const api = {
  listMatchesPage: vi.fn(),
  listConnections: vi.fn(),
  listResumes: vi.fn(),
  batchQueueApplications: vi.fn(),
  evaluateAllMatches: vi.fn(),
  evaluateMatch: vi.fn(),
};
vi.mock('../services/api', () => ({ api: new Proxy({}, { get: (_t, k: string) => (api as any)[k] }) }));

import { AIMatches } from '../pages/AIMatches';

const m = (id: string, decision: string, score: number): any => ({
  id: `m-${id}`, user_id: 'u', job_id: id, match_score: score, overall_score: score, decision,
  job_title: `Role ${id}`, company: `Co ${id}`, location: 'Pune', matched_skills: [], missing_skills: [],
});

const items = [m('a', 'AUTO_APPLY', 92), m('b', 'REQUIRE_APPROVAL', 78), m('c', 'REQUIRE_APPROVAL', 70), m('d', 'REJECT', 30)];

const renderMatches = (props: object = {}) =>
  render(<ToastProvider><AIMatches onNavigate={vi.fn()} {...props} /></ToastProvider>);

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listMatchesPage.mockResolvedValue({ items, total: items.length });
  api.listConnections.mockResolvedValue([{ platform: 'linkedin', status: 'CONNECTED' }]);
  api.listResumes.mockResolvedValue([{ id: 'r1', is_default: true }]);
});

describe('Matched lens selection', () => {
  it('selecting matches shows the bar and Queue sends exactly the selected job ids', async () => {
    api.batchQueueApplications.mockResolvedValue({ queued_count: 2, skipped_count: 0, results: [] });
    renderMatches();
    await screen.findByText('Role a');
    expect(screen.queryByRole('region', { name: 'Selected jobs' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Role a/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Role c/ }));
    const bar = screen.getByRole('region', { name: 'Selected jobs' });
    expect(bar.textContent).toContain('2 jobs selected');
    fireEvent.click(screen.getByRole('button', { name: 'Queue 2 for apply' }));
    await waitFor(() => expect(api.batchQueueApplications).toHaveBeenCalledTimes(1));
    const payload = api.batchQueueApplications.mock.calls[0][0];
    expect([...payload.job_ids].sort()).toEqual(['a', 'c']);
    expect(payload.auto_execute).toBe(false);
    expect(payload.source).toBe('AI_MATCHES');
  });

  it('Clear selection empties the selection', async () => {
    renderMatches();
    await screen.findByText('Role a');
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Role b/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('region', { name: 'Selected jobs' })).toBeNull();
  });

  it('the Needs review lens shows only matches that need a decision', async () => {
    renderMatches({ lens: 'review' });
    await screen.findByText('Role b');
    expect(screen.getByText('Role c')).toBeTruthy();
    expect(screen.queryByText('Role a')).toBeNull();
    expect(screen.queryByText('Role d')).toBeNull();
  });

  it('choosing the review fit in the filter asks the workspace to switch lens', async () => {
    const onLensChange = vi.fn();
    renderMatches({ lens: 'matched', onLensChange });
    await screen.findByText('Role a');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by fit' }), { target: { value: 'REQUIRE_APPROVAL' } });
    expect(onLensChange).toHaveBeenCalledWith('review');
  });
});

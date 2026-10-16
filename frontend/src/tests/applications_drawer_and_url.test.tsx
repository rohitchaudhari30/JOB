import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useQueryParam } from '../hooks/useQueryParam';
import { needsCanonicalRedirect, resolvePathname } from '../utils/navigation';
import { ApplicationDrawer } from '../pages/applications/ApplicationDrawer';

const app: any = {
  id: 'a1',
  user_id: 'u',
  job_id: 'j1',
  idempotency_key: 'k',
  workflow_state: 'RECONCILIATION_REQUIRED',
  outcome_status: 'NOT_SUBMITTED',
  created_at: '2026-10-01T10:00:00Z',
  screenshot_file_path: 'shots/a1.png',
  failure_reason: 'Portal timed out after submit',
  retry_count: 2,
  questions: [],
};
const view = {
  title: 'Staff Engineer',
  company: 'Acme',
  platform: 'LinkedIn',
  statusLabel: 'Needs Verification',
  matchScore: 91.4,
  applyUrl: 'https://example.com/job',
  needsVerification: true,
};

describe('useQueryParam', () => {
  beforeEach(() => window.history.replaceState({}, '', '/applications'));

  it('reads the initial value from the URL and writes changes back', () => {
    window.history.replaceState({}, '', '/applications?status=Failed&q=acme');
    const { result } = renderHook(() => useQueryParam('status', 'All'));
    expect(result.current[0]).toBe('Failed');

    act(() => result.current[1]('Applied'));
    expect(window.location.search).toContain('status=Applied');
    expect(window.location.search).toContain('q=acme'); // other params preserved
  });

  it('removes the param when the value returns to the default', () => {
    const { result } = renderHook(() => useQueryParam('status', 'All'));
    act(() => result.current[1]('Failed'));
    expect(window.location.search).toBe('?status=Failed');
    act(() => result.current[1]('All'));
    expect(window.location.search).toBe('');
  });
});

describe('record deep links', () => {
  it('keeps nested record paths and still redirects legacy aliases', () => {
    expect(needsCanonicalRedirect('/applications/abc', '/applications')).toBe(false);
    expect(needsCanonicalRedirect('/applications', '/applications')).toBe(false);
    expect(needsCanonicalRedirect('/crm', '/applications')).toBe(true);
    expect(needsCanonicalRedirect('/', '/home')).toBe(true);
    expect(needsCanonicalRedirect('/jobs', '/jobs/matches')).toBe(true);
    expect(resolvePathname('/applications/abc')).toBe('crm');
  });
});

describe('ApplicationDrawer', () => {
  it('shows details and routes actions; uncertain outcomes offer verification, not retry', () => {
    const onReconcile = vi.fn();
    const onRationale = vi.fn();
    const onScreenshot = vi.fn();
    render(
      <ApplicationDrawer app={app} view={view} onClose={() => {}} onRationale={onRationale} onScreenshot={onScreenshot} onReconcile={onReconcile} />
    );
    expect(screen.getByRole('dialog', { name: /Staff Engineer · Acme/ })).toBeDefined();
    expect(screen.getByText('Portal timed out after submit')).toBeDefined();
    expect(screen.getByText('91%')).toBeDefined();
    expect(screen.queryByText(/^Retry/)).toBeNull();

    fireEvent.click(screen.getByText('Verify submission'));
    expect(onReconcile).toHaveBeenCalledWith(app);
    fireEvent.click(screen.getByText('View match rationale'));
    expect(onRationale).toHaveBeenCalledWith(app);
    fireEvent.click(screen.getByText('View screenshot'));
    expect(onScreenshot).toHaveBeenCalledWith(app);
    expect(screen.getByText('Open job posting').closest('a')?.getAttribute('href')).toBe('https://example.com/job');
  });

  it('renders nothing without an application', () => {
    render(<ApplicationDrawer app={null} view={null} onClose={() => {}} onRationale={() => {}} onScreenshot={() => {}} onReconcile={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

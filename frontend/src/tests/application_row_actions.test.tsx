import { describe, it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { ApplicationRow } from '../pages/applications/ApplicationRow';

const handlers = { onToggleReason: vi.fn(), onOpen: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(), onRetry: vi.fn(), onRationale: vi.fn(), onReconcile: vi.fn(), onScreenshot: vi.fn() };
const mk = (o: any) => ({ id: 'a1', job_id: 'j1', job_title: 'Data Engineer', company: 'Acme', created_at: '2026-10-01T00:00:00Z', workflow_state: 'QUEUED', apply_url: 'https://x', ...o });

function actionsCell(app: any, fallbackScore?: number) {
  const { container } = render(
    <table><tbody><ApplicationRow app={app} fallbackScore={fallbackScore} isExpanded={false} {...handlers} /></tbody></table>
  );
  const cells = container.querySelectorAll('td');
  return within(cells[cells.length - 1] as HTMLElement);
}

describe('Applications row actions: one primary, at most one secondary', () => {
  it('review queue: Approve + Dismiss only', () => {
    const a = actionsCell(mk({ workflow_state: 'APPROVAL_REQUIRED' }));
    expect(a.getAllByRole('button').map((b) => b.textContent)).toEqual(['Approve', 'Dismiss']);
    expect(a.queryAllByRole('link')).toHaveLength(0);
  });
  it('needs verification: Verify Outcome + Reason', () => {
    const a = actionsCell(mk({ workflow_state: 'SUBMISSION_UNKNOWN' }));
    expect(a.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Verify Outcome', 'Reason']);
  });
  it('failed: Retry + Reason', () => {
    const a = actionsCell(mk({ workflow_state: 'FAILED' }));
    expect(a.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Retry', 'Reason']);
    expect(a.getByRole('button', { name: /reason/i }).getAttribute('aria-expanded')).toBe('false');
  });
  it('skipped: Reason only', () => {
    const a = actionsCell(mk({ workflow_state: 'SKIPPED' }));
    expect(a.getAllByRole('button')).toHaveLength(1);
  });
});

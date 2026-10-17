import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { formatRelativeTime } from '../pages/jobs/jobFreshness';
import { JobCard } from '../pages/jobs/JobCard';

const job: any = { id: 'j1', title: 'Data Engineer', company: 'Acme', location: 'Pune', apply_url: 'https://x', posted_at: null, raw_posted_text: '2 days ago' };

describe('formatRelativeTime', () => {
  it('falls back to the raw text without a timestamp', () => {
    expect(formatRelativeTime(job).label).toBe('2 days ago');
  });
  it('labels recent postings as live', () => {
    const r = formatRelativeTime({ ...job, posted_at: new Date(Date.now() - 5 * 60000).toISOString() });
    expect(r.isLive).toBe(true);
    expect(r.label).toMatch(/min ago/);
  });
  it('uses weeks for old postings', () => {
    const r = formatRelativeTime({ ...job, posted_at: new Date(Date.now() - 20 * 86400000).toISOString() });
    expect(r.label).toBe('Posted 2 weeks ago');
  });
});

describe('JobCard', () => {
  const base = {
    job, isSelected: false, isLiveSubmitted: false, isLiveQueued: false, liveApplyingJobId: null, activeRun: null,
    evaluating: false, deleting: false,
    onToggleSelect: vi.fn(), onOpen: vi.fn(), onEvaluate: vi.fn(), onApply: vi.fn(), onDelete: vi.fn(),
  };
  it('opens the detail drawer from the title', () => {
    const onOpen = vi.fn();
    render(<JobCard {...base} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Data Engineer' }));
    expect(onOpen).toHaveBeenCalledWith('j1');
  });
  it('shows an applied job as applied', () => {
    render(<JobCard {...base} isLiveSubmitted />);
    expect(screen.getAllByText(/applied/i).length).toBeGreaterThan(0);
  });
});

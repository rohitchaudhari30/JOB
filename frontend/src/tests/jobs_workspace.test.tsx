import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useEffect, useState } from 'react';

// Stub the two lenses so these tests are about the shell: lens routing and the shared selection.
vi.mock('../pages/JobDiscovery', () => ({
  JobDiscovery: (p: any) => (
    <div data-testid="all-lens">
      <span data-testid="all-sel">{[...p.selectedJobIds].sort().join(',')}</span>
      <button onClick={() => p.onSelectedJobIdsChange(new Set(['j1', 'j2']))}>pick two</button>
    </div>
  ),
}));
vi.mock('../pages/AIMatches', () => ({
  AIMatches: (p: any) => (
    <div data-testid="matched-lens" data-lens={p.lens}>
      <span data-testid="matched-sel">{[...p.selectedJobIds].sort().join(',')}</span>
    </div>
  ),
}));

import { JobsWorkspace, readLens } from '../pages/JobsWorkspace';

function Host({ initial }: { initial: 'discovery' | 'matches' }) {
  const [tab, setTab] = useState<'discovery' | 'matches'>(initial);
  // Like the real app: the tab follows the address bar.
  useEffect(() => {
    const onPop = () => setTab(window.location.pathname.startsWith('/jobs/matches') ? 'matches' : 'discovery');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return (
    <JobsWorkspace
      tab={tab}
      onNavigate={(t: string) => {
        window.history.pushState({}, '', t === 'matches' ? '/jobs/matches' : '/jobs');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    />
  );
}

beforeEach(() => {
  window.history.pushState({}, '', '/jobs');
});

describe('readLens', () => {
  it('maps tab and query to a lens', () => {
    expect(readLens('discovery', '')).toBe('all');
    expect(readLens('matches', '')).toBe('matched');
    expect(readLens('matches', '?lens=review')).toBe('review');
    expect(readLens('matches', '?lens=nonsense')).toBe('matched');
  });
});

describe('Jobs workspace', () => {
  it('is one page with one h1 and a three-way lens switch', () => {
    render(<Host initial="discovery" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Jobs');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['All discovered', 'Matched', 'Needs review']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('all-lens')).toBeTruthy();
  });

  it('switching lens keeps the selection and updates the address', async () => {
    window.history.pushState({}, '', '/jobs');
    render(<Host initial="discovery" />);
    fireEvent.click(screen.getByText('pick two'));
    expect(screen.getByTestId('all-sel').textContent).toBe('j1,j2');

    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Matched' })); });
    expect(window.location.pathname).toBe('/jobs/matches');
    await waitFor(() => expect(screen.getByTestId('matched-lens').getAttribute('data-lens')).toBe('matched'));
    expect(screen.getByTestId('matched-sel').textContent).toBe('j1,j2');
  });
});

describe('Needs review lens', () => {
  it('uses ?lens=review on the matches address and can go back to Matched', async () => {
    window.history.pushState({}, '', '/jobs/matches');
    render(<Host initial="matches" />);
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Needs review' })); });
    expect(window.location.pathname + window.location.search).toBe('/jobs/matches?lens=review');
    await waitFor(() => expect(screen.getByTestId('matched-lens').getAttribute('data-lens')).toBe('review'));
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Matched' })); });
    expect(window.location.search).toBe('');
    await waitFor(() => expect(screen.getByTestId('matched-lens').getAttribute('data-lens')).toBe('matched'));
  });

  it('opening a review deep link selects the Needs review lens', () => {
    window.history.pushState({}, '', '/jobs/matches?lens=review');
    render(<Host initial="matches" />);
    expect(screen.getByRole('tab', { name: 'Needs review' }).getAttribute('aria-selected')).toBe('true');
  });
});

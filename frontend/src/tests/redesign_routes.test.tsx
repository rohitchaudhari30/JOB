import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { resolveTab, resolvePathname, getPathForTab, TAB_TO_PATH, NAV_GROUPS, getGroupForTab } from '../utils/navigation';
import { SectionTabs } from '../components/SectionTabs';
import { ReadinessBanner } from '../components/ReadinessBanner';

// Every URL that existed before the redesign must still resolve (redesig.md §22).
const LEGACY: Array<[string, string]> = [
  ['/dashboard', 'dashboard'],
  ['/', 'dashboard'],
  ['/auto-apply', 'direct_apply'],
  ['/direct-apply', 'direct_apply'],
  ['/direct_apply', 'direct_apply'],
  ['/apply', 'direct_apply'],
  ['/live-console', 'live_console'],
  ['/live_console', 'live_console'],
  ['/live', 'live_console'],
  ['/live-automation', 'live_console'],
  ['/discovery', 'discovery'],
  ['/job-discovery', 'discovery'],
  ['/job_discovery', 'discovery'],
  ['/jobs', 'discovery'],
  ['/matches', 'matches'],
  ['/ai-matches', 'matches'],
  ['/ai_matches', 'matches'],
  ['/applications', 'crm'],
  ['/crm', 'crm'],
  ['/application', 'crm'],
  ['/analytics', 'analytics'],
  ['/profile', 'profile'],
  ['/candidate-profile', 'profile'],
  ['/connections', 'connections'],
  ['/platform-connections', 'connections'],
  ['/schedules', 'schedules'],
];

describe('redesign routes', () => {
  it.each(LEGACY)('legacy %s still resolves', (path, tab) => {
    expect(resolvePathname(path)).toBe(tab);
    expect(resolveTab(path)).toBe(tab);
  });

  it('every tab has a canonical path that round-trips', () => {
    for (const [tab, path] of Object.entries(TAB_TO_PATH)) {
      expect(resolvePathname(path)).toBe(tab);
      expect(getPathForTab(tab)).toBe(path);
    }
  });

  it('supports ?view=matches and nested record paths', () => {
    expect(resolvePathname('/jobs', '?view=matches')).toBe('matches');
    expect(resolvePathname('/applications/abc123')).toBe('crm');
    expect(resolvePathname('/automation/campaigns/xyz')).toBe('direct_apply');
    expect(resolvePathname('/unknown/place')).toBe('dashboard');
  });

  it('has six primary groups and every tab belongs to exactly one', () => {
    expect(NAV_GROUPS).toHaveLength(6);
    for (const tab of Object.keys(TAB_TO_PATH)) {
      const owners = NAV_GROUPS.filter((g) => g.members.includes(tab as any));
      expect(owners).toHaveLength(1);
    }
    expect(getGroupForTab('schedules').id).toBe('automation');
  });
});

describe('SectionTabs', () => {
  it('shows sub-pages for Settings and navigates between them', () => {
    const onTabChange = vi.fn();
    render(<SectionTabs activeTab="profile" onTabChange={onTabChange} />);
    expect(screen.getByText('Profile').closest('a')?.getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByText('Preferences'));
    expect(onTabChange).toHaveBeenCalledWith('preferences');
  });

  it('Jobs is one page: no section links (its lens switch lives inside the page)', () => {
    const { container } = render(<SectionTabs activeTab="discovery" onTabChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('treats the schedules deep link as Campaigns', () => {
    render(<SectionTabs activeTab="schedules" onTabChange={vi.fn()} />);
    expect(screen.getByText('Campaigns').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  it('renders nothing for single-view sections', () => {
    const { container } = render(<SectionTabs activeTab="crm" onTabChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ReadinessBanner', () => {
  it('renders nothing when ready', () => {
    const { container } = render(<ReadinessBanner missing={[]} onNavigate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists each gap and routes to the right settings tab', () => {
    const onNavigate = vi.fn();
    render(<ReadinessBanner missing={['connection', 'resume']} platformLabel="LinkedIn" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Connect LinkedIn'));
    expect(onNavigate).toHaveBeenCalledWith('connections');
    fireEvent.click(screen.getByText('Upload resume'));
    expect(onNavigate).toHaveBeenCalledWith('resumes');
  });
});

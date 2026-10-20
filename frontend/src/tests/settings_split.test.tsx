import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';

const api = {
  getProfile: vi.fn(),
  listResumes: vi.fn(),
  listSavedAnswers: vi.fn(),
  updateProfile: vi.fn(),
};
vi.mock('../services/api', () => ({ api: new Proxy({}, { get: (_t, k: string) => (api as any)[k] }) }));

import { ProfileManager } from '../pages/ProfileManager';
import { resolveTab, getPathForTab, NAV_GROUPS, resolvePathname } from '../utils/navigation';

const renderView = (view: 'profile' | 'resumes' | 'preferences') =>
  render(
    <ToastProvider>
      <ProfileManager view={view} onNavigate={vi.fn()} />
    </ToastProvider>,
  );

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.getProfile.mockResolvedValue({ headline: 'Engineer', skills: [], experiences: [] });
  api.listResumes.mockResolvedValue([]);
  api.listSavedAnswers.mockResolvedValue([]);
});

// Every section that used to be one of the seven Profile tabs must still exist, in exactly one page.
const HOME: Record<string, 'profile' | 'resumes' | 'preferences'> = {
  'Personal & contact details': 'profile',
  Skills: 'profile',
  'Work experience': 'profile',
  'Compensation & notice period': 'preferences',
  'Work authorization & work mode': 'preferences',
  Resumes: 'resumes',
  'Saved screening answers': 'resumes',
};

describe('Settings split keeps every former Profile tab', () => {
  for (const view of ['profile', 'preferences', 'resumes'] as const) {
    it(`${view} page shows exactly its own sections`, async () => {
      renderView(view);
      await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0));
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim());
      for (const [title, home] of Object.entries(HOME)) {
        if (home === view) expect(headings, `${title} on ${view}`).toContain(title);
        else expect(headings, `${title} must not be on ${view}`).not.toContain(title);
      }
    });
  }

  it('shows one h1 on every page', async () => {
    for (const view of ['profile', 'preferences', 'resumes'] as const) {
      const { unmount } = renderView(view);
      await waitFor(() => expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1));
      unmount();
    }
  });

  it('save bar appears after an edit on the Preferences page and saves the whole profile', async () => {
    api.updateProfile.mockResolvedValue({ headline: 'Engineer', skills: [], experiences: [], notice_period_days: 45 });
    renderView('preferences');
    await waitFor(() => screen.getByText('Compensation & notice period'));
    expect(screen.queryByRole('region', { name: 'Save changes' })).toBeNull();
    const spin = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(spin, { target: { value: '45' } });
    const bar = await screen.findByRole('region', { name: 'Save changes' });
    expect(bar.textContent).toContain('unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledTimes(1));
  });

  it('the Resumes page has no profile Save bar (resumes save themselves)', async () => {
    renderView('resumes');
    await waitFor(() => screen.getByText('Resumes'));
    expect(screen.queryByRole('region', { name: 'Save changes' })).toBeNull();
  });
});

describe('Settings navigation', () => {
  it('new and old URLs resolve to the right page', () => {
    expect(resolvePathname('/settings/profile')).toBe('profile');
    expect(resolvePathname('/settings')).toBe('profile');
    expect(resolvePathname('/settings/resumes')).toBe('resumes');
    expect(resolvePathname('/settings/preferences')).toBe('preferences');
    expect(resolvePathname('/resumes')).toBe('resumes');
    expect(resolvePathname('/candidate-profile')).toBe('profile');
    expect(resolveTab('resumes')).toBe('resumes');
    expect(getPathForTab('preferences')).toBe('/settings/preferences');
  });

  it('Settings lists Profile, Resumes & answers, Preferences, Platform connections, Account in order', () => {
    const settings = NAV_GROUPS.find((g) => g.id === 'settings')!;
    expect(settings.sections!.map((s) => s.label)).toEqual([
      'Profile',
      'Resumes & answers',
      'Preferences',
      'Platform connections',
      'Account',
    ]);
    expect(settings.members).toEqual(['profile', 'resumes', 'preferences', 'connections', 'account']);
  });
});

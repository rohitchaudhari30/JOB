import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveTab,
  getPathForTab,
  getTabFromLocation,
  TAB_TO_PATH,
  PATH_TO_TAB,
} from '../utils/navigation';

describe('URL Navigation & Route Resolution', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('maps all canonical tabs to distinct, proper URL paths', () => {
    expect(TAB_TO_PATH.dashboard).toBe('/dashboard');
    expect(TAB_TO_PATH.live_console).toBe('/live-console');
    expect(TAB_TO_PATH.crm).toBe('/applications');
    expect(TAB_TO_PATH.analytics).toBe('/analytics');
    expect(TAB_TO_PATH.discovery).toBe('/discovery');
    expect(TAB_TO_PATH.matches).toBe('/matches');
    expect(TAB_TO_PATH.direct_apply).toBe('/auto-apply');
    expect(TAB_TO_PATH.profile).toBe('/profile');
    expect(TAB_TO_PATH.connections).toBe('/connections');
    expect(TAB_TO_PATH.schedules).toBe('/schedules');
  });

  it('resolves URL pathnames to the correct NavTab', () => {
    expect(resolveTab('/dashboard')).toBe('dashboard');
    expect(resolveTab('/live-console')).toBe('live_console');
    expect(resolveTab('/live')).toBe('live_console');
    expect(resolveTab('/applications')).toBe('crm');
    expect(resolveTab('/crm')).toBe('crm');
    expect(resolveTab('/analytics')).toBe('analytics');
    expect(resolveTab('/discovery')).toBe('discovery');
    expect(resolveTab('/jobs')).toBe('discovery');
    expect(resolveTab('/matches')).toBe('matches');
    expect(resolveTab('/auto-apply')).toBe('direct_apply');
    expect(resolveTab('/profile')).toBe('profile');
    expect(resolveTab('/connections')).toBe('connections');
    expect(resolveTab('/schedules')).toBe('schedules');
  });

  it('resolves common string aliases', () => {
    expect(resolveTab('live_console')).toBe('live_console');
    expect(resolveTab('live-console')).toBe('live_console');
    expect(resolveTab('live-automation')).toBe('live_console');
    expect(resolveTab('applications')).toBe('crm');
    expect(resolveTab('crm')).toBe('crm');
    expect(resolveTab('ai-matches')).toBe('matches');
    expect(resolveTab('job-discovery')).toBe('discovery');
    expect(resolveTab('direct-apply')).toBe('direct_apply');
    expect(resolveTab('unknown_route')).toBe('dashboard');
    expect(resolveTab('')).toBe('dashboard');
    expect(resolveTab(null)).toBe('dashboard');
  });

  it('extracts canonical tab from current window location', () => {
    window.history.replaceState({}, '', '/live-console');
    expect(getTabFromLocation()).toBe('live_console');

    window.history.replaceState({}, '', '/analytics');
    expect(getTabFromLocation()).toBe('analytics');

    window.history.replaceState({}, '', '/applications');
    expect(getTabFromLocation()).toBe('crm');

    window.history.replaceState({}, '', '/');
    expect(getTabFromLocation()).toBe('dashboard');
  });

  it('returns canonical pathname for any tab ID', () => {
    expect(getPathForTab('live_console')).toBe('/live-console');
    expect(getPathForTab('crm')).toBe('/applications');
    expect(getPathForTab('applications')).toBe('/applications');
    expect(getPathForTab('analytics')).toBe('/analytics');
    expect(getPathForTab('dashboard')).toBe('/dashboard');
  });

  it('supports browser back and forward navigation history', () => {
    // 1. User starts at /dashboard
    window.history.pushState({ tab: 'dashboard' }, '', '/dashboard');
    expect(window.location.pathname).toBe('/dashboard');
    expect(getTabFromLocation()).toBe('dashboard');

    // 2. User navigates to /live-console
    window.history.pushState({ tab: 'live_console' }, '', '/live-console');
    expect(window.location.pathname).toBe('/live-console');
    expect(getTabFromLocation()).toBe('live_console');

    // 3. User navigates to /analytics
    window.history.pushState({ tab: 'analytics' }, '', '/analytics');
    expect(window.location.pathname).toBe('/analytics');
    expect(getTabFromLocation()).toBe('analytics');

    // 4. User hits browser Back button -> popstate to /live-console
    window.history.back();
    // Simulate popstate event fired by browser
    window.history.replaceState({ tab: 'live_console' }, '', '/live-console');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(window.location.pathname).toBe('/live-console');
    expect(getTabFromLocation()).toBe('live_console');
  });
});

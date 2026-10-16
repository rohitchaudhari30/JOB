import type { NavTab } from '../components/Sidebar';
import { BRAND_NAME } from './brand';

/**
 * Canonical URLs (redesign IA). Internal tab ids are unchanged so pages keep
 * working; every previous URL remains valid through PATH_TO_TAB (redirects).
 */
export const TAB_TO_PATH: Record<NavTab, string> = {
  dashboard: '/home',
  discovery: '/jobs',
  matches: '/jobs/matches',
  crm: '/applications',
  direct_apply: '/automation/campaigns',
  schedules: '/automation/campaigns/safety',
  live_console: '/automation/live',
  analytics: '/insights',
  profile: '/settings/profile',
  connections: '/settings/connections',
};

export const PATH_TO_TAB: Record<string, NavTab> = {
  // canonical
  '/home': 'dashboard',
  '/jobs/matches': 'matches',
  '/automation': 'direct_apply',
  '/automation/campaigns': 'direct_apply',
  '/automation/campaigns/safety': 'schedules',
  '/automation/live': 'live_console',
  '/insights': 'analytics',
  '/settings/profile': 'profile',
  '/settings/connections': 'connections',
  // legacy (kept as redirects)
  '/dashboard': 'dashboard',
  '/': 'dashboard',
  '/auto-apply': 'direct_apply',
  '/direct-apply': 'direct_apply',
  '/direct_apply': 'direct_apply',
  '/apply': 'direct_apply',
  '/live-console': 'live_console',
  '/live_console': 'live_console',
  '/live': 'live_console',
  '/live-automation': 'live_console',
  '/discovery': 'discovery',
  '/job-discovery': 'discovery',
  '/job_discovery': 'discovery',
  '/jobs': 'discovery',
  '/matches': 'matches',
  '/ai-matches': 'matches',
  '/ai_matches': 'matches',
  '/applications': 'crm',
  '/crm': 'crm',
  '/application': 'crm',
  '/analytics': 'analytics',
  '/profile': 'profile',
  '/candidate-profile': 'profile',
  '/connections': 'connections',
  '/settings': 'profile',
  '/platform-connections': 'connections',
  '/schedules': 'schedules',
  '/schedule': 'schedules',
};

export const TAB_TITLES: Record<NavTab, string> = {
  dashboard: `Home | ${BRAND_NAME}`,
  discovery: `Jobs | ${BRAND_NAME}`,
  matches: `Jobs · Matches | ${BRAND_NAME}`,
  crm: `Applications | ${BRAND_NAME}`,
  direct_apply: `Automation · Campaigns | ${BRAND_NAME}`,
  schedules: `Automation · Safety & schedule | ${BRAND_NAME}`,
  live_console: `Automation · Live run | ${BRAND_NAME}`,
  analytics: `Insights | ${BRAND_NAME}`,
  profile: `Settings · Profile & resumes | ${BRAND_NAME}`,
  connections: `Settings · Platform connections | ${BRAND_NAME}`,
};

export type NavGroupId = 'home' | 'jobs' | 'applications' | 'automation' | 'insights' | 'settings';

export interface SectionTab {
  tab: NavTab;
  label: string;
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /** Tab opened when the group is chosen from the primary navigation. */
  entry: NavTab;
  /** Tabs that belong to the group (first-class sub-views). */
  members: NavTab[];
  /** Sub-navigation shown inside the page frame (omitted for single-view groups). */
  sections?: SectionTab[];
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'home', label: 'Home', entry: 'dashboard', members: ['dashboard'] },
  {
    id: 'jobs',
    label: 'Jobs',
    entry: 'discovery',
    members: ['discovery', 'matches'],
    sections: [
      { tab: 'discovery', label: 'Discover' },
      { tab: 'matches', label: 'AI matches' },
    ],
  },
  { id: 'applications', label: 'Applications', entry: 'crm', members: ['crm'] },
  {
    id: 'automation',
    label: 'Automation',
    entry: 'direct_apply',
    members: ['direct_apply', 'schedules', 'live_console'],
    sections: [
      { tab: 'direct_apply', label: 'Campaigns' },
      { tab: 'live_console', label: 'Live run' },
    ],
  },
  { id: 'insights', label: 'Insights', entry: 'analytics', members: ['analytics'] },
  {
    id: 'settings',
    label: 'Settings',
    entry: 'profile',
    members: ['profile', 'connections'],
    sections: [
      { tab: 'profile', label: 'Profile & resumes' },
      { tab: 'connections', label: 'Platform connections' },
    ],
  },
];

export function getGroupForTab(tab: NavTab): NavGroup {
  return NAV_GROUPS.find((g) => g.members.includes(tab)) || NAV_GROUPS[0];
}

/**
 * Resolves any tab ID, alias, or pathname string to a canonical NavTab.
 */
export function resolveTab(input: NavTab | string | null | undefined): NavTab {
  if (!input) return 'dashboard';

  const clean = input.trim().toLowerCase();

  // If it's a known pathname
  if (clean.startsWith('/')) {
    const [pathPart, queryPart = ''] = clean.split('?');
    return resolvePathname(pathPart, queryPart ? `?${queryPart}` : '');
  }

  // If it's already a known canonical tab
  if (clean in TAB_TO_PATH) {
    return clean as NavTab;
  }

  // Common aliases
  switch (clean) {
    case 'applications':
    case 'application':
    case 'crm':
      return 'crm';
    case 'live':
    case 'live-console':
    case 'live_console':
    case 'live-automation':
    case 'live_automation':
      return 'live_console';
    case 'matches':
    case 'ai-matches':
    case 'ai_matches':
      return 'matches';
    case 'discovery':
    case 'jobs':
    case 'job-discovery':
    case 'job_discovery':
      return 'discovery';
    case 'auto-apply':
    case 'auto_apply':
    case 'direct-apply':
    case 'direct_apply':
    case 'apply':
      return 'direct_apply';
    case 'profile':
    case 'candidate-profile':
      return 'profile';
    case 'connections':
    case 'platform-connections':
      return 'connections';
    case 'schedules':
    case 'schedule':
      return 'schedules';
    case 'home':
      return 'dashboard';
    case 'settings':
      return 'profile';
    case 'insights':
      return 'analytics';
    case 'analytics':
      return 'analytics';
    case 'dashboard':
    default:
      return 'dashboard';
  }
}

/**
 * Extracts current canonical tab from window.location.pathname.
 */
export function getTabFromLocation(): NavTab {
  if (typeof window === 'undefined') return 'dashboard';
  return resolvePathname(window.location.pathname, window.location.search);
}

/**
 * Maps a pathname (+ optional query) to a tab. Unknown trailing segments
 * (e.g. a future /applications/:id) fall back to the parent route.
 */
export function resolvePathname(pathname: string, search = ''): NavTab {
  let path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (path === '/jobs' && new URLSearchParams(search).get('view') === 'matches') {
    return 'matches';
  }
  while (path) {
    const hit = PATH_TO_TAB[path];
    if (hit) return hit;
    const idx = path.lastIndexOf('/');
    if (idx <= 0) break;
    path = path.slice(0, idx);
  }
  return 'dashboard';
}

/**
 * Gets the canonical URL pathname for any tab or alias.
 */
export function getPathForTab(tab: NavTab | string): string {
  const resolved = resolveTab(tab);
  return TAB_TO_PATH[resolved] || '/home';
}

/**
 * True when the browser URL should be rewritten to the tab's canonical path.
 * Nested record paths under the canonical path (e.g. /applications/abc) are
 * already canonical and must be kept.
 */
export function needsCanonicalRedirect(currentPath: string, canonicalPath: string): boolean {
  const cur = currentPath.toLowerCase().replace(/\/+$/, '') || '/';
  return !(cur === canonicalPath || cur.startsWith(canonicalPath + '/'));
}

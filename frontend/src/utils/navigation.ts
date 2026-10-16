import { NavTab } from '../components/Sidebar';

export const TAB_TO_PATH: Record<NavTab, string> = {
  dashboard: '/dashboard',
  direct_apply: '/auto-apply',
  live_console: '/live-console',
  discovery: '/discovery',
  matches: '/matches',
  crm: '/applications',
  analytics: '/analytics',
  profile: '/profile',
  connections: '/connections',
  schedules: '/schedules',
};

export const PATH_TO_TAB: Record<string, NavTab> = {
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
  '/settings': 'connections',
  '/platform-connections': 'connections',
  '/schedules': 'schedules',
};

export const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'Dashboard | AutoApply.ai',
  direct_apply: 'Auto-Apply Campaigns | AutoApply.ai',
  live_console: 'Live Console & Telemetry | AutoApply.ai',
  discovery: 'Job Discovery | AutoApply.ai',
  matches: 'AI Matches & Strategy | AutoApply.ai',
  crm: 'Applications CRM | AutoApply.ai',
  analytics: 'Analytics & Funnel | AutoApply.ai',
  profile: 'Candidate Profile | AutoApply.ai',
  connections: 'Platform Connections | AutoApply.ai',
  schedules: 'Automation Schedules | AutoApply.ai',
};

/**
 * Resolves any tab ID, alias, or pathname string to a canonical NavTab.
 */
export function resolveTab(input: NavTab | string | null | undefined): NavTab {
  if (!input) return 'dashboard';

  const clean = input.trim().toLowerCase();

  // If it's a known pathname
  if (clean.startsWith('/')) {
    const stripped = clean.replace(/\/+$/, '') || '/';
    return PATH_TO_TAB[stripped] || 'dashboard';
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
    case 'settings':
      return 'connections';
    case 'schedules':
    case 'schedule':
      return 'schedules';
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
  const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return PATH_TO_TAB[pathname] || 'dashboard';
}

/**
 * Gets the canonical URL pathname for any tab or alias.
 */
export function getPathForTab(tab: NavTab | string): string {
  const resolved = resolveTab(tab);
  return TAB_TO_PATH[resolved] || '/dashboard';
}

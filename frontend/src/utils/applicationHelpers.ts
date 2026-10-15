import { Application } from '../types';

// Pure helpers for the applications page, kept apart from the page component (FE-02).

export type DerivedStatus = 'Applied' | 'Needs Verification' | 'Skipped' | 'Failed' | 'Company site' | 'Already applied' | 'Pending';

export const isUuidString = (str?: string | null): boolean => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
};

export const resolvePlatformName = (app: Application): string => {
  const candidate = app.platform || app.job?.source_type;
  if (candidate && !isUuidString(candidate)) {
    const lower = candidate.toLowerCase();
    if (lower === 'naukri') return 'Naukri';
    if (lower === 'linkedin') return 'LinkedIn';
    if (lower === 'indeed') return 'Indeed';
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }

  // Derive portal name from apply_url if available
  const url = (app.apply_url || app.job?.apply_url || '').toLowerCase();
  if (url.includes('naukri')) return 'Naukri';
  if (url.includes('linkedin')) return 'LinkedIn';
  if (url.includes('indeed')) return 'Indeed';
  if (url.includes('foundit') || url.includes('monster')) return 'Foundit';

  // Safe fallback to Naukri since that is our primary portal
  return 'Naukri';
};

export const parseSafeDate = (val?: string | null): Date | null => {
  if (!val) return null;
  if (typeof val === 'string') {
    const s = val.trim().replace(' ', 'T');
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(val);
  return !isNaN(fallback.getTime()) ? fallback : null;
};

export const getDayStartTimestamp = (dateStr: string): number | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 0, 0, 0, 0).getTime();
  }
  const fallback = new Date(dateStr);
  return !isNaN(fallback.getTime())
    ? new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 0, 0, 0, 0).getTime()
    : null;
};

export const getDayEndTimestamp = (dateStr: string): number | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 23, 59, 59, 999).getTime();
  }
  const fallback = new Date(dateStr);
  return !isNaN(fallback.getTime())
    ? new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 23, 59, 59, 999).getTime()
    : null;
};

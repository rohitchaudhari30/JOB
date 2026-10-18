import type { CandidateProfile } from '../../types';

export const defaultProfile: CandidateProfile = {
  id: '',
  user_id: '',
  headline: '',
  summary: '',
  phone: '',
  location: '',
  current_ctc: 0,
  expected_ctc: 0,
  currency: 'INR',
  notice_period_days: 30,
  total_experience_months: 36,
  work_authorization: 'Indian Citizen (No Visa / Sponsorship Needed)',
  relocation_preference: true,
  remote_preference: 'any',
  experiences: [],
  skills: [],
};

export type SetupTab = 'personal' | 'skills' | 'experience' | 'compensation' | 'preferences' | 'resumes' | 'answers';

/** Share of the profile that is filled in, and what is still missing. */
export function calculateCompleteness(profile: CandidateProfile, resumeCount: number) {
  let score = 0;
  const missing: string[] = [];

  if (profile.headline) score += 15;
  else missing.push('Target Role Headline');

  if (profile.phone) score += 15;
  else missing.push('Contact Phone');

  if (profile.location) score += 15;
  else missing.push('Current Location');

  if (profile.skills && profile.skills.length >= 3) score += 20;
  else missing.push('At least 3 core skills');

  if (resumeCount > 0) score += 20;
  else missing.push('Default PDF Resume');

  if (profile.expected_ctc && profile.expected_ctc > 0) score += 15;
  else missing.push('Expected CTC');

  return { score: Math.min(100, score), missing };
}

/** Whether a setup tab has everything it needs. */
export function isProfileTabComplete(
  tabId: SetupTab,
  profile: CandidateProfile,
  resumeCount: number,
  savedAnswerCount: number,
): boolean {
  switch (tabId) {
    case 'personal':
      return Boolean(profile.headline && profile.phone && profile.location);
    case 'skills':
      return Boolean(profile.skills && profile.skills.length >= 3);
    case 'experience':
      return Boolean(profile.experiences && profile.experiences.length > 0);
    case 'compensation':
      return Boolean(profile.expected_ctc && profile.expected_ctc > 0);
    case 'preferences':
      return Boolean(profile.work_authorization && profile.remote_preference);
    case 'resumes':
      return resumeCount > 0;
    case 'answers':
      return savedAnswerCount >= 3;
    default:
      return false;
  }
}

/**
 * Months covered by the work-experience list, with overlapping jobs counted once.
 * Entries without a parseable start date are ignored; a current job (or a missing end
 * date on a job with a start) runs to `now`. Returns 0 when nothing is usable.
 */
export function monthsFromHistory(
  experiences: ReadonlyArray<{ start_date?: string; end_date?: string; is_current?: boolean }> | undefined,
  now: Date = new Date(),
): number {
  const toIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const spans: Array<[number, number]> = [];
  for (const e of experiences ?? []) {
    const start = e.start_date ? new Date(e.start_date) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const endRaw = !e.is_current && e.end_date ? new Date(e.end_date) : now;
    const end = Number.isNaN(endRaw.getTime()) ? now : endRaw;
    const s = toIndex(start);
    const t = toIndex(end);
    if (t > s) spans.push([s, t]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const sp of spans) {
    if (!cur || sp[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [sp[0], sp[1]];
    } else if (sp[1] > cur[1]) cur[1] = sp[1];
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/** Gap (months) beyond which the typed total is worth a second look. */
export const EXPERIENCE_MISMATCH_MONTHS = 6;

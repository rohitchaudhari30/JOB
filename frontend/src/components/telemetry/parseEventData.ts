import type { TimelineEvent } from '../../types';

export type EventFilter = 'all' | 'applied' | 'matches' | 'discovery' | 'alerts';

/**
 * Deduplicates repeated substrings often scraped from job listing cards
 * e.g. "Python Lead (AWS) Python Lead (AWS)" -> "Python Lead (AWS)"
 */
export function cleanJobTitle(raw: string): string {
  if (!raw) return 'Role';
  let title = raw.trim();
  const halfLen = Math.floor(title.length / 2);
  for (let len = halfLen; len >= 6; len--) {
    const firstHalf = title.slice(0, len).trim();
    const secondHalf = title.slice(len).trim();
    if (secondHalf.startsWith(firstHalf)) {
      title = firstHalf;
      break;
    }
  }
  return title;
}

export interface ParsedEventData {
  jobTitle?: string;
  company?: string;
  location?: string;
  score?: number;
  decision?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  platform?: string;
  reasoning?: string;
  applicationId?: string;
}

export function parseEventData(evt: TimelineEvent): ParsedEventData {
  const payload = evt.payload || {};
  let jobTitle = payload.job_title;
  let company = payload.company;
  let score = payload.score;
  let decision = payload.decision;
  let location = payload.location;
  let matchedSkills = payload.matched_skills;
  let missingSkills = payload.missing_skills;
  let platform = payload.platform;
  let reasoning = payload.reasoning;
  let applicationId = payload.application_id;

  // Fallback regex parsing on raw message if payload is partial
  if ((!jobTitle || !company) && evt.message) {
    const evalMatch = evt.message.match(/Evaluated \[(.+?) at (.+?)\]: Score ([\d.]+)% -> (\w+)/i);
    if (evalMatch) {
      jobTitle = jobTitle || evalMatch[1];
      company = company || evalMatch[2];
      score = score !== undefined ? score : parseFloat(evalMatch[3]);
      decision = decision || evalMatch[4];
    } else {
      const applyMatch = evt.message.match(/Auto-applying to \[(.+?) at (.+?)\]/i);
      if (applyMatch) {
        jobTitle = jobTitle || applyMatch[1];
        company = company || applyMatch[2];
      } else {
        const submitMatch = evt.message.match(/Application submitted successfully for \[(.+?) at (.+?)\]/i);
        if (submitMatch) {
          jobTitle = jobTitle || submitMatch[1];
          company = company || submitMatch[2];
        }
      }
    }
  }

  return {
    jobTitle: jobTitle ? cleanJobTitle(jobTitle) : undefined,
    company: company?.trim(),
    location: location?.trim(),
    score: typeof score === 'number' ? score : undefined,
    decision: decision?.toUpperCase(),
    matchedSkills: Array.isArray(matchedSkills) ? matchedSkills : undefined,
    missingSkills: Array.isArray(missingSkills) ? missingSkills : undefined,
    platform:
      platform ||
      (evt.message?.toLowerCase().includes('naukri')
        ? 'naukri'
        : evt.message?.toLowerCase().includes('linkedin')
          ? 'linkedin'
          : undefined),
    reasoning,
    applicationId,
  };
}

import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Drawer } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { StatusChip } from '../../components/ui/StatusChip';
import type { Job, MatchResult } from '../../types';
import { useHasSavedTailored } from './tailor/savedTailoredStore';
import { TailorResumeDialog } from './tailor/TailorResumeDialog';
import { getMatchScore, getRecommendationScore } from '../../utils/matchScores';

/** Normalised view of a job (+ optional match) shared by both Jobs views. */
export interface JobDetailModel {
  jobId: string;
  title: string;
  company: string;
  location?: string;
  applyUrl?: string;
  postedText?: string;
  experience?: string;
  salary?: string;
  description?: string;
  match?: MatchResult | null;
}

export function jobToDetailModel(j: Job | undefined, matches: Map<string, MatchResult>): JobDetailModel | null {
  if (!j) return null;
  const lo = j.min_experience_years;
  const hi = j.max_experience_years;
  return {
    jobId: j.id, title: j.title, company: j.company, location: j.location, applyUrl: j.apply_url,
    postedText: j.raw_posted_text ?? undefined,
    experience: lo != null || hi != null ? `${lo ?? 0}-${hi ?? '+'} yrs` : undefined,
    description: j.raw_description, match: matches.get(j.id) ?? null,
  };
}

export function matchToDetailModel(m: MatchResult | undefined): JobDetailModel | null {
  if (!m) return null;
  return {
    jobId: m.job_id,
    title: m.job_title || m.job?.title || 'Position',
    company: m.company || m.job?.company || 'Company',
    location: m.location || m.job?.location,
    applyUrl: m.apply_url || m.job?.apply_url,
    postedText: m.raw_posted_text || undefined,
    description: m.job?.raw_description,
    match: m,
  };
}

interface JobDetailDrawerProps {
  model: JobDetailModel | null;
  onClose: () => void;
  onEvaluate: (jobId: string) => void;
  onQueue: (jobId: string) => void;
  evaluating: boolean;
  queueing: boolean;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-3 gap-3 py-2 border-b border-slate-100 dark:border-slate-800 text-sm">
    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="col-span-2 text-slate-900 dark:text-slate-100 break-words">{children}</dd>
  </div>
);

const DIMENSIONS: Array<[string, keyof MatchResult]> = [
  ['Skills', 'skill_match_score'],
  ['Experience', 'experience_score'],
  ['Role / title', 'role_title_score'],
  ['Location', 'location_score'],
  ['Salary', 'salary_score'],
  ['Semantic similarity', 'semantic_score'],
  ['AI assessment', 'ai_score'],
];

const decisionTone = (d?: string) =>
  d === 'AUTO_APPLY' ? 'success' : d === 'REQUIRE_APPROVAL' ? 'warning' : d === 'REJECT' ? 'danger' : 'neutral';

/**
 * One detail panel for a job, opened from either Jobs view and deep-linkable
 * (/jobs/:id, /jobs/matches/:id). Scores keep their own meanings: "Match score"
 * is candidate–job fit; "Recommendation priority" is a separate operational
 * score and is shown only when the backend provides it.
 */
export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({
  model,
  onClose,
  onEvaluate,
  onQueue,
  evaluating,
  queueing,
}) => {
  const m = model?.match || null;
  const rec = m ? getRecommendationScore(m) : null;
  const [tailorOpen, setTailorOpen] = useState(false);
  const savedCopy = useHasSavedTailored(model?.jobId ?? '');
  useEffect(() => setTailorOpen(false), [model?.jobId]);
  return (
    <Drawer open={Boolean(model)} onClose={onClose} title={model ? `${model.title} · ${model.company}` : 'Job'}>
      {model && (
        <div className="space-y-5">
          <dl>
            {model.location && <Row label="Location">{model.location}</Row>}
            {model.postedText && <Row label="Posted">{model.postedText}</Row>}
            {model.experience && <Row label="Experience">{model.experience}</Row>}
            {model.salary && <Row label="Salary">{model.salary}</Row>}
            <Row label="Match score">
              {m ? (
                <span className="inline-flex items-center gap-2">
                  <strong>{Math.round(getMatchScore(m))}%</strong>
                  <StatusChip tone={decisionTone(m.decision)}>{String(m.decision).replace(/_/g, ' ')}</StatusChip>
                </span>
              ) : (
                'Not evaluated yet'
              )}
            </Row>
            {rec !== null && <Row label="Recommendation priority">{Math.round(rec)}%</Row>}
          </dl>

          {m && (
            <section aria-labelledby="why-heading" className="space-y-3">
              <h3 id="why-heading" className="text-sm font-bold text-slate-900 dark:text-white">
                Why this score
              </h3>
              {m.reasoning_summary && <p className="text-sm text-slate-700 dark:text-slate-300">{m.reasoning_summary}</p>}
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
                {DIMENSIONS.map(([label, key]) => {
                  const v = m[key];
                  return typeof v === 'number' ? (
                    <li key={label} className="flex justify-between">
                      <span>{label}</span>
                      <span className="font-mono">{Math.round(v)}</span>
                    </li>
                  ) : null;
                })}
              </ul>
              {(m.matched_skills?.length > 0 || m.missing_skills?.length > 0) && (
                <div className="space-y-1.5 text-xs">
                  {m.matched_skills?.length > 0 && (
                    <p>
                      <span className="font-semibold">Matched skills: </span>
                      {m.matched_skills.join(', ')}
                    </p>
                  )}
                  {m.missing_skills?.length > 0 && (
                    <p>
                      <span className="font-semibold">Missing skills: </span>
                      {m.missing_skills.join(', ')}
                    </p>
                  )}
                </div>
              )}
              {m.blocking_reasons && m.blocking_reasons.length > 0 && (
                <div role="note" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200">
                  <strong>Blocking: </strong>
                  {m.blocking_reasons.join('; ')}
                </div>
              )}
              {m.recommendation_reasons && m.recommendation_reasons.length > 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">Recommendation notes: </span>
                  {m.recommendation_reasons.join('; ')}
                </p>
              )}
            </section>
          )}

          {model.description && (
            <section aria-labelledby="desc-heading">
              <h3 id="desc-heading" className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                Description
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line max-h-48 overflow-y-auto">
                {model.description}
              </p>
            </section>
          )}

          {savedCopy && (
            <p role="status" className="text-xs text-emerald-800 dark:text-emerald-300">
              A tailored resume is saved for this job. It will be sent when you queue the application.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" loading={queueing} onClick={() => onQueue(model.jobId)}>
              Queue application
            </Button>
            <Button size="sm" onClick={() => setTailorOpen(true)}>
              Tailor resume for this job
            </Button>
            <Button size="sm" loading={evaluating} onClick={() => onEvaluate(model.jobId)}>
              {m ? 'Re-evaluate' : 'Evaluate fit'}
            </Button>
            {model.applyUrl && (
              <a
                href={model.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                Open job posting
              </a>
            )}
          </div>
        </div>
      )}
      {model && (
        <TailorResumeDialog
          open={tailorOpen}
          jobId={model.jobId}
          jobTitle={model.title}
          onClose={() => setTailorOpen(false)}
        />
      )}
    </Drawer>
  );
};

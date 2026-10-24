import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  Sparkles,
  MapPin,
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Send,
} from 'lucide-react';
import { Drawer } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { StatusChip } from '../../components/ui/StatusChip';
import type { Job, MatchResult } from '../../types';
import { useHasSavedTailored } from './tailor/savedTailoredStore';
import { TailorResumeDialog } from './tailor/TailorResumeDialog';
import { getMatchScore } from '../../utils/matchScores';
import { getSafeExternalUrl } from '../../utils/urlSafety';

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
    jobId: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    applyUrl: j.apply_url,
    postedText: j.raw_posted_text ?? undefined,
    experience: lo != null || hi != null ? `${lo ?? 0}-${hi ?? '+'} yrs` : undefined,
    description: j.raw_description,
    match: matches.get(j.id) ?? null,
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

const DIMENSIONS: Array<[string, keyof MatchResult]> = [
  ['Skills Alignment', 'skill_match_score'],
  ['Contextual & Semantic Fit', 'semantic_score'],
  ['Experience & Seniority', 'experience_score'],
  ['Role & Title Relevance', 'role_title_score'],
  ['Location Match', 'location_score'],
  ['Salary Expectation', 'salary_score'],
];

const decisionTone = (d?: string) =>
  d === 'AUTO_APPLY' ? 'success' : d === 'REQUIRE_APPROVAL' ? 'warning' : d === 'REJECT' ? 'danger' : 'neutral';

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({
  model, onClose, onEvaluate, onQueue, evaluating, queueing,
}) => {
  const [activeTab, setActiveTab] = useState<'match' | 'skills' | 'description'>('match');
  const [tailorOpen, setTailorOpen] = useState(false);
  const m = model?.match || null;
  const savedCopy = useHasSavedTailored(model?.jobId ?? '');
  const safeApplyUrl = getSafeExternalUrl(model?.applyUrl);
  const hasDimensions = Boolean(m && DIMENSIONS.some(([_, key]) => typeof m[key] === 'number'));

  useEffect(() => {
    setTailorOpen(false);
    setActiveTab('match');
  }, [model?.jobId]);

  const score = m ? Math.round(getMatchScore(m)) : 0;

  const tabs = [
    { id: 'match' as const, label: 'AI Breakdown & Fit', icon: Sparkles },
    { id: 'skills' as const, label: `Skill Alignment (${m?.matched_skills?.length || 0})`, icon: CheckCircle2 },
    { id: 'description' as const, label: 'Job Description', icon: FileText },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveTab(tabs[(index + 1) % tabs.length].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveTab(tabs[(index - 1 + tabs.length) % tabs.length].id);
    }
  };

  return (
    <Drawer
      open={Boolean(model)}
      onClose={onClose}
      title={model ? `${model.title} · ${model.company}` : 'Job Details'}
      widthClass="w-full lg:w-[70vw] xl:w-[62vw] max-w-5xl"
    >
      {model && (
        <div className="flex flex-col h-full space-y-6">
          {/* Header Overview Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opportunity Overview</span>
                <h1 className="text-xl font-black text-slate-900 dark:text-white">{model.title}</h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-medium pt-0.5">
                  <span className="font-bold text-slate-900 dark:text-slate-200">{model.company}</span>
                  {model.location && (
                    <span className="flex items-center gap-1">· <MapPin className="w-3.5 h-3.5 text-slate-400" />{model.location}</span>
                  )}
                  {model.experience && (
                    <span className="flex items-center gap-1">· <Briefcase className="w-3.5 h-3.5 text-slate-400" />{model.experience}</span>
                  )}
                  {model.postedText && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                      · <Clock className="w-3.5 h-3.5" />{model.postedText}
                    </span>
                  )}
                </div>
              </div>

              {/* Match Score Badge */}
              <div className="flex items-center gap-3">
                {m ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-white p-3 border border-slate-200 shadow-xs dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-base shadow-xs">
                      {score}%
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Overall Fit</span>
                      <StatusChip tone={decisionTone(m.decision)}>{String(m.decision || 'PENDING EVALUATION').replace(/_/g, ' ')}</StatusChip>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" loading={evaluating} onClick={() => onEvaluate(model.jobId)}>
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 mr-1" />
                    Evaluate Fit
                  </Button>
                )}
              </div>
            </div>

            {/* Quick Tabs Bar */}
            <div role="tablist" aria-label="Job detail views" className="flex rounded-xl bg-slate-200/80 p-1 dark:bg-slate-800 text-xs font-bold">
              {tabs.map((t, idx) => (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  role="tab"
                  aria-selected={activeTab === t.id}
                  aria-controls={`tabpanel-${t.id}`}
                  tabIndex={activeTab === t.id ? 0 : -1}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className={`flex-1 py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === t.id
                      ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1: AI Match & Reasoning */}
          {activeTab === 'match' && (
            <div id="tabpanel-match" role="tabpanel" aria-labelledby="tab-match" className="space-y-5">
              {m ? (
                <>
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-300">
                      Executive AI Recommendation
                    </span>
                    <p className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200">
                      {m.reasoning_summary || 'Your profile demonstrates strong alignment with core role requirements.'}
                    </p>
                  </div>

                  {hasDimensions && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                        Multi-Stage Fit Dimensions
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {DIMENSIONS.map(([label, key]) => {
                          const val = m[key];
                          if (typeof val !== 'number') return null;
                          const pct = Math.round(val);
                          return (
                            <div key={label} className="space-y-1.5">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-slate-700 dark:text-slate-300">{label}</span>
                                <span className="font-mono text-slate-900 dark:text-white font-bold">{pct}%</span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {m.blocking_reasons && m.blocking_reasons.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                      <strong>Attention required: </strong>
                      {m.blocking_reasons.join('; ')}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    This opportunity has not been evaluated against your resume yet.
                  </p>
                  <Button size="sm" loading={evaluating} onClick={() => onEvaluate(model.jobId)}>
                    Calculate Fit Now
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Skills Alignment */}
          {activeTab === 'skills' && (
            <div id="tabpanel-skills" role="tabpanel" aria-labelledby="tab-skills" className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                      Verified Matched Skills ({m?.matched_skills?.length || 0})
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {m?.matched_skills && m.matched_skills.length > 0 ? (
                      m.matched_skills.map((s) => (
                        <span
                          key={s}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50 inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{s}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">No skills matched directly.</span>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                      Skills to Bridge in Resume Optimization ({m?.missing_skills?.length || 0})
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    Optimizing your resume emphasizes your related achievements and equivalent workflows to satisfy these requirements.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {m?.missing_skills && m.missing_skills.length > 0 ? (
                      m.missing_skills.map((s) => (
                        <span
                          key={s}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 inline-flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-600" />
                          <span>{s}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-emerald-600 font-medium">All essential skills verified!</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Full Job Description */}
          {activeTab === 'description' && (
            <div id="tabpanel-description" role="tabpanel" aria-labelledby="tab-description" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Full Employer Job Posting
              </span>
              <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed max-h-[460px] overflow-y-auto pr-2">
                {model.description || 'No detailed description text provided in posting feed.'}
              </div>
            </div>
          )}

          {/* Sticky Actions Bar */}
          <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              {savedCopy ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  ✓ Custom optimized resume saved for this position
                </span>
              ) : (
                <span>Ready to optimize or apply directly</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {safeApplyUrl && (
                <a
                  href={safeApplyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Job Link</span>
                </a>
              )}

              <Button variant="secondary" size="sm" loading={evaluating} onClick={() => onEvaluate(model.jobId)} className="rounded-xl">
                <span>{m ? 'Re-evaluate' : 'Evaluate fit'}</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setTailorOpen(true)} className="rounded-xl">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 mr-1" />
                <span>Optimize Resume</span>
              </Button>
              <Button variant="primary" size="sm" loading={queueing} onClick={() => onQueue(model.jobId)} className="rounded-xl">
                <Send className="w-3.5 h-3.5 mr-1" />
                <span>Queue Application</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {model && (
        <TailorResumeDialog
          open={tailorOpen}
          jobId={model.jobId}
          jobTitle={model.title}
          applyUrl={model.applyUrl}
          onClose={() => setTailorOpen(false)}
        />
      )}
    </Drawer>
  );
};

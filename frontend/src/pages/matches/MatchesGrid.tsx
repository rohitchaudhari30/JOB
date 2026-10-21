import { TailorButton } from '../jobs/tailor/TailorButton';
import React from 'react';
import { Sparkles, Brain, Send, Building, MapPin, ExternalLink, RefreshCw, Check, X, Flame } from 'lucide-react';
import type { MatchResult } from '../../types';
import { getMatchScore } from '../../utils/matchScores';
import { getDecisionBadge, getScoreColor } from '../jobs/matchBadges';
import { Button } from '../../components/ui/Button';

interface Props {
  loading: boolean;
  allMatches: MatchResult[];
  filteredAndSortedMatches: MatchResult[];
  isEvaluatingAll: boolean;
  applyingJobId: string | null;
  handleEvaluateAll: () => void;
  handleApplySingle: (jobId: string) => void;
  onNavigate: ((tab: any) => void) | undefined;
  record: { open: (id: string) => void };
  selectedJobIds: Set<string>;
  onToggleSelect: (jobId: string) => void;
  setDecisionFilter: (v: string) => void;
  setMinScoreFilter: (n: number) => void;
  setSearchQuery: (v: string) => void;
}

export const MatchesGrid: React.FC<Props> = ({
  loading,
  allMatches,
  filteredAndSortedMatches,
  isEvaluatingAll,
  applyingJobId,
  handleEvaluateAll,
  handleApplySingle,
  onNavigate,
  record,
  selectedJobIds,
  onToggleSelect,
  setDecisionFilter,
  setMinScoreFilter,
  setSearchQuery,
}) => (
  <>
    {/* Matches Grid or Empty State */}
    {loading ? (
      <div className="text-center py-24 bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
        <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Loading your matches…
        </div>
        <p className="text-xs text-slate-400">This can take a few seconds.</p>
      </div>
    ) : filteredAndSortedMatches.length === 0 ? (
      <div className="text-center py-20 bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 shadow-sm space-y-4 max-w-xl mx-auto">
        <div className="p-4 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 w-fit mx-auto">
          <Brain className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {allMatches.length === 0 ? 'No scored jobs yet' : 'No jobs fit these filters'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {allMatches.length === 0
              ? 'Score your discovered jobs against your profile and resume to see how well each one fits.'
              : 'Try adjusting your minimum score slider, clearing the search query, or resetting filters.'}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          {allMatches.length === 0 ? (
            <Button variant="primary" size="sm"
              onClick={handleEvaluateAll}
              disabled={isEvaluatingAll}>
              <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span>Score my jobs</span>
            </Button>
          ) : (
            <button type="button"
              onClick={() => {
                setMinScoreFilter(0);
                setDecisionFilter('ALL');
                setSearchQuery('');
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredAndSortedMatches.map((m) => {
          const decisionInfo = getDecisionBadge(m.decision);
          const scoreClass = getScoreColor(getMatchScore(m));

          return (
            <div
              key={m.id}
              className="p-6 rounded-3xl bg-white border border-slate-200/80 hover:border-indigo-300 dark:bg-slate-900/80 dark:border-slate-800 dark:hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-5 shadow-sm hover:shadow-md group"
            >
              <div className="space-y-4">
                {/* Card Header: Decision badge + Score */}
                <div className="flex items-start justify-between gap-4">
                  <input
                    type="checkbox"
                    checked={selectedJobIds.has(m.job_id)}
                    onChange={() => onToggleSelect(m.job_id)}
                    aria-label={`Select ${m.job_title || 'position'} at ${m.company || 'company'}`}
                    className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${decisionInfo.classes}`}
                      >
                        {decisionInfo.icon}
                        <span>{decisionInfo.label}</span>
                      </span>
                    </div>

                    {/* Job Title */}
                    <h2
                      className="text-base font-bold text-slate-900 dark:text-white truncate pt-1"
                      title={m.job_title || ''}
                    >
                      <button
                        type="button"
                        onClick={() => record.open(m.job_id)}
                        className="text-left hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer"
                        aria-label={`Open details for ${m.job_title || 'position'}`}
                      >
                        {m.job_title || 'Discovered Position'}
                      </button>
                    </h2>

                    {/* Company & Location & Freshness */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <div className="flex items-center space-x-1">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate max-w-[160px] font-semibold text-slate-700 dark:text-slate-300">
                          {m.company || 'Direct Employer'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate max-w-[140px]">{m.location || 'Remote / Hybrid'}</span>
                      </div>
                      {m.raw_posted_text && (
                        <div className="flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/40">
                          <Flame className="w-3 h-3 text-amber-500" />
                          <span>{m.raw_posted_text}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Match Score & Recommendation Score Dial */}
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`px-3.5 py-1.5 rounded-2xl border text-xl font-black font-mono shadow-xs ${scoreClass}`}
                    >
                      {getMatchScore(m).toFixed(0)}%
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold block mt-1">Match Score</span>
                    {m.recommendation_score !== undefined && m.recommendation_score !== null && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 mt-0.5">
                        Priority {m.recommendation_score.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* 5-Stage Multi-stage Metrics Strip */}
                <div className="grid grid-cols-4 gap-2 p-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60 text-center">
                  <div className="px-1">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">
                      Hard Filters
                    </div>
                    <div className="text-xs font-bold mt-0.5 flex items-center justify-center space-x-1">
                      {m.hard_filter_passed ? (
                        <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center">
                          <Check className="w-3 h-3 mr-0.5" /> Pass
                        </span>
                      ) : (
                        <span className="text-rose-700 dark:text-rose-400 inline-flex items-center">
                          <X className="w-3 h-3 mr-0.5" /> Fail
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="px-1 border-l border-slate-200/60 dark:border-slate-800/60">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">Skill Match</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                      {(m.skill_match_score || 0).toFixed(0)}%
                    </div>
                  </div>

                  <div className="px-1 border-l border-slate-200/60 dark:border-slate-800/60">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">
                      Semantic Fit
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                      {(m.semantic_score || 0).toFixed(0)}%
                    </div>
                  </div>

                  <div className="px-1 border-l border-slate-200/60 dark:border-slate-800/60">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">Experience</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                      {m.experience_score !== undefined ? `${m.experience_score.toFixed(0)}%` : '—'}
                    </div>
                  </div>
                </div>

                {/* AI Reasoning Summary Callout */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                    <div className="flex items-center space-x-1.5">
                      <Brain className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>AI Match Analysis ({m.ai_provider_used || 'groq'}):</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                    {m.reasoning_summary ||
                      'Evaluated against candidate qualifications, requirements, and domain skills.'}
                  </p>
                  {m.recommendation_reasons && m.recommendation_reasons.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-200/50 dark:border-slate-800/50 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Recommendation Drivers:
                      </span>
                      <ul className="text-[11px] text-slate-600 dark:text-slate-300 list-disc list-inside space-y-0.5">
                        {m.recommendation_reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {m.blocking_reasons && m.blocking_reasons.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                        Caution / Disqualifiers:
                      </span>
                      <ul className="text-[11px] text-rose-700 dark:text-rose-400 list-disc list-inside space-y-0.5">
                        {m.blocking_reasons.map((br, i) => (
                          <li key={i}>{br}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Skill Gap & Overlap Analysis */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <span>Skill Alignment:</span>
                    <span className="text-[10px] font-medium font-sans text-slate-500 dark:text-slate-400">
                      {m.matched_skills?.length || 0} Matched · {m.missing_skills?.length || 0} Missing
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                    {m.matched_skills &&
                      m.matched_skills.map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/50 inline-flex items-center space-x-1"
                        >
                          <Check className="w-2.5 h-2.5" />
                          <span>{s}</span>
                        </span>
                      ))}

                    {m.missing_skills &&
                      m.missing_skills.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onNavigate?.('profile')}
                          title="Click to add/update skills in Candidate Profile"
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 dark:border-rose-800/40 inline-flex items-center space-x-1 cursor-pointer transition-colors"
                        >
                          <X className="w-2.5 h-2.5" />
                          <span>{s}</span>
                        </button>
                      ))}

                    {(!m.matched_skills || m.matched_skills.length === 0) &&
                      (!m.missing_skills || m.missing_skills.length === 0) && (
                        <span className="text-xs text-slate-400 italic">No explicit skills detected in JD.</span>
                      )}
                  </div>
                </div>
              </div>

              {/* Card Action Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
                <div className="text-[11px] text-slate-400">
                  {m.created_at ? new Date(m.created_at).toLocaleDateString() : 'Active Match'}
                </div>

                <div className="flex items-center space-x-2">
                  {m.apply_url && (
                    <a
                      href={m.apply_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Job Link</span>
                    </a>
                  )}

                  <TailorButton jobId={m.job_id} jobTitle={m.job_title || m.job?.title || 'this job'} className="py-2 rounded-xl" />

                  <button type="button"
                    onClick={() => handleApplySingle(m.job_id)}
                    disabled={applyingJobId === m.job_id}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center space-x-1.5 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{applyingJobId === m.job_id ? 'Queuing…' : 'Queue to apply'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </>
);

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Brain,
  MapPin,
  ExternalLink,

  Check,
  ArrowRight,
  ShieldCheck,
  Zap,
  Bookmark,
  Briefcase,
} from 'lucide-react';
import type { MatchResult } from '../../types';
import { getMatchScore } from '../../utils/matchScores';
import { Button } from '../../components/ui/Button';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { TailorButton } from '../jobs/tailor/TailorButton';
import { MatchesPagination } from './MatchesPagination';
import { MatchRelevanceHud } from './MatchRelevanceHud';

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

const getInitials = (name?: string) => {
  if (!name) return 'CO';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const formatExperienceRange = (m: MatchResult): string => {
  const min = m.min_experience_years ?? m.job?.min_experience_years;
  const max = m.max_experience_years ?? m.job?.max_experience_years;

  if (min !== undefined && min !== null && min > 0) {
    if (max !== undefined && max !== null && max > min) {
      return `${Math.round(min)}-${Math.round(max)} yrs`;
    }
    return `${Math.round(min)}+ yrs`;
  }
  if (max !== undefined && max !== null && max > 0) {
    return `Up to ${Math.round(max)} yrs`;
  }

  if (m.reasoning_summary) {
    const reqMatch = m.reasoning_summary.match(/Experience required:\s*([0-9.]+)(?:\s*-\s*([0-9.]+))?\s*yrs?/i);
    if (reqMatch) {
      const minReq = Math.round(parseFloat(reqMatch[1]));
      if (reqMatch[2]) {
        return `${minReq}-${Math.round(parseFloat(reqMatch[2]))} yrs`;
      }
      return minReq > 0 ? `${minReq}+ yrs` : '0-1 yr';
    }
    const generalMatch = m.reasoning_summary.match(/([0-9]+)\s*(?:-\s*([0-9]+)|\+)?\s*(?:years?|yrs?)/i);
    if (generalMatch) {
      if (generalMatch[2]) {
        return `${generalMatch[1]}-${generalMatch[2]} yrs`;
      }
      return `${generalMatch[1]}+ yrs`;
    }
  }

  const title = (m.job_title || m.job?.title || '').toLowerCase();
  if (title.includes('lead') || title.includes('principal') || title.includes('staff') || title.includes('director')) {
    return '7+ yrs';
  }
  if (title.includes('senior') || title.includes('sr.') || title.includes('architect')) {
    return '5-8 yrs';
  }
  if (title.includes('junior') || title.includes('jr.') || title.includes('associate') || title.includes('entry')) {
    return '1-3 yrs';
  }
  if (title.includes('intern') || title.includes('trainee') || title.includes('fresher')) {
    return '0-1 yr';
  }

  return '2-5 yrs';
};


export const MatchesGrid: React.FC<Props> = ({
  loading,
  allMatches,
  filteredAndSortedMatches,
  isEvaluatingAll,
  applyingJobId,
  handleEvaluateAll,
  handleApplySingle,
  record,
  selectedJobIds,
  onToggleSelect,
  setDecisionFilter,
  setMinScoreFilter,
  setSearchQuery,
}) => {
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset to first page when filtering or sorting changes
  useEffect(() => {
    setPage(1);
  }, [filteredAndSortedMatches.length, setDecisionFilter, setMinScoreFilter, setSearchQuery]);

  const toggleSave = (id: string) => {
    setSavedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalItems = filteredAndSortedMatches.length;
  const startIndex = (page - 1) * pageSize;
  const paginatedMatches = filteredAndSortedMatches.slice(startIndex, startIndex + pageSize);

  return (
    <>
      {/* Matches Grid or Empty State */}
      {loading ? (
        <div className="space-y-4" role="status" aria-label="Loading your matches">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
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
              <Button variant="primary" size="sm" onClick={handleEvaluateAll} disabled={isEvaluatingAll}>
                <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                <span>Score my jobs</span>
              </Button>
            ) : (
              <button
                type="button"
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
        <div className="flex flex-col space-y-4">
          {paginatedMatches.map((m) => {
            const score = Math.round(getMatchScore(m));
            const matchedSkills = m.matched_skills || [];
            const isSaved = savedJobIds.has(m.job_id);

            // Experience range
            const expText = formatExperienceRange(m);

            // Clean concise posted text
            const cleanPosted = (m.raw_posted_text || '1d ago').replace(/Within the past 24 hours/gi, '').trim() || '1d ago';

            // Match tier labels
            const verdictText =
              score >= 80 ? 'Top Match' : score >= 65 ? 'Strong Fit' : score >= 50 ? 'Good Match' : 'Needs Review';

            return (
              <div
                key={m.id}
                className="group relative w-full max-w-full rounded-2xl md:rounded-3xl border border-slate-200/90 bg-white shadow-xs hover:shadow-lg hover:border-indigo-400/80 transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/95 dark:hover:border-indigo-500/50 flex flex-col md:flex-row overflow-hidden"
              >
                {/* Left Main Workspace Area (Clean, spacious, min-w-0 for bulletproof flex sizing) */}
                <div className="flex-1 min-w-0 p-5 sm:p-6 flex flex-col justify-between space-y-4">
                  {/* Top Row: Checkbox + Avatar + Badges + Save for later */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      {/* Batch Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedJobIds.has(m.job_id)}
                        onChange={() => onToggleSelect(m.job_id)}
                        aria-label={`Select ${m.job_title || 'position'} at ${m.company || 'company'}`}
                        className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />

                      {/* Company Monogram Avatar */}
                      <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border border-slate-200/80 dark:border-slate-700/80 text-indigo-700 dark:text-indigo-300 font-extrabold text-sm flex items-center justify-center shadow-inner select-none">
                        {getInitials(m.company)}
                      </div>

                      {/* Title & Metadata */}
                      <div className="min-w-0 flex-1">
                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-2.5 py-0.5 rounded-full truncate max-w-[200px]">
                            {cleanPosted}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-200/60 dark:border-blue-800/60 shrink-0">
                            <Zap className="w-2.5 h-2.5 text-blue-600 fill-blue-500" />
                            <span>Be an early applicant</span>
                          </span>
                        </div>

                        {/* Job Title Clickable with strict truncation */}
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate pt-0.5 tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          <button
                            type="button"
                            onClick={() => record.open(m.job_id)}
                            className="block max-w-full truncate text-left cursor-pointer hover:underline"
                            aria-label={`Open details for ${m.job_title || 'position'}`}
                          >
                            {m.job_title || 'Discovered Position'}
                          </button>
                        </h2>

                        {/* Company Name */}
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                          {m.company || 'Direct Employer'}
                        </p>
                      </div>
                    </div>

                    {/* Save for later Pill Button */}
                    <button
                      type="button"
                      onClick={() => toggleSave(m.job_id)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shadow-xs cursor-pointer ${
                        isSaved
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                      title={isSaved ? 'Job saved' : 'Save for later'}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-indigo-600 text-indigo-600' : 'text-slate-400'}`} />
                      <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save for later'}</span>
                    </button>
                  </div>

                  {/* Middle Row: Essential Metadata Attributes (Location, Level, Experience, Skills) */}
                  <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-slate-600 dark:text-slate-400 font-medium pt-1">
                    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-[220px]">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{m.location || 'Remote / Hybrid'}</span>
                    </span>

                    <span className="inline-flex items-center gap-1.5 shrink-0">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{expText}</span>
                    </span>

                    <span className="inline-flex items-center gap-1.5 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Hard Filters: Pass</span>
                    </span>

                    {/* Top 3 matched skills chips */}
                    {matchedSkills.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 shrink-0"
                      >
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>{s}</span>
                      </span>
                    ))}
                  </div>

                  {/* Bottom Action Row */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => record.open(m.job_id)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 transition cursor-pointer shrink-0"
                    >
                      <span>View details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {m.apply_url && (
                        <a
                          href={m.apply_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3.5 py-2 rounded-xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-xs shrink-0"
                          title="Open job link on original employer site"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span className="hidden sm:inline">Job Link</span>
                        </a>
                      )}

                      {/* Super Apply / Queue to apply */}
                      <button
                        type="button"
                        onClick={() => handleApplySingle(m.job_id)}
                        disabled={applyingJobId === m.job_id}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                        <span>{applyingJobId === m.job_id ? 'Queuing…' : 'Super Apply'}</span>
                      </button>

                      {/* Optimize and Apply Primary CTA */}
                      <TailorButton
                        jobId={m.job_id}
                        jobTitle={m.job_title || m.job?.title || 'this job'}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 shrink-0"
                        savedClassName="px-3.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-900 border border-violet-200 hover:border-violet-300 dark:bg-violet-950/60 dark:hover:bg-violet-900/80 dark:text-violet-100 dark:border-violet-700/80 font-bold text-xs shadow-xs shrink-0"
                        label="Optimize & Apply →"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Dedicated Dark HUD Panel (Never pushed off screen) */}
                <MatchRelevanceHud
                  score={score}
                  verdictText={verdictText}
                  matchedSkillsCount={matchedSkills.length}
                  totalSkillsCount={matchedSkills.length + (m.missing_skills?.length || 0)}
                  experienceText={expText}
                  skillScore={m.skill_match_score}
                  experienceScore={m.experience_score}
                />
              </div>
            );
          })}

          {/* Executive Modern Pagination Bar */}
          {totalItems > 0 && (
            <MatchesPagination
              page={page}
              pageSize={pageSize}
              total={totalItems}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
            />
          )}
        </div>
      )}
    </>
  );
};

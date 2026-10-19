import React from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileText, Award } from 'lucide-react';
import type { ResumePerformanceMetric } from '../../types';

interface Props {
  resumes: ResumePerformanceMetric[];
  highestInterviewResume: ResumePerformanceMetric | null;
}

export const ResumesSection: React.FC<Props> = ({ resumes, highestInterviewResume }) => (
  <>
    {/* Section 4A: Resume Performance Comparison (Strict Observational Terminology) */}
    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Resume Performance Comparison</span>
          </h2>
          <p className="text-xs text-slate-500">
            Observational interview callback rates with sample sizes (non-experimental).
          </p>
        </div>
        {highestInterviewResume && (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 flex items-center gap-1">
            <Award className="w-3 h-3 text-amber-500" />
            <span>Highest Observed Interview Rate</span>
          </span>
        )}
      </div>

      <div className="space-y-3 pt-1">
        {resumes.length === 0 ? (
          <EmptyState>
            Upload role-specific resumes in the Profile tab to observe comparative interview conversion rates.
          </EmptyState>
        ) : (
          resumes.map((r) => (
            <div
              key={r.resume_id}
              className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">{r.label}</h4>
                  {highestInterviewResume?.resume_id === r.resume_id && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Best Observed Outcome
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Target Role: <strong>{r.target_role}</strong> • Sample Size:{' '}
                  <strong>{r.applications_count} submissions</strong>
                </p>
                <div className="text-[11px] text-slate-500 flex items-center gap-3 pt-0.5">
                  <span>{r.response_count ?? 0} responses</span>
                  <span>•</span>
                  <span>{r.interview_count} interviews</span>
                  <span>•</span>
                  <span>{r.offer_count} offers</span>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0 space-y-0.5">
                <div className="text-xs font-bold font-mono text-purple-600 dark:text-purple-400">
                  {(r.interview_rate_pct ?? r.conversion_rate_pct).toFixed(1)}% Interview Rate
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {(r.response_rate_pct ?? 0).toFixed(1)}% Response • {(r.offer_rate_pct ?? 0).toFixed(1)}% Offer
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </>
);

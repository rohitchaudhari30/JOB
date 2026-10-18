import React from 'react';
import { ShieldCheck, CheckCircle2, FileText } from 'lucide-react';
import type { CandidateProfile, Resume } from '../../types';

interface Props {
  profile: CandidateProfile | null;
  resumes: Resume[];
  selectedResumeId: string;
  connectedSourcesCount: number;
}

export const PreflightBar: React.FC<Props> = ({ profile, resumes, selectedResumeId, connectedSourcesCount }) => (
  <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Candidate Profile</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {profile ? '✓ Ready (Saved Once)' : '⚠ Setup Needed'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Resume</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
              {resumes.find((r) => r.id === selectedResumeId)?.file_name || 'Default Resume'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Platforms &amp; ATS</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {connectedSourcesCount > 0 ? `${connectedSourcesCount} Connected + 4 ATS Ready` : '4 Direct ATS Active'}
            </div>
          </div>
        </div>
      </div>
  </>
);

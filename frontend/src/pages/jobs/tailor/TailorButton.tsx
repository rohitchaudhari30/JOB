import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { TailorResumeDialog } from './TailorResumeDialog';
import { useHasSavedTailored } from './savedTailoredStore';

interface Props {
  jobId: string;
  jobTitle: string;
  className?: string;
}

/** Visible entry point for resume tailoring on job and match cards. */
export const TailorButton: React.FC<Props> = ({ jobId, jobTitle, className = '' }) => {
  const [open, setOpen] = useState(false);
  const saved = useHasSavedTailored(jobId);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`px-2.5 py-1 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:hover:bg-violet-900/80 dark:text-violet-200 text-xs font-bold border border-violet-200 dark:border-violet-800 flex items-center space-x-1 cursor-pointer transition-all active:scale-95 ${className}`}
        title={saved ? 'A tailored resume is saved for this job. Open to review, download or replace it.' : 'Create a resume tailored to this job'}
      >
        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{saved ? 'Tailored ✓' : 'Tailor resume'}</span>
      </button>
      {open && <TailorResumeDialog open jobId={jobId} jobTitle={jobTitle} onClose={() => setOpen(false)} />}
    </>
  );
};

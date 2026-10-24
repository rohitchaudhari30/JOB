import React, { useState } from 'react';
import { FileText, Sparkles } from 'lucide-react';
import { TailorResumeDialog } from './TailorResumeDialog';
import { useHasSavedTailored } from './savedTailoredStore';

interface Props {
  jobId: string;
  jobTitle: string;
  applyUrl?: string;
  className?: string;
  savedClassName?: string;
  label?: string;
}

/** Visible entry point for resume tailoring on job and match cards. */
export const TailorButton: React.FC<Props> = ({
  jobId,
  jobTitle,
  applyUrl,
  className = '',
  savedClassName = '',
  label,
}) => {
  const [open, setOpen] = useState(false);
  const saved = useHasSavedTailored(jobId);

  // Mandatory flex layout classes to guarantee horizontal alignment of icon + text
  const baseLayoutClasses =
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-all active:scale-95 shrink-0 text-xs font-bold';

  // Accessible, high-contrast styling when an optimized resume is already saved
  const defaultSavedColors =
    'px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-900 border border-violet-200 hover:border-violet-300 dark:bg-violet-950/60 dark:hover:bg-violet-900/80 dark:text-violet-100 dark:border-violet-700/80 shadow-xs';

  // Standard action styling when no optimized resume is saved yet
  const defaultUnsavedColors =
    'px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:hover:bg-violet-900/80 dark:text-violet-200 border border-violet-200 dark:border-violet-800 shadow-2xs';

  // When saved, prioritize savedClassName or defaultSavedColors to prevent color clashing
  const colorAndSpacingClasses = saved
    ? (savedClassName || defaultSavedColors)
    : (className || defaultUnsavedColors);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${baseLayoutClasses} ${colorAndSpacingClasses}`}
        title={
          saved
            ? 'An optimized resume is saved for this job. Open to review, download or replace it.'
            : 'Optimize a resume for this job'
        }
      >
        {saved ? (
          <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0 inline-block" aria-hidden="true" />
        ) : (className.includes('bg-blue-') || className.includes('bg-indigo-')) ? (
          <Sparkles className="w-3.5 h-3.5 text-blue-100 shrink-0 inline-block" aria-hidden="true" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0 inline-block" aria-hidden="true" />
        )}
        <span className="inline-block">
          {saved ? (
            <>
              Optimized <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">✓</span>
            </>
          ) : (
            label || 'Optimize resume'
          )}
        </span>
      </button>
      {open && (
        <TailorResumeDialog
          open
          jobId={jobId}
          jobTitle={jobTitle}
          applyUrl={applyUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

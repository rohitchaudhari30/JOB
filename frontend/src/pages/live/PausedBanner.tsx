import React from 'react';
import { PauseCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface Props {
  onEnterCode: () => void;
}

/** Shown while a run is paused, so the person sees right away that the run is waiting on them. */
export const PausedBanner: React.FC<Props> = ({ onEnterCode }) => (
  <div
    role="status"
    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/30"
  >
    <div className="flex min-w-0 items-start gap-3">
      <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900 dark:text-white">This run is paused</p>
        <p className="text-xs text-slate-700 dark:text-slate-300">
          If the site asked for a one-time code or a CAPTCHA, enter it to continue. Otherwise use Resume run.
        </p>
      </div>
    </div>
    <Button variant="secondary" size="sm" onClick={onEnterCode}>
      Enter code
    </Button>
  </div>
);

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export type ReadinessGap = 'connection' | 'resume' | 'profile';

interface ReadinessBannerProps {
  /** Which prerequisites are missing; renders nothing when empty. */
  missing: ReadinessGap[];
  /** Human platform name used in copy, e.g. "LinkedIn". */
  platformLabel?: string;
  onNavigate: (tab: 'connections' | 'profile') => void;
}

const COPY: Record<ReadinessGap, { text: (p: string) => string; action: (p: string) => string; target: 'connections' | 'profile' }> = {
  connection: {
    text: (p) => `${p} session is disconnected. Connect it so applications can be submitted.`,
    action: (p) => `Connect ${p}`,
    target: 'connections',
  },
  resume: {
    text: () => 'No resume uploaded. Upload one in Settings › Profile so it can be attached to applications.',
    action: () => 'Upload resume',
    target: 'profile',
  },
  profile: {
    text: () => 'Your profile is incomplete. Matching and form answers depend on it.',
    action: () => 'Complete profile',
    target: 'profile',
  },
};

/**
 * Single implementation of the "finish setup" prompt that used to be repeated
 * on several pages (UX redesign §7: readiness prompts).
 */
export const ReadinessBanner: React.FC<ReadinessBannerProps> = ({ missing, platformLabel = 'Platform', onNavigate }) => {
  if (missing.length === 0) return null;
  return (
    <div
      role="status"
      className="p-4 rounded-xl bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/50 flex flex-wrap items-start justify-between gap-3"
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Finish setup to apply</h4>
          <ul className="text-xs text-slate-700 dark:text-slate-300 mt-1 space-y-0.5">
            {missing.map((gap) => (
              <li key={gap}>{COPY[gap].text(platformLabel)}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {missing.map((gap) => (
          <button
            key={gap}
            type="button"
            onClick={() => onNavigate(COPY[gap].target)}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            {COPY[gap].action(platformLabel)}
          </button>
        ))}
      </div>
    </div>
  );
};

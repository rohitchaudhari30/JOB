import React from 'react';

interface EmptyStateProps {
  children: React.ReactNode;
  className?: string;
}

/** The dashed "nothing here yet" panel used across pages. */
export const EmptyState: React.FC<EmptyStateProps> = ({ children, className = '' }) => (
  <div
    role="status"
    className={`p-6 text-center text-xs text-slate-400 dark:text-slate-500 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800 ${className}`}
  >
    {children}
  </div>
);

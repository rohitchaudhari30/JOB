import React from 'react';

interface PageHeaderProps {
  title: string;
  /** One line: what this page is for. */
  description?: React.ReactNode;
  /** At most one primary action. */
  primaryAction?: React.ReactNode;
  /** Secondary actions (ghost/secondary buttons, an OverflowMenu). */
  actions?: React.ReactNode;
}

/** Shared page header so every page puts its title and main action in the same place. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, primaryAction, actions }) => (
  <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{description}</p>}
    </div>
    {(actions || primaryAction) && (
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {actions}
        {primaryAction}
      </div>
    )}
  </header>
);

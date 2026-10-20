import React from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { IconButton } from '../../components/ui/IconButton';

interface Props {
  clientTz: string;
  loadData: (isRefresh?: boolean) => void;
  loading: boolean;
  refreshing: boolean;
  onNavigate?: (tab: any) => void;
}

/** Home header: title and refresh only. The single primary action ("Start campaign" / "Open live run") sits in the status card below. */
export const DashboardHeader: React.FC<Props> = ({ clientTz, loadData, loading, refreshing }) => (
  <PageHeader
    title="Home"
    description="What needs your attention today, and how your job search is moving."
    actions={
      <>
        <span className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 lg:inline-flex">
          <Clock className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
          Daily limits reset in: <strong className="font-semibold">{clientTz}</strong>
        </span>
        <IconButton
          label="Refresh home"
          onClick={() => loadData(true)}
          disabled={refreshing || loading}
          className="border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} aria-hidden="true" />
        </IconButton>
      </>
    }
  />
);

import React from 'react';
import { PageHeader } from '../../components/ui/PageHeader';

interface Props {
  clientTz?: string;
  loadData?: (isRefresh?: boolean) => void;
  loading?: boolean;
  refreshing?: boolean;
  onNavigate?: (tab: any) => void;
}

/**
 * Home header: clean title and layout.
 * Background polling and active run states update automatically without manual triggers.
 */
export const DashboardHeader: React.FC<Props> = () => (
  <PageHeader
    title="Home"
  />
);

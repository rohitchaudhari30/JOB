import React, { useEffect, useState, useCallback } from 'react';

import { api } from '../services/api';
import {
  DashboardOverview,
  AutomationRunStatus,
  Application,
} from '../types';
import { useToast } from '../context/ToastContext';
import { usePolling } from '../hooks/usePolling';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { ActionRequiredSection } from './dashboard/ActionRequiredSection';
import { OperationalCommandCard } from './dashboard/OperationalCommandCard';
import { OperationalPulse } from './dashboard/OperationalPulse';
import { TopMatchesCard } from './dashboard/TopMatchesCard';
import { RecentActivityCard } from './dashboard/RecentActivityCard';

interface DashboardProps {
  onNavigate: (tab: any) => void;
  activeRun: AutomationRunStatus | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, activeRun: propActiveRun }) => {
  const { showError } = useToast();

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [recentApplications, setRecentApplications] = useState<Application[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [overviewData, appsData, connectionsData] = await Promise.all([
        api.getDashboardOverview(clientTz),
        api.listApplications().catch(() => []),
        api.listConnections().catch(() => []),
      ]);
      setConnections(connectionsData);

      setOverview(overviewData);
      setRecentApplications(appsData.slice(0, 5));
    } catch (e: any) {
      console.error('Failed to load dashboard overview:', e);
      if (isRefresh) {
        showError('Failed to refresh dashboard data.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientTz, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Operational status refresh every 15 s, paused while the tab is hidden.
  usePolling(() => void loadData(true), 15000);

  const effectiveRunning =
    overview?.active_run.is_running || propActiveRun?.status === 'RUNNING';
  const effectiveStatus = overview?.active_run.status || propActiveRun?.status || 'IDLE';

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <DashboardHeader clientTz={clientTz} loadData={loadData} loading={loading} refreshing={refreshing} onNavigate={onNavigate} />
      <ActionRequiredSection overview={overview} connections={connections} onNavigate={onNavigate} />
      <OperationalCommandCard overview={overview} effectiveRunning={effectiveRunning} effectiveStatus={effectiveStatus} onNavigate={onNavigate} />
      <OperationalPulse overview={overview} connections={connections} onNavigate={onNavigate} />
      <TopMatchesCard overview={overview} onNavigate={onNavigate} />
      <RecentActivityCard recentApplications={recentApplications} onNavigate={onNavigate} />
    </div>
  );
};

import React, { useEffect, useState, useCallback, useMemo } from 'react';

import { api } from '../services/api';
import {
  DashboardOverview,
  AutomationRunStatus,
  Application,
  ApplicationStats,
} from '../types';
import { useToast } from '../context/ToastContext';
import { usePolling } from '../hooks/usePolling';
import { ReadinessBanner, ReadinessGap } from '../components/ReadinessBanner';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { ActionRequiredSection } from './dashboard/ActionRequiredSection';
import { OperationalCommandCard } from './dashboard/OperationalCommandCard';
import { OperationalPulse } from './dashboard/OperationalPulse';
import { TopMatchesCard } from './dashboard/TopMatchesCard';
import { RecentActivityCard } from './dashboard/RecentActivityCard';
import { TopProgressBar, MetricCardSkeleton, CardSkeleton, Skeleton } from '../components/ui/Skeleton';

interface DashboardProps {
  onNavigate: (tab: any) => void;
  activeRun: AutomationRunStatus | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, activeRun: propActiveRun }) => {
  const { showError } = useToast();

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [recentApplications, setRecentApplications] = useState<Application[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [appStats, setAppStats] = useState<ApplicationStats | null>(null);
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
      const [overviewData, appsData, connectionsData, statsData] = await Promise.all([
        api.getDashboardOverview(clientTz),
        api.listApplications().catch(() => []),
        api.listConnections().catch(() => []),
        api.getApplicationStats ? api.getApplicationStats().catch(() => null) : Promise.resolve(null),
      ]);
      setConnections(connectionsData);
      setOverview(overviewData);
      setRecentApplications(appsData.slice(0, 5));
      setAppStats(statsData);
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

  const missingGaps: ReadinessGap[] = useMemo(() => {
    if (!overview?.readiness) return [];
    const gaps: ReadinessGap[] = [];
    for (const item of overview.readiness) {
      if (!item.is_ready) {
        const k = (item.key + ' ' + item.title).toLowerCase();
        if (k.includes('profile') && !gaps.includes('profile')) gaps.push('profile');
        if (k.includes('resume') && !gaps.includes('resume')) gaps.push('resume');
        if ((k.includes('connection') || k.includes('platform')) && !gaps.includes('connection')) gaps.push('connection');
      }
    }
    return gaps;
  }, [overview?.readiness]);

  return (
    <div className="space-y-5 animate-fadeIn pb-12 relative">
      <TopProgressBar active={refreshing} className="rounded-full" />
      <DashboardHeader clientTz={clientTz} loadData={loadData} loading={loading} refreshing={refreshing} onNavigate={onNavigate} />
      <ReadinessBanner missing={missingGaps} onNavigate={onNavigate} />
      {loading && !overview ? (
        <div className="space-y-5" role="status" aria-label="Loading dashboard overview">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-6 w-48 rounded-lg" />
            </div>
            <Skeleton className="h-4 w-72 rounded" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
          <div className="space-y-3 pt-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      ) : (
        <>
          <OperationalCommandCard overview={overview} effectiveRunning={effectiveRunning} effectiveStatus={effectiveStatus} onNavigate={onNavigate} />
          <OperationalPulse overview={overview} connections={connections} appStats={appStats} onNavigate={onNavigate} />
          <ActionRequiredSection overview={overview} connections={connections} onNavigate={onNavigate} />
          <TopMatchesCard overview={overview} onNavigate={onNavigate} />
          <RecentActivityCard recentApplications={recentApplications} onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
};

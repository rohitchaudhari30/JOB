import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpDown,
  Table as TableIcon,
  RefreshCw,
  X,
  Building2,
  Zap,
  Briefcase,
} from 'lucide-react';
import { api } from '../services/api';
import { Application, ApplicationStats } from '../types';
import { useToast } from '../context/ToastContext';
import { Pagination } from '../components/ui/Pagination';
import { ScreenshotModal } from './applications/ScreenshotModal';
import { RationaleModal } from './applications/RationaleModal';
import { ReconciliationModal } from './applications/ReconciliationModal';
import { ApplicationRow } from './applications/ApplicationRow';
import { ApplicationKpis } from './applications/ApplicationKpis';
import { ApplicationDrawer, ApplicationDrawerView } from './applications/ApplicationDrawer';
import { useQueryParam } from '../hooks/useQueryParam';
import { getMatchScore } from '../utils/matchScores';
import {
  computeStats,
  filterAndSortApplications,
  getDerivedStatus,
  formatExperience,
} from './applications/applicationLogic';

import { isUuidString, resolvePlatformName } from '../utils/applicationHelpers';


interface ApplicationCRMProps {
  onNavigate?: (tab: any) => void;
}

export const ApplicationCRM: React.FC<ApplicationCRMProps> = ({ onNavigate }) => {
  const { showSuccess, showError } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [matchScores, setMatchScores] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  // Filters live in the URL (?status=&q=) so views survive reload/back/share.
  const [selectedFilter, setSelectedFilter] = useQueryParam('status', 'All');
  const [searchQuery, setSearchQuery] = useQueryParam('q', '');
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);

  // Secondary Filter Bar Inputs (Image 1)
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [minMatchFilter, setMinMatchFilter] = useState<number>(0);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<'date' | 'match' | 'status'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Server Stats & Configurable Pagination
  const [backendStats, setBackendStats] = useState<ApplicationStats | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null);
  const [selectedScreenshotApp, setSelectedScreenshotApp] = useState<{ id: string; path: string } | null>(null);
  const [screenshotImageUrl, setScreenshotImageUrl] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState<boolean>(false);
  // Deep link: /applications/:id opens the detail drawer.
  const idFromPath = () => {
    const m = window.location.pathname.match(/^\/applications\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };
  const [drawerAppId, setDrawerAppId] = useState<string | null>(idFromPath);
  useEffect(() => {
    const onPop = () => setDrawerAppId(idFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const openDrawer = (id: string) => {
    window.history.pushState({ tab: 'crm' }, '', `/applications/${encodeURIComponent(id)}`);
    setDrawerAppId(id);
  };
  const closeDrawer = () => {
    if (window.location.pathname.startsWith('/applications/')) {
      window.history.pushState({ tab: 'crm' }, '', '/applications');
    }
    setDrawerAppId(null);
  };
  const [selectedAppForRationale, setSelectedAppForRationale] = useState<Application | null>(null);
  const [selectedAppForReconciliation, setSelectedAppForReconciliation] = useState<Application | null>(null);
  const [reconcileNotes, setReconcileNotes] = useState<string>('');
  const [isReconciling, setIsReconciling] = useState<boolean>(false);

  const openScreenshotPreview = async (appId: string, path: string) => {
    setSelectedScreenshotApp({ id: appId, path });
    setScreenshotLoading(true);
    try {
      const blob = await api.getApplicationScreenshot(appId);
      const url = URL.createObjectURL(blob);
      setScreenshotImageUrl(url);
    } catch (err) {
      console.error('Failed to load screenshot image:', err);
      setScreenshotImageUrl(null);
    } finally {
      setScreenshotLoading(false);
    }
  };

  const closeScreenshotPreview = () => {
    if (screenshotImageUrl) {
      URL.revokeObjectURL(screenshotImageUrl);
    }
    setSelectedScreenshotApp(null);
    setScreenshotImageUrl(null);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [appsData, matchesData, statsData] = await Promise.all([
        api.listApplications(),
        api.listMatches().catch(() => []),
        api.getApplicationStats().catch(() => null),
      ]);

      setApplications(appsData);
      setBackendStats(statsData);

      const scoreMap = new Map<string, number>();
      matchesData.forEach((m) => {
        if (m.job_id) {
          scoreMap.set(m.job_id, Math.round(getMatchScore(m)));
        }
      });
      setMatchScores(scoreMap);
    } catch (e) {
      console.error('Failed to load applications CRM:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (appId: string) => {
    try {
      await api.approveApplication(appId, true);
      showSuccess('Application approved and execution started!');
      loadData();
    } catch (e: any) {
      showError(`Approval failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  const handleReject = async (appId: string) => {
    try {
      await api.stopApplication(appId, 'Dismissed by candidate from Review Queue');
      showSuccess('Application dismissed from review queue.');
      loadData();
    } catch (e: any) {
      showError(`Dismiss failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  const handleReconcileAction = async (
    action: 'CONFIRM_SUBMITTED' | 'MARK_NOT_SUBMITTED_AND_RETRY' | 'DISMISS'
  ) => {
    if (!selectedAppForReconciliation) return;
    try {
      setIsReconciling(true);
      await api.reconcileApplication(selectedAppForReconciliation.id, action, reconcileNotes || undefined);
      if (action === 'CONFIRM_SUBMITTED') {
        showSuccess('Application confirmed as submitted and marked APPLIED!');
      } else if (action === 'MARK_NOT_SUBMITTED_AND_RETRY') {
        showSuccess('Verified not submitted. Re-execution queued through canonical orchestrator!');
      } else {
        showSuccess('Application marked as dismissed.');
      }
      setSelectedAppForReconciliation(null);
      setReconcileNotes('');
      loadData();
    } catch (e: any) {
      showError(`Reconciliation failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleRetry = async (app: Application) => {
    // Critical safety: Do not allow blind immediate retry for uncertain submissions
    if (app.workflow_state === 'RECONCILIATION_REQUIRED' || app.workflow_state === 'SUBMISSION_UNKNOWN') {
      setSelectedAppForReconciliation(app);
      return;
    }
    try {
      if (app.workflow_state?.startsWith('PAUSED_')) {
        await api.resumeApplication(app.id);
        showSuccess('Application resumed from pause point!');
      } else {
        await api.retryApplication(app.id);
        showSuccess('Application retry queued with exponential backoff!');
      }
      loadData();
    } catch (e: any) {
      showError(`Retry rejected: ${e.response?.data?.detail || e.message}`);
    }
  };

  // Dynamic CRM Metrics & KPIs
  const stats = useMemo(() => computeStats(applications, matchScores, backendStats), [applications, matchScores, backendStats]);

  const filterChips: { id: string; label: string; count: number; dotColor?: string }[] = useMemo(
    () => [
      { id: 'All', label: 'All', count: stats.total },
      { id: 'Review Queue', label: 'Review Queue', count: stats.reviewQueueCount, dotColor: 'bg-indigo-500' },
      { id: 'Needs Attention', label: 'Needs Attention', count: stats.needsAttentionCount, dotColor: 'bg-orange-500' },
      { id: 'Needs Verification', label: 'Needs Verification', count: stats.needsVerificationCount, dotColor: 'bg-amber-500' },
      { id: 'Applied', label: 'Applied', count: stats.appliedCount, dotColor: 'bg-emerald-500' },
      { id: 'Skipped', label: 'Skipped', count: stats.skippedCount, dotColor: 'bg-amber-500' },
      { id: 'Failed', label: 'Failed', count: stats.failedCount, dotColor: 'bg-rose-500' },
      { id: 'Company site', label: 'Company site', count: stats.companySiteCount, dotColor: 'bg-blue-500' },
      { id: 'Already applied', label: 'Already applied', count: stats.alreadyAppliedCount, dotColor: 'bg-sky-500' },
      { id: 'Pending', label: 'Pending', count: stats.pendingCount, dotColor: 'bg-slate-400' },
    ],
    [stats]
  );

  const filteredApplications = useMemo(
    () =>
      filterAndSortApplications(applications, matchScores, {
        selectedFilter, searchQuery, companyFilter, minMatchFilter, fromDate, toDate, sortColumn, sortDirection,
      }),
    [applications, matchScores, selectedFilter, searchQuery, companyFilter, minMatchFilter, fromDate, toDate, sortColumn, sortDirection]
  );


  // Reset to first page when filtering, sorting, or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedFilter,
    searchQuery,
    companyFilter,
    minMatchFilter,
    fromDate,
    toDate,
    sortColumn,
    sortDirection,
    pageSize,
  ]);

  const paginatedApplications = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredApplications.slice(start, start + pageSize);
  }, [filteredApplications, currentPage, pageSize]);

  const hasActiveSecondaryFilters = companyFilter || minMatchFilter > 0 || fromDate || toDate;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Top Header & Scout Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Application CRM
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Every job the automation reached, and what happened to it.
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-2.5 self-end sm:self-center">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/60 text-xs font-bold text-indigo-700 dark:text-indigo-300">
            <span>Tracked:</span>
            <span>{stats.total}</span>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
            title="Refresh pipeline"
          
 aria-label="Refresh pipeline"
>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <ApplicationKpis
        stats={stats}
        selectedFilter={selectedFilter}
        setSelectedFilter={setSelectedFilter}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        setSortColumn={setSortColumn}
        setSortDirection={setSortDirection}
      />

      {/* Main Table / Pipeline Card Container */}
      <div className="rounded-2xl bg-white border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Industry-Standard Top Bar: Search + Filter Chips + Filters Button */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Search input */}
          <div className="relative flex items-center min-w-[260px] max-w-sm flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title or company"
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button aria-label="Close"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Middle: Horizontal Filter Chips with live counts */}
          <div className="flex items-center flex-wrap gap-1.5 overflow-x-auto py-1">
            {filterChips.map((chip) => {
              const isActive = selectedFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setSelectedFilter(chip.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 border border-slate-300 dark:bg-slate-800 dark:text-white dark:border-slate-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  {chip.dotColor && <span className={`w-2 h-2 rounded-full ${chip.dotColor} shrink-0`} />}
                  <span>{chip.label}</span>
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Filters Toggle Button */}
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showFilterPanel || hasActiveSecondaryFilters
                ? 'border-indigo-300 bg-indigo-50/60 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {hasActiveSecondaryFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
            )}
          </button>
        </div>

        {/* Secondary Filter Bar matching Image 1 */}
        {showFilterPanel && (
          <div className="px-3.5 pb-3.5 pt-2 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 animate-fadeIn">
            {/* 1. Company Input with Building icon */}
            <div className="relative flex items-center min-w-[180px] max-w-[220px] flex-1 sm:flex-initial">
              <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                placeholder="Company"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {companyFilter && (
                <button aria-label="Close"
                  onClick={() => setCompanyFilter('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 2. Min match % Input with Zap icon */}
            <div className="relative flex items-center min-w-[140px] max-w-[170px] flex-1 sm:flex-initial">
              <Zap className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="number"
                min="0"
                max="100"
                value={minMatchFilter || ''}
                onChange={(e) => setMinMatchFilter(e.target.value ? Number(e.target.value) : 0)}
                placeholder="Min match %"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* 3. From Date with Calendar picker */}
            <div className="relative flex items-center px-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white min-w-[190px] max-w-[220px] flex-1 sm:flex-initial">
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mr-2 select-none shrink-0">
                From
              </span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full text-xs bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              />
            </div>

            {/* 4. To Date with Calendar picker */}
            <div className="relative flex items-center px-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white min-w-[190px] max-w-[220px] flex-1 sm:flex-initial">
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mr-2 select-none shrink-0">
                To
              </span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full text-xs bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              />
            </div>

            {/* Reset link if any secondary filter is set */}
            {hasActiveSecondaryFilters && (
              <button
                onClick={() => {
                  setCompanyFilter('');
                  setMinMatchFilter(0);
                  setFromDate('');
                  setToDate('');
                }}
                className="text-[11px] font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 underline cursor-pointer ml-auto"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Application Pipeline Table View */}
        {loading ? (
          <div className="text-center py-24 text-slate-400 dark:text-slate-500 text-xs">
              Loading applications pipeline...
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="text-center py-20 px-4 space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <TableIcon className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No applications match filter</p>
              <p className="text-[11px] text-slate-400">
                Try switching the status filter to &quot;All&quot; or clearing your filter criteria.
              </p>
              <button
                onClick={() => {
                  setSelectedFilter('All');
                  setSearchQuery('');
                  setCompanyFilter('');
                  setMinMatchFilter(0);
                  setFromDate('');
                  setToDate('');
                }}
                className="mt-2 inline-flex items-center px-3 py-1.5 text-xs rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 font-medium hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500 select-none">
                    <th className="py-3 px-4 font-semibold">Position</th>
                    <th className="py-3 px-4 font-semibold">Location</th>
                    <th className="py-3 px-4 font-semibold">Exp</th>
                    <th className="py-3 px-4 font-semibold">Salary</th>
                    <th
                      onClick={() => {
                        setSortColumn('status');
                        setSortDirection(sortColumn === 'status' && sortDirection === 'desc' ? 'asc' : 'desc');
                      }}
                      className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none"
                    >
                      <span className="inline-flex items-center space-x-1">
                        <span>Status</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </span>
                    </th>
                    <th
                      onClick={() => {
                        setSortColumn('match');
                        setSortDirection(sortColumn === 'match' && sortDirection === 'desc' ? 'asc' : 'desc');
                      }}
                      className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none"
                    >
                      <span className="inline-flex items-center space-x-1">
                        <span>Match</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </span>
                    </th>
                    <th
                      onClick={() => {
                        setSortColumn('date');
                        setSortDirection(sortColumn === 'date' && sortDirection === 'desc' ? 'asc' : 'desc');
                      }}
                      className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none"
                    >
                      <span className="inline-flex items-center space-x-1">
                        <span>Date</span>
                        <ChevronDown
                          className={`w-3 h-3 text-slate-400 transition-transform ${
                            sortColumn === 'date' && sortDirection === 'asc' ? 'rotate-180' : ''
                          }`}
                        />
                      </span>
                    </th>
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {paginatedApplications.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-14 px-4 text-center">
                        <div className="max-w-sm mx-auto space-y-3">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400 shadow-2xs">
                            <Briefcase className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                              {applications.length === 0 ? 'No Applications Recorded Yet' : 'No Matching Applications Found'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                              {applications.length === 0
                                ? 'The automated engine has not submitted any applications yet. Discover jobs or launch an auto-apply campaign to get started.'
                                : 'No applications match your active filters or search term. Try resetting your filters to see all records.'}
                            </p>
                          </div>
                          <div className="flex items-center justify-center gap-2 pt-1">
                            {applications.length === 0 && onNavigate ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onNavigate('discovery')}
                                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                                >
                                  Discover Jobs
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onNavigate('direct_apply')}
                                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                >
                                  Start Auto-Apply
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedFilter('All');
                                  setSearchQuery('');
                                  setCompanyFilter('');
                                  setMinMatchFilter(0);
                                  setFromDate('');
                                  setToDate('');
                                }}
                                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                              >
                                Reset All Filters
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedApplications.map((app) => (
                      <ApplicationRow
                        key={app.id}
                        app={app}
                        fallbackScore={matchScores.get(app.job_id)}
                        isExpanded={expandedReasonId === app.id}
                        onToggleReason={setExpandedReasonId}
                        onOpen={openDrawer}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onRetry={handleRetry}
                        onRationale={setSelectedAppForRationale}
                        onReconcile={setSelectedAppForReconciliation}
                        onScreenshot={openScreenshotPreview}
                      />
                    ))
                )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={filteredApplications.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              onResetFilters={
                filteredApplications.length !== applications.length
                  ? () => {
                      setSelectedFilter('All');
                      setSearchQuery('');
                      setCompanyFilter('');
                      setMinMatchFilter(0);
                      setFromDate('');
                      setToDate('');
                    }
                  : undefined
              }
            />
          </>
        )}
      </div>

      {(() => {
        const dApp = drawerAppId ? applications.find((a) => a.id === drawerAppId) || null : null;
        if (!dApp) return null;
        const st = getDerivedStatus(dApp);
        const companyRaw = dApp.company || dApp.job?.company;
        const view: ApplicationDrawerView = {
          title: dApp.job_title || dApp.job?.title || 'Role',
          company: companyRaw && !isUuidString(companyRaw) ? companyRaw : 'Company',
          platform: resolvePlatformName(dApp),
          statusLabel: st.label,
          matchScore: dApp.match_score ?? matchScores.get(dApp.job_id),
          applyUrl: dApp.apply_url || dApp.job?.apply_url,
          needsVerification: st.label === 'Needs Verification',
        };
        return (
          <ApplicationDrawer
            app={dApp}
            view={view}
            onClose={closeDrawer}
            onRationale={(a) => {
              closeDrawer();
              setSelectedAppForRationale(a);
            }}
            onScreenshot={(a) => {
              closeDrawer();
              if (a.screenshot_file_path) void openScreenshotPreview(a.id, a.screenshot_file_path);
            }}
            onReconcile={(a) => {
              closeDrawer();
              setSelectedAppForReconciliation(a);
            }}
          />
        );
      })()}

      {selectedScreenshotApp && (
        <ScreenshotModal
          appId={selectedScreenshotApp.id}
          path={selectedScreenshotApp.path}
          imageUrl={screenshotImageUrl}
          loading={screenshotLoading}
          onClose={closeScreenshotPreview}
        />
      )}

      {selectedAppForRationale && (
        <RationaleModal
          app={selectedAppForRationale}
          score={selectedAppForRationale.match_score ?? matchScores.get(selectedAppForRationale.job_id)}
          status={getDerivedStatus(selectedAppForRationale)}
          experienceLabel={formatExperience(selectedAppForRationale)}
          onClose={() => setSelectedAppForRationale(null)}
          onApprove={handleApprove}
          onRetry={handleRetry}
        />
      )}

      {selectedAppForReconciliation && (
        <ReconciliationModal
          app={selectedAppForReconciliation}
          notes={reconcileNotes}
          busy={isReconciling}
          onNotesChange={setReconcileNotes}
          onAction={handleReconcileAction}
          onClose={() => setSelectedAppForReconciliation(null)}
        />
      )}
    </div>
  );
};

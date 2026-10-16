import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ExternalLink,
  Camera,
  Table as TableIcon,
  RefreshCw,
  X,
  AlertCircle,
  AlertTriangle,
  Building2,
  Zap,
  CheckCircle2,
  Sparkles,
  Briefcase,
  RotateCcw,
} from 'lucide-react';
import { api } from '../services/api';
import { Application, ApplicationStats } from '../types';
import { useToast } from '../context/ToastContext';
import { Pagination } from '../components/ui/Pagination';
import { ScreenshotModal } from './applications/ScreenshotModal';
import { RationaleModal } from './applications/RationaleModal';
import { ReconciliationModal } from './applications/ReconciliationModal';
import { ApplicationDrawer, ApplicationDrawerView } from './applications/ApplicationDrawer';
import { useQueryParam } from '../hooks/useQueryParam';

import {
  DerivedStatus,
  isUuidString,
  resolvePlatformName,
  parseSafeDate,
  getDayStartTimestamp,
  getDayEndTimestamp,
} from '../utils/applicationHelpers';


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
          scoreMap.set(m.job_id, Math.round(m.overall_score));
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

  const getDerivedStatus = (app: Application): { label: DerivedStatus; className: string } => {
    const reason = (app.failure_reason || '').toLowerCase();

    if (app.workflow_state === 'APPLIED') {
      return {
        label: 'Applied',
        className:
          'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40',
      };
    }

    if (reason.includes('already applied') || reason.includes('already_applied')) {
      return {
        label: 'Already applied',
        className:
          'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/40',
      };
    }

    if (
      reason.includes('company site') ||
      reason.includes('external') ||
      reason.includes('redirect') ||
      reason.includes('apply on company')
    ) {
      return {
        label: 'Company site',
        className:
          'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40',
      };
    }

    if (
      app.workflow_state === 'RECONCILIATION_REQUIRED' ||
      app.workflow_state === 'SUBMISSION_UNKNOWN' ||
      reason.includes('reconciliation_required') ||
      reason.includes('submission_uncertain')
    ) {
      return {
        label: 'Needs Verification',
        className:
          'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/40',
      };
    }

    if (app.workflow_state === 'FAILED' || app.workflow_state === 'REJECTED') {
      return {
        label: 'Failed',
        className:
          'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40',
      };
    }

    if (app.workflow_state === 'SKIPPED') {
      return {
        label: 'Skipped',
        className:
          'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40',
      };
    }

    return {
      label: 'Pending',
      className:
        'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };
  };

  const formatExperience = (app: Application): string => {
    const min = app.min_experience_years ?? app.job?.min_experience_years;
    const max = app.max_experience_years ?? app.job?.max_experience_years;
    if (min !== undefined && max !== undefined && (min > 0 || max > 0)) {
      return `${Math.round(min)}-${Math.round(max)} Yrs`;
    }
    if (min !== undefined && min > 0) return `${Math.round(min)}+ Yrs`;
    if (max !== undefined && max > 0) return `0-${Math.round(max)} Yrs`;
    return '-';
  };

  const formatSalary = (app: Application): string => {
    const min = app.min_salary ?? app.job?.min_salary;
    const max = app.max_salary ?? app.job?.max_salary;
    if (!min && !max) return '-';

    const toLakhs = (val: number) => {
      if (val >= 100000) return `${Math.round(val / 100000)}L`;
      if (val >= 1000) return `${Math.round(val / 1000)}k`;
      return `${val}`;
    };

    if (min && max) return `${toLakhs(min)} - ${toLakhs(max)}`;
    if (min) return `${toLakhs(min)}+`;
    if (max) return `Up to ${toLakhs(max)}`;
    return '-';
  };

  const formatDateDisplay = (dateString?: string | null) => {
    if (!dateString) return { main: '-', rel: '' };
    const d = parseSafeDate(dateString);
    if (!d) return { main: '-', rel: '' };

    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'short' });
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const main = `${day} ${month} · ${hours}:${minutes}`;

    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    let rel = '';
    if (diffSec < 60) {
      rel = 'just now';
    } else if (diffSec < 3600) {
      rel = `${Math.floor(diffSec / 60)}m ago`;
    } else if (diffSec < 86400) {
      rel = `${Math.floor(diffSec / 3600)}h ago`;
    } else {
      rel = `${Math.floor(diffSec / 86400)}d ago`;
    }

    return { main, rel };
  };

  // Dynamic CRM Metrics & KPIs
  const stats = useMemo(() => {
    let localAppliedCount = 0;
    let localAppliedTodayCount = 0;
    let localSkippedCount = 0;
    let localFailedCount = 0;
    let localCompanySiteCount = 0;
    let localAlreadyAppliedCount = 0;
    let localNeedsVerificationCount = 0;
    let localPendingCount = 0;
    let localReviewQueueCount = 0;
    let localNeedsAttentionCount = 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamp = todayStart.getTime();

    const validScores: number[] = [];

    applications.forEach((app) => {
      const derived = getDerivedStatus(app).label;
      if (derived === 'Applied') {
        localAppliedCount++;
        const d = parseSafeDate(app.applied_at) || parseSafeDate(app.created_at);
        if (d && d.getTime() >= todayTimestamp) {
          localAppliedTodayCount++;
        }
      } else if (derived === 'Skipped') {
        localSkippedCount++;
      } else if (derived === 'Failed') {
        localFailedCount++;
      } else if (derived === 'Company site') {
        localCompanySiteCount++;
      } else if (derived === 'Already applied') {
        localAlreadyAppliedCount++;
      } else if (derived === 'Needs Verification') {
        localNeedsVerificationCount++;
      } else {
        localPendingCount++;
      }

      const score = app.match_score ?? matchScores.get(app.job_id);
      if (typeof score === 'number' && score > 0) {
        validScores.push(score);
      }

      // Review Queue: Approval Required or match score 65-79%
      const isReview =
        app.workflow_state === 'APPROVAL_REQUIRED' ||
        (typeof score === 'number' && score >= 65 && score < 80 && app.workflow_state !== 'APPLIED');
      if (isReview) localReviewQueueCount++;

      // Needs Attention: Failed, paused on challenge/rate limit, or uncertain submission requiring verification
      const isAttention =
        app.workflow_state === 'FAILED' ||
        app.workflow_state === 'RECONCILIATION_REQUIRED' ||
        app.workflow_state === 'SUBMISSION_UNKNOWN' ||
        (typeof app.workflow_state === 'string' && app.workflow_state.startsWith('PAUSED_'));
      if (isAttention) localNeedsAttentionCount++;
    });

    const total = backendStats?.total ?? applications.length;
    const appliedCount = backendStats?.applied ?? localAppliedCount;
    const appliedTodayCount = backendStats?.applied_today ?? localAppliedTodayCount;
    const successRate = backendStats?.success_rate ?? (total > 0 ? Math.round((appliedCount / total) * 100) : 0);
    const avgMatch =
      validScores.length > 0
        ? Math.round(validScores.reduce((acc, curr) => acc + curr, 0) / validScores.length)
        : 0;

    const failedCount = backendStats?.failed ?? localFailedCount;
    const skippedCount = backendStats?.skipped ?? localSkippedCount;
    const reviewQueueCount = backendStats?.approval_required ?? localReviewQueueCount;
    const needsAttentionCount = backendStats?.needs_attention ?? localNeedsAttentionCount;
    const needsVerificationCount = backendStats?.reconciliation_required ?? localNeedsVerificationCount;
    const companySiteCount = localCompanySiteCount;
    const alreadyAppliedCount = localAlreadyAppliedCount;
    const pendingCount = localPendingCount;

    return {
      total,
      appliedCount,
      appliedTodayCount,
      successRate,
      avgMatch,
      scoredJobsCount: validScores.length,
      companySiteCount,
      issuesCount: failedCount + skippedCount,
      failedCount,
      skippedCount,
      alreadyAppliedCount,
      needsVerificationCount,
      pendingCount,
      reviewQueueCount,
      needsAttentionCount,
    };
  }, [applications, matchScores, backendStats]);

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

  const filteredApplications = useMemo(() => {
    let result = [...applications];

    // Status chip filter
    if (selectedFilter === 'Review Queue') {
      result = result.filter((app) => {
        const score = app.match_score ?? matchScores.get(app.job_id);
        return (
          app.workflow_state === 'APPROVAL_REQUIRED' ||
          (typeof score === 'number' && score >= 65 && score < 80 && app.workflow_state !== 'APPLIED')
        );
      });
    } else if (selectedFilter === 'Needs Attention') {
      result = result.filter((app) => {
        return (
          app.workflow_state === 'FAILED' ||
          app.workflow_state === 'RECONCILIATION_REQUIRED' ||
          app.workflow_state === 'SUBMISSION_UNKNOWN' ||
          (typeof app.workflow_state === 'string' && app.workflow_state.startsWith('PAUSED_'))
        );
      });
    } else if (selectedFilter !== 'All') {
      result = result.filter((app) => getDerivedStatus(app).label === selectedFilter);
    }

    // Title / Company / Location general search input
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((app) => {
        const title = (app.job_title || app.job?.title || '').toLowerCase();
        const company = (app.company || app.job?.company || '').toLowerCase();
        const location = (app.location || app.job?.location || '').toLowerCase();
        return title.includes(q) || company.includes(q) || location.includes(q);
      });
    }

    // Dedicated Company filter (Image 1)
    if (companyFilter.trim()) {
      const c = companyFilter.toLowerCase().trim();
      result = result.filter((app) => {
        const company = (app.company || app.job?.company || '').toLowerCase();
        return company.includes(c);
      });
    }

    // Min match % filter (Image 1)
    if (minMatchFilter > 0) {
      result = result.filter((app) => {
        const score = app.match_score ?? matchScores.get(app.job_id) ?? 0;
        return score >= minMatchFilter;
      });
    }

    // Date From filter (Image 1)
    if (fromDate) {
      const startT = getDayStartTimestamp(fromDate);
      if (startT !== null) {
        result = result.filter((app) => {
          const appD = parseSafeDate(app.applied_at) || parseSafeDate(app.created_at);
          return appD !== null && appD.getTime() >= startT;
        });
      }
    }

    // Date To filter (Image 1)
    if (toDate) {
      const endT = getDayEndTimestamp(toDate);
      if (endT !== null) {
        result = result.filter((app) => {
          const appD = parseSafeDate(app.applied_at) || parseSafeDate(app.created_at);
          return appD !== null && appD.getTime() <= endT;
        });
      }
    }

    // Interactive Sorting
    result.sort((a, b) => {
      if (sortColumn === 'match') {
        const scoreA = a.match_score ?? matchScores.get(a.job_id) ?? 0;
        const scoreB = b.match_score ?? matchScores.get(b.job_id) ?? 0;
        return sortDirection === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      }
      if (sortColumn === 'status') {
        const statusA = getDerivedStatus(a).label;
        const statusB = getDerivedStatus(b).label;
        return sortDirection === 'desc' ? statusB.localeCompare(statusA) : statusA.localeCompare(statusB);
      }
      // Date sort (default)
      const timeA = (parseSafeDate(a.applied_at) || parseSafeDate(a.created_at))?.getTime() || 0;
      const timeB = (parseSafeDate(b.applied_at) || parseSafeDate(b.created_at))?.getTime() || 0;
      return sortDirection === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [
    applications,
    selectedFilter,
    searchQuery,
    companyFilter,
    minMatchFilter,
    fromDate,
    toDate,
    sortColumn,
    sortDirection,
    matchScores,
  ]);


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

      {/* Dynamic Operational KPI Cards — Compact Industry Standard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Successfully Applied */}
        <div
          onClick={() => setSelectedFilter(selectedFilter === 'Applied' ? 'All' : 'Applied')}
          className={`p-3.5 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer group shadow-2xs hover:shadow-xs ${
            selectedFilter === 'Applied'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10 dark:border-emerald-500'
              : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Successfully Applied</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {stats.appliedCount}
            </span>
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40">
              {stats.successRate}% rate
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {stats.appliedTodayCount > 0 ? `+${stats.appliedTodayCount} submitted today` : 'Direct submissions'}
          </div>
        </div>

        {/* Card 2: Match Quality */}
        <div
          onClick={() => {
            setSortColumn('match');
            setSortDirection(sortColumn === 'match' && sortDirection === 'desc' ? 'asc' : 'desc');
          }}
          className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer group shadow-2xs hover:shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Avg Match Quality</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {stats.avgMatch > 0 ? `${stats.avgMatch}%` : '-'}
            </span>
            {stats.avgMatch > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/40">
                {stats.avgMatch >= 75 ? 'High fit' : stats.avgMatch >= 60 ? 'Moderate' : 'Fair'}
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {sortColumn === 'match' ? (
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Sorted by match {sortDirection === 'desc' ? '↓' : '↑'}</span>
            ) : (
              `Across ${stats.scoredJobsCount} scored roles`
            )}
          </div>
        </div>

        {/* Card 3: Company Sites / Redirects */}
        <div
          onClick={() => setSelectedFilter(selectedFilter === 'Company site' ? 'All' : 'Company site')}
          className={`p-3.5 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer group shadow-2xs hover:shadow-xs ${
            selectedFilter === 'Company site'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10 dark:border-blue-500'
              : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Company Site Redirects</span>
            <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {stats.companySiteCount}
            </span>
            {stats.companySiteCount > 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-100 dark:border-blue-800/40">
                Needs manual apply
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                All on portal
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {stats.companySiteCount > 0 ? 'External career portals' : 'No external redirects'}
          </div>
        </div>

        {/* Card 4: Issues & Skipped */}
        <div
          onClick={() => setSelectedFilter(selectedFilter === 'Failed' ? 'All' : 'Failed')}
          className={`p-3.5 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer group shadow-2xs hover:shadow-xs ${
            selectedFilter === 'Failed'
              ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/10 dark:border-rose-500'
              : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Audit &amp; Skipped</span>
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                stats.issuesCount > 0
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {stats.issuesCount}
            </span>
            {stats.issuesCount > 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-100 dark:border-rose-800/40">
                {stats.failedCount} fail · {stats.skippedCount} skip
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100/60 dark:border-emerald-900/40">
                All clear
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {stats.issuesCount > 0 ? 'Diagnostics & errors logged' : '0 errors or blocks'}
          </div>
        </div>
      </div>

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
                    paginatedApplications.map((app) => {
                      const statusObj = getDerivedStatus(app);
                    const matchScore = app.match_score ?? matchScores.get(app.job_id);
                    const dateDisplay = formatDateDisplay(app.applied_at || app.created_at);
                    const isExpanded = expandedReasonId === app.id;
                    const applyUrl = app.apply_url || app.job?.apply_url;

                    // Clean portal name: NEVER show a UUID!
                    const platformName = resolvePlatformName(app);

                    const jobTitle =
                      app.job_title || app.job?.title || (app.job_id ? `Position #${app.job_id.slice(-6)}` : 'Role');

                    // Clean company name: NEVER show a UUID!
                    const companyRaw = app.company || app.job?.company;
                    const companyName =
                      companyRaw && !isUuidString(companyRaw) ? companyRaw : 'Company';

                    return (
                      <React.Fragment key={app.id}>
                        <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors group">
                          {/* Position (Job title + Company & portal subtitle) */}
                          <td className="py-3.5 px-4 align-top max-w-[280px]">
                            <button
                              type="button"
                              onClick={() => openDrawer(app.id)}
                              className="font-semibold text-xs text-slate-900 dark:text-white leading-tight text-left hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer"
                              aria-label={`Open details for ${jobTitle} at ${companyName}`}
                            >
                              {jobTitle}
                            </button>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center space-x-1">
                              <span className="font-medium text-slate-600 dark:text-slate-300">{companyName}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-400">{platformName}</span>
                            </div>
                          </td>

                          {/* Location */}
                          <td className="py-3.5 px-4 align-top text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                            {app.location || app.job?.location || '-'}
                          </td>

                          {/* Exp */}
                          <td className="py-3.5 px-4 align-top text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                            {formatExperience(app)}
                          </td>

                          {/* Salary */}
                          <td className="py-3.5 px-4 align-top text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                            {formatSalary(app)}
                          </td>

                          {/* Status Pill Badge */}
                          <td className="py-3.5 px-4 align-top">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusObj.className}`}
                            >
                              {statusObj.label}
                            </span>
                          </td>

                          {/* Match Score */}
                          <td className="py-3.5 px-4 align-top font-semibold text-xs text-slate-800 dark:text-slate-200">
                            <div className="flex items-center space-x-1.5">
                              {matchScore !== undefined && matchScore > 0 ? (
                                <span
                                  className={
                                    matchScore >= 75
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : matchScore >= 60
                                      ? 'text-indigo-600 dark:text-indigo-400'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }
                                >
                                  {Math.round(matchScore)}%
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedAppForRationale(app)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                                title="Why Selected or Skipped?"
                              >
                                Why?
                              </button>
                            </div>
                          </td>

                          {/* Date (Main + relative) */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div className="font-medium text-slate-700 dark:text-slate-200 text-xs leading-tight">
                              {dateDisplay.main}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {dateDisplay.rel}
                            </div>
                          </td>

                          {/* Action Column */}
                          <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                            {app.workflow_state === 'APPROVAL_REQUIRED' ||
                            (typeof matchScore === 'number' && matchScore >= 65 && matchScore < 80 && app.workflow_state !== 'APPLIED') ? (
                              <div className="inline-flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => handleApprove(app.id)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow-2xs transition-transform active:scale-95 cursor-pointer"
                                  title="Approve and execute application"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject(app.id)}
                                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-semibold transition-colors cursor-pointer"
                                  title="Dismiss from review queue"
                                >
                                  Dismiss
                                </button>
                                {applyUrl && (
                                  <a
                                    href={applyUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 flex items-center space-x-1"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            ) : statusObj.label === 'Needs Verification' ? (
                              <div className="inline-flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => setSelectedAppForReconciliation(app)}
                                  className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-[11px] shadow-2xs transition-transform active:scale-95 cursor-pointer flex items-center space-x-1"
                                  title="Inspect submission and verify outcome"
                                >
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Verify Outcome</span>
                                </button>
                                <button
                                  onClick={() => setExpandedReasonId(isExpanded ? null : app.id)}
                                  className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 flex items-center space-x-0.5 cursor-pointer transition-colors"
                                >
                                  <span>Reason</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => setExpandedReasonId(isExpanded ? null : app.id)}
                                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer transition-colors"
                                  title="View execution audit & traces"
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : statusObj.label === 'Failed' || (typeof app.workflow_state === 'string' && app.workflow_state.startsWith('PAUSED_')) ? (
                              <div className="inline-flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => handleRetry(app)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] shadow-2xs transition-transform active:scale-95 cursor-pointer flex items-center space-x-1"
                                  title="Retry application submission"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Retry</span>
                                </button>
                                <button
                                  onClick={() => setExpandedReasonId(isExpanded ? null : app.id)}
                                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center space-x-0.5 cursor-pointer transition-colors"
                                >
                                  <span>Reason</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => setExpandedReasonId(isExpanded ? null : app.id)}
                                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer transition-colors"
                                  title="View execution audit & traces"
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : statusObj.label === 'Skipped' ? (
                              <div className="inline-flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => setExpandedReasonId(isExpanded ? null : app.id)}
                                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center space-x-0.5 cursor-pointer transition-colors"
                                >
                                  <span>Reason</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => setExpandedReasonId(isExpanded ? null : app.id)}
                                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer transition-colors"
                                  title="View execution audit & traces"
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : applyUrl ? (
                              <div className="inline-flex items-center justify-end space-x-2.5">
                                {Array.isArray(app.questions) && app.questions.length > 0 && (
                                  <button
                                    onClick={() => setExpandedReasonId(isExpanded ? null : app.id)}
                                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center space-x-0.5 cursor-pointer"
                                    title="View answered screening questions"
                                  >
                                    <span>Q&amp;A · {app.questions.length}</span>
                                  </button>
                                )}
                                <a
                                  href={applyUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 inline-flex items-center space-x-1 transition-colors"
                                >
                                  <span>Open</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            ) : Array.isArray(app.questions) && app.questions.length > 0 ? (
                              <button
                                onClick={() => setExpandedReasonId(isExpanded ? null : app.id)}
                                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center space-x-0.5 cursor-pointer"
                                title="View answered screening questions"
                              >
                                <span>Q&amp;A · {app.questions.length}</span>
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>

                        {/* Collapsible Diagnostics Row */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                            <td colSpan={8} className="p-4">
                              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3 shadow-2xs">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center space-x-2 text-rose-700 dark:text-rose-400 font-semibold text-xs">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>Error Diagnostics &amp; Audit Trace</span>
                                  </div>
                                  <button aria-label="Close"
                                    onClick={() => setExpandedReasonId(null)}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Reason text */}
                                <div className="text-xs text-slate-700 dark:text-slate-300 bg-rose-50/60 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-100 dark:border-rose-900/40 font-mono leading-relaxed break-words">
                                  {app.failure_reason
                                    ? app.failure_reason
                                        .replace(/^Page\.goto:\s*/i, '')
                                        .replace(/^Page\.evaluate:\s*/i, '')
                                    : 'Execution encountered an unexpected stop or manual skip.'}
                                </div>

                                {/* Screening Q&A answered */}
                                {Array.isArray(app.questions) && app.questions.length > 0 && (
                                  <div className="text-xs text-indigo-700 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                                    <span className="font-semibold">
                                      ✓ {app.questions.length} Screening Questions Automatically Answered
                                    </span>
                                  </div>
                                )}

                                {/* Action bar */}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                                  <div className="flex items-center space-x-3">
                                    {app.screenshot_file_path && (
                                      <button
                                        onClick={() => openScreenshotPreview(app.id, app.screenshot_file_path!)}
                                        className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                                      >
                                        <Camera className="w-3.5 h-3.5 text-indigo-500" />
                                        <span>View Screenshot Artifact</span>
                                      </button>
                                    )}

                                    {app.trace_file_path && (
                                      <span
                                        className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                                        title={app.trace_file_path}
                                      >
                                        trace.zip recorded
                                      </span>
                                    )}
                                  </div>

                                  {applyUrl && (
                                    <a
                                      href={applyUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-2xs cursor-pointer"
                                    >
                                      <span>Apply Manually on Portal</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
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

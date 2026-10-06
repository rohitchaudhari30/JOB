import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
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
} from 'lucide-react';
import { api } from '../services/api';
import { Application } from '../types';
import { useToast } from '../context/ToastContext';

type DerivedStatus = 'Applied' | 'Skipped' | 'Failed' | 'Company site' | 'Already applied' | 'Pending';

const isUuidString = (str?: string | null): boolean => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
};

const resolvePlatformName = (app: Application): string => {
  const candidate = app.platform || app.job?.source_type;
  if (candidate && !isUuidString(candidate)) {
    const lower = candidate.toLowerCase();
    if (lower === 'naukri') return 'Naukri';
    if (lower === 'linkedin') return 'LinkedIn';
    if (lower === 'indeed') return 'Indeed';
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }

  // Derive portal name from apply_url if available
  const url = (app.apply_url || app.job?.apply_url || '').toLowerCase();
  if (url.includes('naukri')) return 'Naukri';
  if (url.includes('linkedin')) return 'LinkedIn';
  if (url.includes('indeed')) return 'Indeed';
  if (url.includes('foundit') || url.includes('monster')) return 'Foundit';

  // Safe fallback to Naukri since that is our primary portal
  return 'Naukri';
};

const parseSafeDate = (val?: string | null): Date | null => {
  if (!val) return null;
  if (typeof val === 'string') {
    const s = val.trim().replace(' ', 'T');
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(val);
  return !isNaN(fallback.getTime()) ? fallback : null;
};

const getDayStartTimestamp = (dateStr: string): number | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 0, 0, 0, 0).getTime();
  }
  const fallback = new Date(dateStr);
  return !isNaN(fallback.getTime())
    ? new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 0, 0, 0, 0).getTime()
    : null;
};

const getDayEndTimestamp = (dateStr: string): number | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 23, 59, 59, 999).getTime();
  }
  const fallback = new Date(dateStr);
  return !isNaN(fallback.getTime())
    ? new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 23, 59, 59, 999).getTime()
    : null;
};

interface ApplicationCRMProps {
  onNavigate?: (tab: any) => void;
}

export const ApplicationCRM: React.FC<ApplicationCRMProps> = ({ onNavigate }) => {
  const { showSuccess, showError } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [matchScores, setMatchScores] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);

  // Secondary Filter Bar Inputs (Image 1)
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [minMatchFilter, setMinMatchFilter] = useState<number>(0);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<'date' | 'match' | 'status'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [appsData, matchesData] = await Promise.all([
        api.listApplications(),
        api.listMatches().catch(() => []),
      ]);

      setApplications(appsData);

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
    let appliedCount = 0;
    let appliedTodayCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let companySiteCount = 0;
    let alreadyAppliedCount = 0;
    let pendingCount = 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamp = todayStart.getTime();

    const validScores: number[] = [];

    applications.forEach((app) => {
      const derived = getDerivedStatus(app).label;
      if (derived === 'Applied') {
        appliedCount++;
        const d = parseSafeDate(app.applied_at) || parseSafeDate(app.created_at);
        if (d && d.getTime() >= todayTimestamp) {
          appliedTodayCount++;
        }
      } else if (derived === 'Skipped') {
        skippedCount++;
      } else if (derived === 'Failed') {
        failedCount++;
      } else if (derived === 'Company site') {
        companySiteCount++;
      } else if (derived === 'Already applied') {
        alreadyAppliedCount++;
      } else {
        pendingCount++;
      }

      const score = app.match_score ?? matchScores.get(app.job_id);
      if (typeof score === 'number' && score > 0) {
        validScores.push(score);
      }
    });

    const total = applications.length;
    const successRate = total > 0 ? Math.round((appliedCount / total) * 100) : 0;
    const avgMatch =
      validScores.length > 0
        ? Math.round(validScores.reduce((acc, curr) => acc + curr, 0) / validScores.length)
        : 0;

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
      pendingCount,
    };
  }, [applications, matchScores]);

  const filterChips: { id: string; label: string; count: number; dotColor?: string }[] = useMemo(
    () => [
      { id: 'All', label: 'All', count: stats.total },
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
    if (selectedFilter !== 'All') {
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

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredApplications.length / pageSize));

  // Reset to first page when filtering or sorting changes
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
            <span>{applications.length}</span>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
            title="Refresh pipeline"
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
              <button
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
                <button
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
                            <div className="font-semibold text-xs text-slate-900 dark:text-white leading-tight">
                              {jobTitle}
                            </div>
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
                            {statusObj.label === 'Failed' || statusObj.label === 'Skipped' ? (
                              <div className="inline-flex items-center justify-end space-x-2">
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
                            ) : app.workflow_state === 'APPROVAL_REQUIRED' ? (
                              <div className="inline-flex items-center space-x-2">
                                <button
                                  onClick={() => handleApprove(app.id)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow-2xs transition-transform active:scale-95 cursor-pointer"
                                >
                                  Approve
                                </button>
                                {applyUrl && (
                                  <a
                                    href={applyUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 flex items-center space-x-1"
                                  >
                                    <span>Open</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
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
                                  <button
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
                                        onClick={() => setSelectedScreenshot(app.screenshot_file_path!)}
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

            {/* Table Pagination Footer matching Image 2 & 3 */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400 dark:text-slate-500 select-none">
                  Page {currentPage} of {totalPages}
                </span>
                {filteredApplications.length !== applications.length && (
                  <button
                    onClick={() => {
                      setSelectedFilter('All');
                      setSearchQuery('');
                      setCompanyFilter('');
                      setMinMatchFilter(0);
                      setFromDate('');
                      setToDate('');
                    }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer ml-1"
                  >
                    (Reset filters)
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
                  title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
                  title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Screenshot Preview Modal */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-6">
          <div className="max-w-4xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Application Step Screenshot</h3>
              <button
                onClick={() => setSelectedScreenshot(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              >
                Close Preview
              </button>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-mono break-all">
              Path: {selectedScreenshot}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

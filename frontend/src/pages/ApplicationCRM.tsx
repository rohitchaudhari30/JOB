import React, { useEffect, useState, useMemo } from 'react';

import { api } from '../services/api';
import { Application, ApplicationStats } from '../types';
import { useToast } from '../context/ToastContext';
import { ScreenshotModal } from './applications/ScreenshotModal';
import { RationaleModal } from './applications/RationaleModal';
import { ReconciliationModal } from './applications/ReconciliationModal';
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
import { ApplicationsHeader } from './applications/ApplicationsHeader';
import { ApplicationsToolbar } from './applications/ApplicationsToolbar';
import { SecondaryFilterBar } from './applications/SecondaryFilterBar';
import { ApplicationsTable } from './applications/ApplicationsTable';


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

  const hasActiveSecondaryFilters = Boolean(companyFilter || minMatchFilter > 0 || fromDate || toDate);

  return (
    <div className="space-y-5 animate-fadeIn">
      <ApplicationsHeader loadData={loadData} loading={loading} stats={stats} />

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
        <ApplicationsToolbar filterChips={filterChips} hasActiveSecondaryFilters={hasActiveSecondaryFilters} searchQuery={searchQuery} setSearchQuery={setSearchQuery} selectedFilter={selectedFilter} setSelectedFilter={setSelectedFilter} showFilterPanel={showFilterPanel} setShowFilterPanel={setShowFilterPanel} />

        <SecondaryFilterBar showFilterPanel={showFilterPanel} hasActiveSecondaryFilters={hasActiveSecondaryFilters} companyFilter={companyFilter} setCompanyFilter={setCompanyFilter} minMatchFilter={minMatchFilter} setMinMatchFilter={setMinMatchFilter} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} />

        <ApplicationsTable loading={loading} applications={applications} filteredApplications={filteredApplications} paginatedApplications={paginatedApplications} matchScores={matchScores} expandedReasonId={expandedReasonId} setExpandedReasonId={setExpandedReasonId} sortColumn={sortColumn} setSortColumn={setSortColumn} sortDirection={sortDirection} setSortDirection={setSortDirection} currentPage={currentPage} setCurrentPage={setCurrentPage} pageSize={pageSize} setPageSize={setPageSize} setSelectedFilter={setSelectedFilter} setSearchQuery={setSearchQuery} setCompanyFilter={setCompanyFilter} setMinMatchFilter={setMinMatchFilter} setFromDate={setFromDate} setToDate={setToDate} openDrawer={openDrawer} handleApprove={handleApprove} handleReject={handleReject} handleRetry={handleRetry} setSelectedAppForRationale={setSelectedAppForRationale} setSelectedAppForReconciliation={setSelectedAppForReconciliation} openScreenshotPreview={openScreenshotPreview} onNavigate={onNavigate} />
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

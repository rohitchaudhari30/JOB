import { ReadinessBanner } from '../components/ReadinessBanner';
import { useJobActions } from '../hooks/useJobActions';
import { useRecordRoute } from '../hooks/useRecordRoute';
import { useAppliedJobs } from './jobs/useAppliedJobs';
import { useLiveApplyEvents } from './jobs/useLiveApplyEvents';
import { DiscoveryControls } from './jobs/DiscoveryControls';
import { DiscoveryToolbar } from './jobs/DiscoveryToolbar';
import { SelectionBar } from './jobs/SelectionBar';
import { BulkTailorModal } from './jobs/tailor/BulkTailorModal';
import { JobDetailDrawer, jobToDetailModel } from './jobs/JobDetailDrawer';
import React, { useEffect, useState, useMemo, useRef } from 'react';

import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { AutomationRunStatus, Job, Resume, MatchResult } from '../types';
import { DiscoveredJobsHeader } from './jobs/DiscoveredJobsHeader';
import { DiscoveredJobsGrid } from './jobs/DiscoveredJobsGrid';
import { JobsPagination } from './jobs/JobsPagination';
import { parseDaysFromFreshness } from './jobs/jobFreshness';
import { useDiscoveryDefaults } from './jobs/useDiscoveryDefaults';
import { useSelectionControl, type JobIdSet, type SetJobIds } from './jobs/useSelectionControl';

interface JobDiscoveryProps {
  activeRun?: AutomationRunStatus | null;
  onRefreshStatus?: () => void;
  onNavigate?: (tab: any) => void;
  /** Shared with the other Jobs lenses so the selection survives switching between them. */
  selectedJobIds?: JobIdSet;
  onSelectedJobIdsChange?: SetJobIds;
}

export const JobDiscovery: React.FC<JobDiscoveryProps> = ({
  activeRun = null,
  onRefreshStatus = () => {},
  onNavigate,
  selectedJobIds: selectedFromParent,
  onSelectedJobIdsChange,
}) => {
  const { showSuccess, showError, showWarning } = useToast();
  const actions = useJobActions({ onNavigate });
  const evaluatingJobIds = actions.evaluatingIds;
  const [bulkTailorOpen, setBulkTailorOpen] = useState(false);
  const record = useRecordRoute('/jobs', 'discovery', ['matches']);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [platform, setPlatform] = useState('all');
  const [platforms, setPlatforms] = useState<string[]>(['naukri', 'linkedin']);
  const [roles, setRoles] = useState('Data Engineer');
  const [location, setLocation] = useState('Pune, Mumbai');
  const [expYears, setExpYears] = useState<number>(2);
  const [expMonths, setExpMonths] = useState<number>(0);
  const [postedWithin, setPostedWithin] = useState<string>('24h');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Queue & Selection Management
  const [selectedJobIds, setSelectedJobIds] = useSelectionControl(selectedFromParent, onSelectedJobIdsChange);
  const [isStartingQueue, setIsStartingQueue] = useState(false);

  // Pre-flight setup data & guardrails
  const [connections, setConnections] = useState<any[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [matchesMap, setMatchesMap] = useState<Map<string, MatchResult>>(new Map());
  const [filterMinFit, setFilterMinFit] = useState(false);
  const { appliedJobMap, appliedTodayCount, loadAppliedJobs } = useAppliedJobs();

  const loadPreflightData = async () => {
    try {
      const [connsData, resumesData, matchesData] = await Promise.all([
        api.listConnections().catch(() => []),
        api.listResumes().catch(() => []),
        api.listMatches().catch(() => []),
      ]);
      setConnections(connsData || []);
      setResumes(resumesData || []);

      const mMap = new Map<string, MatchResult>();
      (matchesData || []).forEach((m: MatchResult) => {
        if (m.job_id) mMap.set(m.job_id, m);
      });
      setMatchesMap(mMap);
    } catch (e) {
      console.error('Failed to load preflight data:', e);
    }
  };

  const handleEvaluateSingle = async (jobId: string) => {
    const res = await actions.evaluateJob(jobId);
    if (res) {
      setMatchesMap((prev) => {
        const next = new Map(prev);
        next.set(jobId, res);
        return next;
      });
    }
  };

  useEffect(() => {
    loadAppliedJobs();
    loadPreflightData();
  }, []);

  const { liveApplyingJobId, setLiveApplyingJobId, liveQueueJobIds, setLiveQueueJobIds, liveSubmittedJobIds } =
    useLiveApplyEvents(
    jobs,
    loadAppliedJobs
  );

  const { profileSkills } = useDiscoveryDefaults(setRoles, setLocation, setExpYears, setExpMonths);

  // Pagination & Debouncing
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search query by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [postedWithin, sortBy, platform, roles, location, expYears, expMonths]);

  useEffect(() => {
    loadJobs();
  }, [debouncedSearch, postedWithin, sortBy, page, platform, roles, location, expYears, expMonths]);

  const latestRequestIdRef = useRef<number>(0);

  const loadJobs = async () => {
    const requestId = ++latestRequestIdRef.current;
    try {
      setLoading(true);
      const totalExp = Math.round((expYears + expMonths / 12) * 10) / 10;
      const res = await api.listJobs({
        search: debouncedSearch.trim() || undefined,
        role: roles.trim() || undefined,
        location: location.trim() || undefined,
        source_id: platform === 'all' ? undefined : platform,
        min_experience: totalExp,
        max_experience: totalExp + 2.0,
        posted_within: postedWithin === 'all' ? undefined : (postedWithin || undefined),
        sort_by: sortBy || 'newest',
        skip: (page - 1) * pageSize,
        limit: pageSize,
      });
      // Stale response guard: only update state if this is still the active request
      if (requestId === latestRequestIdRef.current) {
        setJobs(res.items || []);
        setTotalCount(res.total ?? (res.items || []).length);
      }
    } catch (e) {
      if (requestId === latestRequestIdRef.current) {
        console.error('Failed to load jobs:', e);
        showError('Unable to load job listings. Please check connection and try again.');
      }
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleTriggerDiscovery = async () => {
    try {
      setIsDiscovering(true);
      const rolesList = roles.split(',').map((r) => r.trim()).filter(Boolean);
      const locList = location.split(',').map((l) => l.trim()).filter(Boolean);
      const days = parseDaysFromFreshness(postedWithin);

      const targetSources = platform === 'all' ? ['naukri', 'linkedin'] : [platform];
      const totalExp = Math.round((expYears + expMonths / 12) * 10) / 10;
      const defaultResume = resumes.find((r) => r.is_default) || resumes[0];
      const res = await api.discoverJobs({
        source_type: platform, source_types: targetSources, roles: rolesList,
        locations: locList, experience: totalExp, min_experience: totalExp,
        max_experience: totalExp + 2, max_days_posted: days, auto_evaluate: true,
        skills: profileSkills.length > 0 ? profileSkills.slice(0, 10) : undefined,
        resume_id: defaultResume?.id,
      });
      const portalLabel = platform === 'all' ? 'All Portals (Naukri & LinkedIn)' : platform.toUpperCase();
      const filterInfo = res.filtered_out_count ? ` (${res.filtered_out_count} mismatched filtered out)` : '';
      showSuccess(`Found ${res.discovered_total} jobs (${res.new_jobs_count} new)${filterInfo} across ${portalLabel}.`, 'Discovery Complete');
      loadJobs();
    } catch (e: any) {
      showError(`Discovery failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleDeleteJob = async (jobId: string, title: string) => {
    try {
      setDeletingId(jobId);
      await api.deleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setSelectedJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      showSuccess(`Removed "${title}" from repository`, 'Job Removed');
    } catch (e: any) {
      showError(`Failed to remove job: ${e.response?.data?.detail || e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      setIsClearing(true);
      const res = await api.clearJobs();
      setJobs([]);
      setSelectedJobIds(new Set());
      setShowConfirmClear(false);
      showSuccess(`Cleared ${res.deleted_count} discovered jobs`, 'Repository Cleared');
    } catch (e: any) {
      showError(`Failed to clear repository: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsClearing(false);
    }
  };
  const defaultResume = resumes.find((r) => r.is_default) || resumes[0];
  const hasResume = Boolean(defaultResume);
  const requiresConnection = platform === 'naukri' || platform === 'linkedin';
  const currentConn = connections.find((c: any) => c.platform?.toLowerCase() === platform.toLowerCase());
  const isPlatformConnected = !requiresConnection || currentConn?.status === 'CONNECTED';

  const displayedJobs = useMemo(() => {
    let result = jobs;
    if (filterMinFit) {
      result = result.filter((j) => {
        const m = matchesMap.get(j.id);
        const score = m ? (m.match_score ?? m.overall_score) : 0;
        return m && score >= 80;
      });
    }
    return result;
  }, [jobs, filterMinFit, matchesMap]);

  // Selection toggle
  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const allSelected = displayedJobs.length > 0 && displayedJobs.every((j) => selectedJobIds.has(j.id));

  const handleSelectAll = () => {
    if (allSelected) {
      // Only deselect what is on screen; jobs chosen in another view stay selected.
      setSelectedJobIds((prev) => {
        const next = new Set(prev);
        displayedJobs.forEach((j) => next.delete(j.id));
        return next;
      });
    } else {
      setSelectedJobIds((prev) => new Set([...prev, ...displayedJobs.map((j) => j.id)]));
    }
  };

  const handleSelectTopN = (n: number) => {
    const topN = displayedJobs.slice(0, n).map((j) => j.id);
    setSelectedJobIds(new Set(topN));
  };

  // Trigger automation for selected jobs
  const handleLaunchQueue = async (selectedOnlyJobs?: Job[]) => {
    // Queue everything selected (it may include jobs picked in another view or on another page).
    const targetIds = selectedOnlyJobs ? selectedOnlyJobs.map((j) => j.id) : [...selectedJobIds];
    if (targetIds.length === 0) {
      showWarning('Please select at least 1 job to launch auto-apply.');
      return;
    }

    if (!isPlatformConnected) {
      showWarning(`Please connect your ${platform.toUpperCase()} session in Platform Connections before auto-applying.`);
      if (onNavigate) onNavigate('connections');
      return;
    }

    if (!hasResume) {
      showWarning('Please upload a PDF resume in Settings › Resumes & answers before auto-applying.');
      if (onNavigate) onNavigate('resumes');
      return;
    }

    if (appliedTodayCount >= 20) {
      showWarning('Daily Safe Limit Reached (20 applications). Recommended to wait until tomorrow to prevent platform throttling.');
    }

    try {
      setIsStartingQueue(true);
      setLiveQueueJobIds(new Set(targetIds));
      setLiveApplyingJobId(targetIds[0]);

      const queued = await actions.queueJobs(targetIds, 'JOB_DISCOVERY');
      if (queued) {
        setSelectedJobIds(new Set());
        onRefreshStatus();
        onNavigate?.('applications');
      }
    } catch (e: any) {
      showError(`Failed to queue applications: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsStartingQueue(false);
    }
  };

  // 1-Click single job apply
  const handleSingleJobApply = (job: Job) => {
    handleLaunchQueue([job]);
  };

  const selectedCount = selectedJobIds.size;

  const drawerModel = useMemo(
    () => jobToDetailModel(record.id ? jobs.find((x) => x.id === record.id) : undefined, matchesMap),
    [record.id, jobs, matchesMap]
  );

  return (
    <div className="space-y-4 animate-fadeIn pb-24">
      <DiscoveryControls
        expMonths={expMonths} expYears={expYears} handleTriggerDiscovery={handleTriggerDiscovery}
        isDiscovering={isDiscovering} location={location} platform={platform}
        platforms={platforms} roles={roles} setExpMonths={setExpMonths} setExpYears={setExpYears}
        setLocation={setLocation} setPlatform={setPlatform}
        setPlatforms={setPlatforms} setRoles={setRoles}
      />

      <ReadinessBanner
        missing={[...(!isPlatformConnected ? (['connection'] as const) : []), ...(!hasResume ? (['resume'] as const) : [])]}
        platformLabel={platform === 'all' ? 'Job Platforms' : platform === 'linkedin' ? 'LinkedIn' : platform === 'naukri' ? 'Naukri' : platform.toUpperCase()}
        onNavigate={(tab) => onNavigate?.(tab)}
      />

      <DiscoveryToolbar
        appliedTodayCount={appliedTodayCount} filterMinFit={filterMinFit} jobs={jobs}
        postedWithin={postedWithin} searchQuery={searchQuery} setFilterMinFit={setFilterMinFit}
        setPostedWithin={setPostedWithin} setSearchQuery={setSearchQuery} setSortBy={setSortBy} sortBy={sortBy}
      />

      {/* Discovered Jobs Header & Bulk Selection Controls */}
      <div className="space-y-4">
        <DiscoveredJobsHeader totalCount={totalCount} pageSize={pageSize} page={page} displayedJobs={displayedJobs} allSelected={allSelected} handleSelectAll={handleSelectAll} handleSelectTopN={handleSelectTopN} selectedCount={selectedCount} jobs={jobs} showConfirmClear={showConfirmClear} setShowConfirmClear={setShowConfirmClear} isClearing={isClearing} handleClearAll={handleClearAll} />

        <DiscoveredJobsGrid loading={loading} displayedJobs={displayedJobs} filterMinFit={filterMinFit} selectedJobIds={selectedJobIds} appliedJobMap={appliedJobMap} liveSubmittedJobIds={liveSubmittedJobIds} liveQueueJobIds={liveQueueJobIds} liveApplyingJobId={liveApplyingJobId} activeRun={activeRun} matchesMap={matchesMap} evaluatingJobIds={evaluatingJobIds} deletingId={deletingId} toggleJobSelection={toggleJobSelection} record={record} handleEvaluateSingle={handleEvaluateSingle} handleSingleJobApply={handleSingleJobApply} handleDeleteJob={handleDeleteJob} onNavigate={onNavigate} />

        <JobsPagination page={page} pageSize={pageSize} totalCount={totalCount} setPage={setPage} />
      </div>

      <SelectionBar
        defaultResume={defaultResume}
        handleLaunchQueue={() => handleLaunchQueue()}
        isStartingQueue={isStartingQueue}
        selectedCount={selectedCount}
        setSelectedJobIds={setSelectedJobIds}
        busy={isStartingQueue}
        onBulkTailor={() => setBulkTailorOpen(true)}
      />

      <BulkTailorModal
        open={bulkTailorOpen}
        onClose={() => setBulkTailorOpen(false)}
        jobIds={Array.from(selectedJobIds)}
        jobs={jobs}
        onInspectJob={(id) => record.open(id)}
      />

      <JobDetailDrawer
        model={drawerModel} onClose={record.close} onEvaluate={(id) => void handleEvaluateSingle(id)}
        onQueue={(id) => handleLaunchQueue(jobs.filter((x) => x.id === id))}
        evaluating={evaluatingJobIds.has(drawerModel?.jobId ?? '')} queueing={actions.queueingIds.has(drawerModel?.jobId ?? '')}
      />
    </div>
  );
};

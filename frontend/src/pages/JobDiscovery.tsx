import { ReadinessBanner } from '../components/ReadinessBanner';
import { useJobActions } from '../hooks/useJobActions';
import { useRecordRoute } from '../hooks/useRecordRoute';
import { DiscoveryControls } from './jobs/DiscoveryControls';
import { DiscoveryToolbar } from './jobs/DiscoveryToolbar';
import { SelectionBar } from './jobs/SelectionBar';
import { JobCard } from './jobs/JobCard';
import { JobDetailDrawer, jobToDetailModel } from './jobs/JobDetailDrawer';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Trash2,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { useToast } from '../context/ToastContext';
import { AutomationRunStatus, Job, Application, Resume, MatchResult } from '../types';

interface JobDiscoveryProps {
  activeRun?: AutomationRunStatus | null;
  onRefreshStatus?: () => void;
  onNavigate?: (tab: any) => void;
}

export const JobDiscovery: React.FC<JobDiscoveryProps> = ({
  activeRun = null,
  onRefreshStatus = () => {},
  onNavigate,
}) => {
  const { showSuccess, showError, showWarning } = useToast();
  const actions = useJobActions({ onNavigate });
  const evaluatingJobIds = actions.evaluatingIds;
  const record = useRecordRoute('/jobs', 'discovery', ['matches']);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [platform, setPlatform] = useState('naukri');
  const [roles, setRoles] = useState('Data Engineer');
  const [location, setLocation] = useState('Pune, Mumbai');
  const [experience, setExperience] = useState<number>(2);
  const [postedWithin, setPostedWithin] = useState<string>('24h');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Queue & Selection Management
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isStartingQueue, setIsStartingQueue] = useState(false);
  const [appliedJobMap, setAppliedJobMap] = useState<Map<string, { appliedAt?: string; status: string }>>(new Map());
  const [liveApplyingJobId, setLiveApplyingJobId] = useState<string | null>(null);
  const [liveQueueJobIds, setLiveQueueJobIds] = useState<Set<string>>(new Set());
  const [liveSubmittedJobIds, setLiveSubmittedJobIds] = useState<Set<string>>(new Set());

  // Pre-flight setup data & guardrails
  const [connections, setConnections] = useState<any[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [matchesMap, setMatchesMap] = useState<Map<string, MatchResult>>(new Map());
  const [filterMinFit, setFilterMinFit] = useState(false);
  const [appliedTodayCount, setAppliedTodayCount] = useState(0);

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

  const loadAppliedJobs = async () => {
    try {
      const mapData = await api.getAppliedJobMap().catch(async () => {
        // Fallback to listApplications if endpoint unavailable
        const apps = await api.listApplications();
        const fallback: Record<string, { status: string; applied_at?: string }> = {};
        (apps || []).forEach((app: Application) => {
          if (app.job_id) {
            fallback[app.job_id] = {
              status: app.workflow_state,
              applied_at: app.applied_at || app.created_at,
            };
          }
        });
        return fallback;
      });

      const map = new Map<string, { appliedAt?: string; status: string }>();
      let countToday = 0;
      const todayStr = new Date().toDateString();

      Object.entries(mapData || {}).forEach(([jobId, info]) => {
        map.set(jobId, {
          appliedAt: info.applied_at,
          status: info.status,
        });
        if (info.applied_at && new Date(info.applied_at).toDateString() === todayStr && info.status === 'APPLIED') {
          countToday++;
        }
      });

      setAppliedJobMap(map);
      setAppliedTodayCount(countToday);
    } catch {
      // Ignore if list fails
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

    // Listen to live WebSocket events to mark applications in real-time
    const unsubscribeEvent = wsClient.onEvent((evt) => {
      if (evt.event_name === 'AUTO_APPLYING') {
        if (evt.payload?.job_id) {
          setLiveApplyingJobId(evt.payload.job_id);
        } else if (evt.message) {
          const matchJob = jobs.find((j) => evt.message.includes(j.company) || evt.message.includes(j.title));
          if (matchJob) setLiveApplyingJobId(matchJob.id);
        }
      } else if (
        evt.event_name === 'APPLICATION_SUBMITTED' ||
        evt.state === 'APPLIED'
      ) {
        if (evt.payload?.job_id) {
          setLiveSubmittedJobIds((prev) => new Set(prev).add(evt.payload.job_id));
        } else if (liveApplyingJobId) {
          setLiveSubmittedJobIds((prev) => new Set(prev).add(liveApplyingJobId));
        }
        setLiveApplyingJobId(null);
        loadAppliedJobs();
      } else if (
        evt.event_name === 'RUN_COMPLETED' ||
        evt.event_name === 'RUN_ABORTED' ||
        evt.event_name === 'RUN_FAILED'
      ) {
        setLiveApplyingJobId(null);
        setLiveQueueJobIds(new Set());
        loadAppliedJobs();
      }
    });

    return () => {
      unsubscribeEvent();
    };
  }, []);

  useEffect(() => {
    // Load candidate profile defaults
    api.getProfile().then((prof) => {
      if (prof) {
        if (prof.headline) setRoles(prof.headline);
        if (prof.location) setLocation(prof.location);
        if (prof.total_experience_months !== undefined && prof.total_experience_months !== null) {
          setExperience(Math.floor(prof.total_experience_months / 12));
        }
      }
    }).catch(() => {});
  }, []);

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
  }, [postedWithin, sortBy]);

  useEffect(() => {
    loadJobs();
  }, [debouncedSearch, postedWithin, sortBy, page]);

  const latestRequestIdRef = useRef<number>(0);

  const loadJobs = async () => {
    const requestId = ++latestRequestIdRef.current;
    try {
      setLoading(true);
      const res = await api.listJobs({
        search: debouncedSearch.trim() || undefined,
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

  const parseDaysFromFreshness = (val: string): number => {
    if (val === '1h' || val === '3h' || val === '6h' || val === '12h' || val === '24h') return 1;
    if (val === '3d') return 3;
    if (val === '7d') return 7;
    if (val === '14d') return 14;
    if (val === '30d' || val === 'all') return 30;
    return 1;
  };

  const handleTriggerDiscovery = async () => {
    try {
      setIsDiscovering(true);
      const rolesList = roles.split(',').map((r) => r.trim()).filter(Boolean);
      const locList = location.split(',').map((l) => l.trim()).filter(Boolean);
      const days = parseDaysFromFreshness(postedWithin);

      const res = await api.discoverJobs({
        source_type: platform,
        roles: rolesList,
        locations: locList,
        experience: Number(experience),
        min_experience: Number(experience),
        max_experience: Number(experience) + 2,
        max_days_posted: days,
        auto_evaluate: true,
      });

      showSuccess(`Found ${res.discovered_total} jobs (${res.new_jobs_count} new) matching ${experience} yrs on ${platform.toUpperCase()}.`, 'Discovery Complete');
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
  const currentConn = connections.find((c: any) => c.platform?.toLowerCase() === platform.toLowerCase());
  const isPlatformConnected = currentConn?.status === 'CONNECTED';

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

  const handleSelectAll = () => {
    if (selectedJobIds.size === displayedJobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(displayedJobs.map((j) => j.id)));
    }
  };

  const handleSelectTopN = (n: number) => {
    const topN = displayedJobs.slice(0, n).map((j) => j.id);
    setSelectedJobIds(new Set(topN));
  };

  // Trigger automation for selected jobs
  const handleLaunchQueue = async (selectedOnlyJobs?: Job[]) => {
    const targetJobs = selectedOnlyJobs || displayedJobs.filter((j) => selectedJobIds.has(j.id));
    if (targetJobs.length === 0) {
      showWarning('Please select at least 1 job to launch auto-apply.');
      return;
    }

    if (!isPlatformConnected) {
      showWarning(`Please connect your ${platform.toUpperCase()} session in Platform Connections before auto-applying.`);
      if (onNavigate) onNavigate('connections');
      return;
    }

    if (!hasResume) {
      showWarning('Please upload a PDF resume in Candidate Profile before auto-applying.');
      if (onNavigate) onNavigate('profile');
      return;
    }

    if (appliedTodayCount >= 20) {
      showWarning('Daily Safe Limit Reached (20 applications). Recommended to wait until tomorrow to prevent platform throttling.');
    }

    try {
      setIsStartingQueue(true);
      setLiveQueueJobIds(new Set(targetJobs.map((j) => j.id)));
      setLiveApplyingJobId(targetJobs[0].id);

      const queued = await actions.queueJobs(targetJobs.map((j) => j.id), 'JOB_DISCOVERY');
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
    <div className="space-y-6 animate-fadeIn pb-24">
      <DiscoveryControls
        experience={experience}
        handleTriggerDiscovery={handleTriggerDiscovery}
        isDiscovering={isDiscovering}
        location={location}
        platform={platform}
        roles={roles}
        setExperience={setExperience}
        setLocation={setLocation}
        setPlatform={setPlatform}
        setRoles={setRoles}
      />


      <ReadinessBanner
        missing={[...(!isPlatformConnected ? (['connection'] as const) : []), ...(!hasResume ? (['resume'] as const) : [])]}
        platformLabel={platform === 'linkedin' ? 'LinkedIn' : platform === 'naukri' ? 'Naukri' : platform.toUpperCase()}
        onNavigate={(tab) => onNavigate?.(tab)}
      />

      <DiscoveryToolbar
        appliedTodayCount={appliedTodayCount}
        filterMinFit={filterMinFit}
        jobs={jobs}
        postedWithin={postedWithin}
        searchQuery={searchQuery}
        setFilterMinFit={setFilterMinFit}
        setPostedWithin={setPostedWithin}
        setSearchQuery={setSearchQuery}
        setSortBy={setSortBy}
        sortBy={sortBy}
      />

      {/* Discovered Jobs Header & Bulk Selection Controls */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Discovered Job Repository ({totalCount} total{totalCount > pageSize ? ` · page ${page}` : ''})
            </h2>
            {displayedJobs.length > 0 && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSelectAll}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center space-x-1 cursor-pointer"
                >
                  {selectedCount === displayedJobs.length ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Deselect All</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>Select All ({displayedJobs.length})</span>
                    </>
                  )}
                </button>

                {displayedJobs.length >= 5 && (
                  <button
                    onClick={() => handleSelectTopN(5)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                    title="Select top 5 newest jobs"
                  >
                    ⚡ Top 5
                  </button>
                )}
                {displayedJobs.length >= 10 && (
                  <button
                    onClick={() => handleSelectTopN(10)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                    title="Select top 10 newest jobs"
                  >
                    ⚡ Top 10
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {jobs.length > 0 && (
              <div>
                {!showConfirmClear ? (
                  <button
                    onClick={() => setShowConfirmClear(true)}
                    className="px-3 py-1 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All ({jobs.length})</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-2 animate-fadeIn bg-rose-50 dark:bg-rose-950/50 px-3 py-1 rounded-xl border border-rose-200 dark:border-rose-900/80">
                    <span className="text-xs text-rose-700 dark:text-rose-300 font-semibold">Delete all {jobs.length} jobs?</span>
                    <button
                      onClick={handleClearAll}
                      disabled={isClearing}
                      className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {isClearing ? 'Clearing...' : 'Yes, Delete'}
                    </button>
                    <button
                      onClick={() => setShowConfirmClear(false)}
                      className="px-2 py-0.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-xs">Loading fresh jobs...</div>
        ) : displayedJobs.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900/30 rounded-3xl border border-slate-200/80 dark:border-slate-800 text-slate-500 text-xs shadow-sm">
            {filterMinFit
              ? 'No jobs found with >= 80% AI match fit. Try evaluating more jobs or resetting the filter.'
              : 'No jobs found matching the selected freshness or keyword criteria.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isSelected={selectedJobIds.has(job.id)}
                appInfo={appliedJobMap.get(job.id)}
                isLiveSubmitted={liveSubmittedJobIds.has(job.id)}
                isLiveQueued={liveQueueJobIds.has(job.id)}
                liveApplyingJobId={liveApplyingJobId}
                activeRun={activeRun}
                match={matchesMap.get(job.id)}
                evaluating={evaluatingJobIds.has(job.id)}
                deleting={deletingId === job.id}
                onToggleSelect={toggleJobSelection}
                onOpen={record.open}
                onEvaluate={(id) => void handleEvaluateSingle(id)}
                onApply={handleSingleJobApply}
                onDelete={handleDeleteJob}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalCount > pageSize && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-6 border-t border-slate-200/60 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing <span className="font-bold text-slate-800 dark:text-slate-200">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-bold text-slate-800 dark:text-slate-200">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-bold text-slate-800 dark:text-slate-200">{totalCount}</span> opportunities
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, Math.ceil(totalCount / pageSize)) }, (_, i) => {
                  const totalPages = Math.ceil(totalCount / pageSize);
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  const isCurrent = page === pageNum;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                disabled={page >= Math.ceil(totalCount / pageSize)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <SelectionBar
        defaultResume={defaultResume}
        handleLaunchQueue={() => handleLaunchQueue()}
        isStartingQueue={isStartingQueue}
        selectedCount={selectedCount}
        setSelectedJobIds={setSelectedJobIds}
      />

      <JobDetailDrawer
        model={drawerModel}
        onClose={record.close}
        onEvaluate={(id) => void handleEvaluateSingle(id)}
        onQueue={(id) => handleLaunchQueue(jobs.filter((x) => x.id === id))}
        evaluating={evaluatingJobIds.has(drawerModel?.jobId ?? '')}
        queueing={actions.queueingIds.has(drawerModel?.jobId ?? '')}
      />
    </div>
  );
};

import { ReadinessBanner } from '../components/ReadinessBanner';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Search,
  Building,
  MapPin,
  DollarSign,
  ExternalLink,
  Clock,
  Sparkles,
  ArrowUpDown,
  Compass,
  Trash2,
  CheckSquare,
  Square,
  Play,
  Zap,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Loader2,
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
  const [evaluatingJobIds, setEvaluatingJobIds] = useState<Set<string>>(new Set());
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
    try {
      setEvaluatingJobIds((prev) => new Set(prev).add(jobId));
      const res = await api.evaluateMatch(jobId);
      setMatchesMap((prev) => {
        const next = new Map(prev);
        next.set(jobId, res);
        return next;
      });
      showSuccess(`Fit calculated: ${Math.round(res.overall_score)}% match`, 'AI Evaluation Complete');
    } catch (e: any) {
      showError(`Match evaluation failed: ${e.message}`);
    } finally {
      setEvaluatingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
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
      if (targetJobs.length > 0) {
        setLiveApplyingJobId(targetJobs[0].id);
      }

      const queueResult = await api.batchQueueApplications({
        job_ids: targetJobs.map((j) => j.id),
        source: 'JOB_DISCOVERY',
        auto_execute: false,
      });

      if (queueResult.queued_count > 0) {
        showSuccess(
          `Successfully queued ${queueResult.queued_count} opportunities for Campaign execution! (${queueResult.skipped_count} skipped/duplicates)`,
          'Added to Application Pipeline'
        );
      } else {
        showWarning('Selected jobs were already applied or duplicate.');
      }
      setSelectedJobIds(new Set());
      onRefreshStatus();

      // Transition to Review Queue or Applications CRM
      if (onNavigate) {
        onNavigate('applications');
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

  const formatRelativeTime = (job: Job): { label: string; badgeStyle: string; isLive: boolean } => {
    if (!job.posted_at) {
      return {
        label: job.raw_posted_text || 'Recently posted',
        badgeStyle: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        isLive: false,
      };
    }

    const postedDt = new Date(job.posted_at);
    const diffMs = Math.max(0, Date.now() - postedDt.getTime());
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      const minText = diffMins <= 1 ? 'Just now' : `${diffMins} min ago`;
      return {
        label: `Posted ${minText}`,
        badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80 font-bold',
        isLive: true,
      };
    }
    if (diffHours < 24) {
      const hrText = diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
      return {
        label: `Posted ${hrText}`,
        badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80 font-semibold',
        isLive: false,
      };
    }
    if (diffDays === 1) {
      return {
        label: 'Posted 1 day ago',
        badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80',
        isLive: false,
      };
    }
    if (diffDays <= 3) {
      return {
        label: `Posted ${diffDays} days ago`,
        badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/80',
        isLive: false,
      };
    }
    if (diffDays <= 7) {
      return {
        label: `Posted ${diffDays} days ago`,
        badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        isLive: false,
      };
    }
    const weeks = Math.floor(diffDays / 7);
    return {
      label: `Posted ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`,
      badgeStyle: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/80 dark:text-slate-500 dark:border-slate-800',
      isLive: false,
    };
  };

  const selectedCount = selectedJobIds.size;

  return (
    <div className="space-y-6 animate-fadeIn pb-24">
      {/* Discovery Trigger & Scouting Controls */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Live Job Discovery Scout
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automated real-time scanner across job portals and direct ATS boards
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Live Engine Ready</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end pt-1">
          {/* Platform */}
          <div className="md:col-span-3 space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Source Platform
            </label>
            <select aria-label="Job platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs cursor-pointer"
            >
              <option value="naukri">Naukri.com</option>
              <option value="linkedin">LinkedIn Jobs</option>
              <option value="greenhouse">Greenhouse Boards</option>
              <option value="lever">Lever Boards</option>
              <option value="workday">Workday Portals</option>
              <option value="ashby">Ashby Boards</option>
            </select>
          </div>

          {/* Roles */}
          <div className="md:col-span-3 space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Target Roles / Titles
            </label>
            <input
              type="text"
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
              placeholder="e.g. Data Engineer, Python Developer"
              className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
            />
          </div>

          {/* Locations */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Target Locations
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Pune, Mumbai"
              className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
            />
          </div>

          {/* Experience */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Experience
            </label>
            <div className="relative flex items-center">
              <input
                type="number"
                min={0}
                max={35}
                value={experience}
                onChange={(e) => setExperience(Number(e.target.value))}
                placeholder="2"
                className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
              />
              <span className="absolute right-3 text-xs font-semibold text-slate-400 dark:text-slate-500 pointer-events-none">
                Yrs
              </span>
            </div>
          </div>

          {/* Discover Button */}
          <div className="md:col-span-2">
            <button
              onClick={handleTriggerDiscovery}
              disabled={isDiscovering}
              className="w-full h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
              <span className="truncate">
                {isDiscovering
                  ? `Scanning ${platform === 'linkedin' ? 'LinkedIn' : platform === 'naukri' ? 'Naukri' : platform}...`
                  : 'Find Fresh Jobs'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <ReadinessBanner
        missing={[...(!isPlatformConnected ? (['connection'] as const) : []), ...(!hasResume ? (['resume'] as const) : [])]}
        platformLabel={platform === 'linkedin' ? 'LinkedIn' : platform === 'naukri' ? 'Naukri' : platform.toUpperCase()}
        onNavigate={(tab) => onNavigate?.(tab)}
      />

      {/* Freshness & Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Segmented Freshness Filter Chips + Anti-Ban & Top Fit */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Freshness:</span>
          {[
            { label: '🔥 Past 24 Hours', value: '24h' },
            { label: '⚡ Last 1 Hour', value: '1h' },
            { label: '📅 Past 3 Days', value: '3d' },
            { label: '📅 Past 7 Days', value: '7d' },
            { label: '🌐 All Time', value: 'all' },
          ].map((chip) => {
            const isSelected = postedWithin === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => setPostedWithin(chip.value)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {chip.label}
              </button>
            );
          })}

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

          {/* Top Fit Filter Toggle */}
          <button
            onClick={() => setFilterMinFit((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border ${
              filterMinFit
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
            }`}
            title="Show only jobs with >= 80% AI match score"
          >
            <Sparkles className={`w-3.5 h-3.5 ${filterMinFit ? 'text-amber-300' : 'text-amber-500'}`} />
            <span>Top Fit (&gt;80%)</span>
          </button>

          {/* Anti-Ban Daily Safe Limit Badge */}
          <div
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 border ${
              appliedTodayCount >= 20
                ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80'
            }`}
            title="Safe daily cap: 20 applications/day prevents anti-bot spam detection and account throttling."
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Safe Cap: {appliedTodayCount}/20 today</span>
          </div>
        </div>


        {/* Detailed Controls: Sort By & Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sort By Dropdown */}
          <div className="flex items-center space-x-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select aria-label="Sort jobs"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="freshness">Best Freshness Score</option>
              <option value="salary_high_to_low">Salary: High to Low</option>
              <option value="salary_low_to_high">Salary: Low to High</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

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
            {displayedJobs.map((job) => {
              const freshness = formatRelativeTime(job);
              const isSelected = selectedJobIds.has(job.id);
              const appInfo = appliedJobMap.get(job.id);
              const isSubmissionUncertain =
                appInfo?.status === 'RECONCILIATION_REQUIRED' || appInfo?.status === 'SUBMISSION_UNKNOWN';
              const isApplied =
                (Boolean(appInfo) && appInfo?.status === 'APPLIED') || liveSubmittedJobIds.has(job.id);
              const isCurrentlyApplying =
                liveApplyingJobId === job.id ||
                (activeRun?.status === 'RUNNING' &&
                  Boolean(activeRun?.current_job_title) &&
                  (job.title.toLowerCase().includes(activeRun.current_job_title!.toLowerCase()) ||
                    activeRun.current_job_title!.toLowerCase().includes(job.title.toLowerCase())));
              const isQueued =
                !isCurrentlyApplying &&
                !isApplied &&
                !isSubmissionUncertain &&
                (liveQueueJobIds.has(job.id) ||
                  (Boolean(appInfo) &&
                    ['APPROVAL_REQUIRED', 'APPROVED', 'SUBMITTING', 'READY_TO_SUBMIT'].includes(appInfo!.status)));

              return (
                <div
                  key={job.id}
                  className={`p-5 rounded-2xl bg-white border transition-all flex flex-col justify-between space-y-3 shadow-xs hover:shadow-md relative ${
                    isCurrentlyApplying
                      ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-50/20 dark:bg-amber-950/25 dark:border-amber-500'
                      : isSubmissionUncertain
                      ? 'border-orange-400 ring-2 ring-orange-400/20 bg-orange-50/20 dark:bg-orange-950/25 dark:border-orange-500'
                      : isApplied
                      ? 'border-emerald-400/80 bg-emerald-50/15 dark:bg-emerald-950/20 dark:border-emerald-800'
                      : isQueued
                      ? 'border-indigo-400/80 ring-1 ring-indigo-400/20 bg-indigo-50/10 dark:bg-indigo-950/20 dark:border-indigo-800'
                      : isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:bg-slate-900/90 dark:border-indigo-500'
                      : 'border-slate-200/80 hover:border-slate-300 dark:bg-slate-900/70 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Header: Selection Checkbox + Platform tag + AI Fit Badge + Freshness / Applied badge + Delete button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        {/* Checkbox */}
                        {isCurrentlyApplying ? (
                          <div
                            className="w-5 h-5 rounded-lg flex items-center justify-center bg-amber-500 text-white shadow-xs animate-pulse"
                            title="Automation engine currently applying to this job"
                          >
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          </div>
                        ) : isSubmissionUncertain ? (
                          <div
                            className="w-5 h-5 rounded-lg flex items-center justify-center bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/40"
                            title="Submission uncertain on portal. Resolve in Application CRM before re-attempting."
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </div>
                        ) : isApplied ? (
                          <div
                            className="w-5 h-5 rounded-lg flex items-center justify-center bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                            title="Application already submitted"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        ) : isQueued ? (
                          <div
                            className="w-5 h-5 rounded-lg flex items-center justify-center bg-indigo-100 text-indigo-700 dark:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700"
                            title="Waiting in automation queue"
                          >
                            <Clock className="w-3 h-3" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleJobSelection(job.id)}
                            className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                                : 'bg-slate-50 border-slate-300 dark:bg-slate-800 dark:border-slate-600 text-transparent hover:border-indigo-400'
                            }`}
                            title={isSelected ? 'Deselect Job' : 'Select for Auto-Apply'}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/80">
                          {job.source_type ? job.source_type.toUpperCase() : 'NAUKRI'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        {/* AI Match Fit Badge / Evaluation Trigger */}
                        {(() => {
                          const match = matchesMap.get(job.id);
                          const isEvaluating = evaluatingJobIds.has(job.id);

                          if (match) {
                            const score = Math.round(match.match_score ?? match.overall_score);
                            const scoreColor =
                              score >= 80
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                : score >= 60
                                ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';

                            return (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1 ${scoreColor}`}
                                title={`Fit: ${score}% (Decision: ${match.decision})\n${match.reasoning_summary || match.matched_skills?.slice(0, 3).join(', ') || ''}`}
                              >
                                <Zap className="w-2.5 h-2.5" />
                                <span>{score}% Fit</span>
                              </span>
                            );
                          }

                          return (
                            <button
                              onClick={() => handleEvaluateSingle(job.id)}
                              disabled={isEvaluating}
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1 transition-all cursor-pointer disabled:opacity-50"
                              title="Calculate candidate-job fit score with AI"
                            >
                              <Sparkles className={`w-2.5 h-2.5 ${isEvaluating ? 'animate-spin' : 'text-amber-500'}`} />
                              <span>{isEvaluating ? 'Scoring...' : '⚡ AI Fit'}</span>
                            </button>
                          );
                        })()}

                        {/* Real-time Status Badges */}
                        {isCurrentlyApplying ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white flex items-center space-x-1 shadow-xs animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                            <span>APPLYING NOW</span>
                          </span>
                        ) : isSubmissionUncertain ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950/80 dark:text-orange-300 dark:border-orange-800 flex items-center space-x-1">
                            <AlertTriangle className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                            <span>Needs Verification ⚠️</span>
                          </span>
                        ) : isQueued ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>In Queue</span>
                          </span>
                        ) : isApplied ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Applied ✅</span>
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] border flex items-center space-x-1.5 ${freshness.badgeStyle}`}>
                            {freshness.isLive && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            )}
                            <span>{freshness.label}</span>
                          </span>
                        )}

                        {/* Dismiss / Delete Button */}
                        <button aria-label="Delete"
                          onClick={() => handleDeleteJob(job.id, job.title)}
                          disabled={deletingId === job.id}
                          title="Remove job from repository"
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className={`w-3.5 h-3.5 ${deletingId === job.id ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>

                    <h3 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-1">{job.title}</h3>

                    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center space-x-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        <span className="line-clamp-1">{job.company}</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="line-clamp-1">{job.location}</span>
                      </div>
                    </div>

                    {job.max_salary && (
                      <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center">
                        <DollarSign className="w-3.5 h-3.5 inline" />
                        <span>{(job.max_salary / 100000).toFixed(1)} LPA</span>
                      </div>
                    )}

                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed pt-1">
                      {job.raw_description}
                    </p>
                  </div>

                  {/* Card Footer with 1-Click Live Bot Apply & Real-Time Status Actions */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded truncate">
                      {job.max_experience_years && job.max_experience_years > (job.min_experience_years || 0)
                        ? `Exp: ${job.min_experience_years}-${job.max_experience_years} yrs`
                        : `Exp: ${job.min_experience_years || 0}+ yrs`}
                    </span>

                    <div className="flex items-center space-x-2">
                      <a
                        href={job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center space-x-0.5"
                        title="View Original Job Link"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      {isCurrentlyApplying ? (
                        <button
                          onClick={() => onNavigate && onNavigate('live_console')}
                          className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer transition-all animate-pulse active:scale-95"
                          title="Automation actively interacting with browser for this job. Click to watch live stream."
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Watch Live ⚡</span>
                        </button>
                      ) : isSubmissionUncertain ? (
                        <button
                          onClick={() => onNavigate && onNavigate('applications')}
                          className="px-3 py-1 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:hover:bg-orange-900/80 dark:text-orange-400 text-xs font-bold border border-orange-200 dark:border-orange-800 flex items-center space-x-1 transition-all cursor-pointer active:scale-95"
                          title="Submission uncertain on portal. Click to verify in Application CRM."
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                          <span>Verify (CRM)</span>
                        </button>
                      ) : isQueued ? (
                        <button
                          onClick={() => onNavigate && onNavigate('live_console')}
                          className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-all"
                          title="Waiting in automation batch. Click to view mission control."
                        >
                          <Clock className="w-3 h-3" />
                          <span>Queued (View)</span>
                        </button>
                      ) : isApplied ? (
                        <button
                          onClick={() => onNavigate && onNavigate('applications')}
                          className="px-3 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1 transition-all cursor-pointer active:scale-95"
                          title="View Application Details in CRM"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Applied (CRM)</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSingleJobApply(job)}
                          className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1 transition-all cursor-pointer shadow-2xs active:scale-95"
                        >
                          <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span>Apply Live</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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

      {/* Floating Action Bar when jobs are selected */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slideUp">
          <div className="px-5 py-3 rounded-2xl bg-slate-900/95 text-white border border-indigo-500/40 shadow-2xl backdrop-blur-md flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
              </span>
              <span className="text-xs font-bold">
                {selectedCount} Job{selectedCount > 1 ? 's' : ''} Queued
              </span>
            </div>

            {defaultResume && (
              <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700">
                <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate max-w-[130px] font-medium" title={defaultResume.file_name}>
                  {defaultResume.file_name}
                </span>
              </div>
            )}

            <div className="h-4 w-px bg-slate-700" />

            <button
              onClick={() => setSelectedJobIds(new Set())}
              className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Clear
            </button>

            <button
              onClick={() => handleLaunchQueue()}
              disabled={isStartingQueue}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-black text-xs shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isStartingQueue ? 'Launching Engine...' : `🚀 Start Live Auto-Apply (${selectedCount})`}</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  Search,
  RefreshCw,
  Building,
  MapPin,
  DollarSign,
  ExternalLink,
  Clock,
  Flame,
  Calendar,
  Sparkles,
  ArrowUpDown,
  Compass,
  Briefcase,
  Radio,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Job } from '../types';

export const JobDiscovery: React.FC = () => {
  const { showSuccess, showError } = useToast();
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

  useEffect(() => {
    loadJobs();
  }, [searchQuery, postedWithin, sortBy]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const res = await api.listJobs({
        search: searchQuery || undefined,
        posted_within: postedWithin === 'all' ? undefined : (postedWithin || undefined),
        sort_by: sortBy || 'newest',
        limit: 50,
      });
      setJobs(res.items || []);
    } catch (e) {
      console.error('Failed to load jobs:', e);
    } finally {
      setLoading(false);
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
      setShowConfirmClear(false);
      showSuccess(`Cleared ${res.deleted_count} discovered jobs`, 'Repository Cleared');
    } catch (e: any) {
      showError(`Failed to clear repository: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsClearing(false);
    }
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

  return (
    <div className="space-y-6 animate-fadeIn">
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
            <select
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

      {/* Freshness & Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Segmented Freshness Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
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
        </div>

        {/* Detailed Controls: Sort By & Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sort By Dropdown */}
          <div className="flex items-center space-x-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
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

      {/* Discovered Jobs List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Discovered Job Repository ({jobs.length} loaded)
          </h2>

          {jobs.length > 0 && (
            <div>
              {!showConfirmClear ? (
                <button
                  onClick={() => setShowConfirmClear(true)}
                  className="px-3 py-1 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
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

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-xs">Loading fresh jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900/30 rounded-3xl border border-slate-200/80 dark:border-slate-800 text-slate-500 text-xs shadow-sm">
            No jobs found matching the selected freshness or keyword criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => {
              const freshness = formatRelativeTime(job);
              return (
                <div
                  key={job.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 dark:bg-slate-900/70 dark:border-slate-800 dark:hover:border-slate-700 transition-all flex flex-col justify-between space-y-3 shadow-xs hover:shadow-md"
                >
                  <div className="space-y-2.5">
                    {/* Header: Platform tag + Freshness badge + Delete button */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/80">
                        {job.source_type ? job.source_type.toUpperCase() : 'NAUKRI'}
                      </span>

                      <div className="flex items-center space-x-1.5">
                        {/* Freshness Badge */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] border flex items-center space-x-1.5 ${freshness.badgeStyle}`}>
                          {freshness.isLive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          )}
                          <span>{freshness.label}</span>
                        </span>

                        {/* Dismiss / Delete Button */}
                        <button
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

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {job.max_experience_years && job.max_experience_years > (job.min_experience_years || 0)
                        ? `Exp: ${job.min_experience_years} - ${job.max_experience_years} yrs`
                        : `Exp: ${job.min_experience_years || 0}+ yrs`}
                    </span>
                    <a
                      href={job.apply_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center space-x-1"
                    >
                      <span>Job Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

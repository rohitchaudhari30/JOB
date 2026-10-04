import React, { useEffect, useState } from 'react';
import {
  Rocket,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Briefcase,
  MapPin,
  Sliders,
  Play,
  FileText,
  Layers,
  Zap,
  Globe,
  Plus,
  X,
  Radio,
  Lock,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { api } from '../services/api';
import { CandidateProfile, Resume, PlatformConnectionInfo } from '../types';
import { useToast } from '../context/ToastContext';

interface DirectApplyProps {
  onNavigate: (tab: any) => void;
}

const FRESHNESS_OPTIONS = [
  { label: '🔥 Last 1 Hour (Ultra-Fresh)', value: 1.0 },
  { label: '🕐 Last 6 Hours (Hot)', value: 6.0 },
  { label: '📅 Last 24 Hours (Recommended)', value: 24.0 },
  { label: '📅 Last 3 Days', value: 72.0 },
  { label: '📅 Last 7 Days', value: 168.0 },
  { label: '🌐 Any Time', value: 0.0 },
];

export const DirectApply: React.FC<DirectApplyProps> = ({ onNavigate }) => {
  const { showWarning, showError, showSuccess } = useToast();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [connections, setConnections] = useState<PlatformConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Execution Configuration
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [newRoleInput, setNewRoleInput] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [newLocationInput, setNewLocationInput] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(['naukri', 'linkedin']);
  const [freshnessHours, setFreshnessHours] = useState<number>(24.0);
  const [minMatchScore, setMinMatchScore] = useState<number>(75);
  const [workModes, setWorkModes] = useState<{ remote: boolean; hybrid: boolean; onsite: boolean }>({
    remote: true,
    hybrid: true,
    onsite: false,
  });
  const [applicationMode, setApplicationMode] = useState<'AUTO' | 'APPROVAL'>('AUTO');
  const [maxApplications, setMaxApplications] = useState<number>(10);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');

  useEffect(() => {
    loadSetupData();
  }, []);

  const loadSetupData = async () => {
    try {
      setLoading(true);
      const [profData, resumesData, connsData] = await Promise.all([
        api.getProfile().catch(() => null),
        api.listResumes().catch(() => []),
        api.listConnections().catch(() => []),
      ]);

      if (profData) {
        setProfile(profData);
        // Pre-populate roles
        const initialRoles: string[] = [];
        if (profData.headline) initialRoles.push(profData.headline);
        if (profData.skills && profData.skills.length > 0) {
          const topSkills = profData.skills.filter((s: any) => s.is_primary).map((s: any) => s.skill_name);
          if (topSkills.length > 0 && initialRoles.length === 0) {
            initialRoles.push(`${topSkills[0]} Developer`);
          }
        }
        if (initialRoles.length === 0) initialRoles.push('Software Engineer');
        setTargetRoles(initialRoles);

        // Pre-populate locations
        const initialLocs: string[] = [];
        if (profData.location) initialLocs.push(profData.location);
        initialLocs.push('Remote');
        setLocations(Array.from(new Set(initialLocs)));
      }

      setResumes(resumesData || []);
      const defaultRes = (resumesData || []).find((r: Resume) => r.is_default) || resumesData?.[0];
      if (defaultRes) {
        setSelectedResumeId(defaultRes.id);
      }

      setConnections(connsData || []);
    } catch (e) {
      console.error('Failed to load direct apply defaults:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = () => {
    if (newRoleInput.trim() && !targetRoles.includes(newRoleInput.trim())) {
      setTargetRoles([...targetRoles, newRoleInput.trim()]);
      setNewRoleInput('');
    }
  };

  const handleRemoveRole = (role: string) => {
    setTargetRoles(targetRoles.filter((r) => r !== role));
  };

  const handleAddLocation = () => {
    if (newLocationInput.trim() && !locations.includes(newLocationInput.trim())) {
      setLocations([...locations, newLocationInput.trim()]);
      setNewLocationInput('');
    }
  };

  const handleRemoveLocation = (loc: string) => {
    setLocations(locations.filter((l) => l !== loc));
  };

  const toggleSource = (source: string) => {
    if (selectedSources.includes(source)) {
      if (selectedSources.length > 1) {
        setSelectedSources(selectedSources.filter((s) => s !== source));
      }
    } else {
      setSelectedSources([...selectedSources, source]);
    }
  };

  const handleStartApply = async () => {
    if (targetRoles.length === 0) {
      showWarning('Please add at least one target job role.');
      return;
    }
    if (selectedSources.length === 0) {
      showWarning('Please select at least one job source.');
      return;
    }

    try {
      setStarting(true);
      const primarySource = selectedSources[0] || 'naukri';
      const runReq = {
        source_type: primarySource,
        roles: targetRoles,
        locations: locations.length > 0 ? locations : undefined,
        auto_apply_matches: applicationMode === 'AUTO',
        max_applications: maxApplications,
        auto_apply_threshold: minMatchScore,
        approval_threshold: applicationMode === 'APPROVAL' ? minMatchScore : 65.0,
        max_job_age_hours: freshnessHours > 0 ? freshnessHours : null,
      };

      await api.startAutomation(runReq);
      showSuccess('Application pipeline started! Opening Live Automation Console...');
      onNavigate('live_console');
    } catch (e: any) {
      showError(`Failed to start application run: ${e.response?.data?.detail || e.message}`);
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-500 text-xs">Loading application criteria...</div>;
  }

  const connectedSourcesCount = connections.filter((c) => c.status === 'CONNECTED').length;

  return (
    <div className="space-y-6 w-full animate-fadeIn pb-12">
      {/* Hero Action Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-800 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-900 p-7 text-white shadow-xl shadow-indigo-600/15 border border-indigo-500/20">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/15 dark:bg-indigo-500/20 text-indigo-100 text-[11px] font-bold border border-white/20 backdrop-blur-xs">
              <Rocket className="w-3.5 h-3.5" />
              <span>Direct Apply Hub</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Launch Automated Job Application Run
            </h1>
            <p className="text-xs text-indigo-100 dark:text-slate-300 leading-relaxed font-normal">
              Your profile, resume, and saved screening answers are loaded automatically. Review your search criteria below and start applying in 1-Click.
            </p>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleStartApply}
              disabled={starting}
              className="px-6 py-3.5 rounded-2xl bg-white text-indigo-700 hover:bg-slate-100 font-black text-sm shadow-xl shadow-black/20 flex items-center justify-center space-x-2.5 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current text-indigo-600" />
              <span>{starting ? 'Initializing Engine...' : '🚀 START APPLY'}</span>
            </button>
          </div>
        </div>

        {/* Ambient Glow */}
        <div className="absolute right-0 top-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Pre-flight System Health Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Candidate Profile</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {profile ? '✓ Ready (Saved Once)' : '⚠ Setup Needed'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Resume</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
              {resumes.find((r) => r.id === selectedResumeId)?.file_name || 'Default Resume'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Platforms &amp; ATS</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {connectedSourcesCount > 0 ? `${connectedSourcesCount} Connected + 4 ATS Ready` : '4 Direct ATS Active'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Criteria Configuration Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Run Execution Criteria
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Defaults auto-filled from your profile
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target Roles */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
              <span>Target Job Roles</span>
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 min-h-[46px]">
              {targetRoles.map((role) => (
                <span
                  key={role}
                  className="inline-flex items-center px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-100 dark:border-indigo-500/20"
                >
                  {role}
                  <button
                    onClick={() => handleRemoveRole(role)}
                    className="ml-1.5 hover:text-indigo-900 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center space-x-1 flex-1 min-w-[120px]">
                <input
                  type="text"
                  value={newRoleInput}
                  onChange={(e) => setNewRoleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRole())}
                  placeholder="+ Add role..."
                  className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden px-1"
                />
              </div>
            </div>
          </div>

          {/* Locations */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-500" />
              <span>Target Locations</span>
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 min-h-[46px]">
              {locations.map((loc) => (
                <span
                  key={loc}
                  className="inline-flex items-center px-2.5 py-1 rounded-xl bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                >
                  {loc}
                  <button
                    onClick={() => handleRemoveLocation(loc)}
                    className="ml-1.5 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center space-x-1 flex-1 min-w-[120px]">
                <input
                  type="text"
                  value={newLocationInput}
                  onChange={(e) => setNewLocationInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLocation())}
                  placeholder="+ Add location..."
                  className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden px-1"
                />
              </div>
            </div>
          </div>

          {/* Job Sources Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-500" />
              <span>Job Sources &amp; Platforms</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'naukri', label: 'Naukri.com', type: 'Portal' },
                { id: 'linkedin', label: 'LinkedIn', type: 'Portal' },
                { id: 'greenhouse', label: 'Greenhouse', type: 'ATS' },
                { id: 'lever', label: 'Lever ATS', type: 'ATS' },
                { id: 'workday', label: 'Workday', type: 'ATS' },
                { id: 'ashby', label: 'Ashby ATS', type: 'ATS' },
              ].map((src) => {
                const isSelected = selectedSources.includes(src.id);
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => toggleSource(src.id)}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{src.label}</div>
                      <div className="text-[10px] text-slate-400">{src.type}</div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isSelected && '✓'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Freshness Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>Job Freshness Filter</span>
            </label>
            <select
              value={freshnessHours}
              onChange={(e) => setFreshnessHours(Number(e.target.value))}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            >
              {FRESHNESS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400">
              Only surfaces jobs posted within this timeframe to avoid stale or expired openings.
            </p>
          </div>

          {/* Min Match Score Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Minimum Match Score</span>
              </label>
              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-100 dark:border-indigo-500/20">
                {minMatchScore}% Match
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={minMatchScore}
              onChange={(e) => setMinMatchScore(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>50% (Broad)</span>
              <span>75% (Recommended)</span>
              <span>95% (Strict)</span>
            </div>
          </div>

          {/* Application Mode Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-500" />
              <span>Application Execution Mode</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setApplicationMode('AUTO')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  applicationMode === 'AUTO'
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <span>⚡ Auto Apply</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  Autonomously fills and submits all jobs meeting match threshold.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setApplicationMode('APPROVAL')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  applicationMode === 'APPROVAL'
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <span>🛡️ Require Approval</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  Finds and pre-fills applications, pausing for your 1-click confirmation.
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Limit & Resume Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Max Applications This Run
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={maxApplications}
              onChange={(e) => setMaxApplications(Number(e.target.value))}
              className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Attach Resume Version
            </label>
            <select
              value={selectedResumeId}
              onChange={(e) => setSelectedResumeId(e.target.value)}
              className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.file_name} ({r.target_role || 'General'}) {r.is_default ? '★ Default' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Big Action CTA */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Clicking <strong>START APPLY</strong> initiates discovery, AI matching, and autonomous form submission.
          </div>

          <button
            onClick={handleStartApply}
            disabled={starting}
            className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-xl shadow-indigo-600/25 flex items-center justify-center space-x-2 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{starting ? 'Starting Run...' : '🚀 START APPLY'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

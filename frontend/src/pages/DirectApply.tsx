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
  Zap,
  Globe,
  Plus,
  X,
  Pause,
  Square,
  Activity,
  BarChart3,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { SafetyScheduleTab } from './campaigns/SafetyScheduleTab';
import {
  DEFAULT_SAFETY,
  SafetySettings,
  applyCampaignToSafety,
  toSafetyPolicyPayload,
  toSchedulePayload,
} from './campaigns/safetySettings';
import { ActivityStream } from './campaigns/ActivityStream';
import { NewCampaignModal } from './campaigns/NewCampaignModal';
import { CandidateProfile, Resume, PlatformConnectionInfo, Campaign, CampaignPacingStatus, CampaignActivityLog } from '../types';
import { useToast } from '../context/ToastContext';
import { usePolling } from '../hooks/usePolling';

interface DirectApplyProps {
  onNavigate: (tab: any) => void;
  initialTab?: 'instant' | 'schedules';
}

const FRESHNESS_OPTIONS = [
  { label: '🔥 Last 1 Hour (Ultra-Fresh)', value: 1.0 },
  { label: '🕐 Last 6 Hours (Hot)', value: 6.0 },
  { label: '📅 Last 24 Hours (Recommended)', value: 24.0 },
  { label: '📅 Last 3 Days', value: 72.0 },
  { label: '📅 Last 7 Days', value: 168.0 },
  { label: '🌐 Any Time', value: 0.0 },
];

export const DirectApply: React.FC<DirectApplyProps> = ({ onNavigate, initialTab }) => {
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
  const [applicationMode, setApplicationMode] = useState<'AUTO' | 'APPROVAL'>('AUTO');
  const [maxApplications, setMaxApplications] = useState<number>(10);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');

  // Autonomous Campaign Schedule Cadence
  const [safety, setSafety] = useState<SafetySettings>(DEFAULT_SAFETY);

  // Autonomous Campaign Engine State
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [pacingStatus, setPacingStatus] = useState<CampaignPacingStatus | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<CampaignActivityLog[]>([]);
  const [activeCampaignTab, setActiveCampaignTab] = useState<'rules' | 'safety' | 'logs'>('rules');
  const [showNewCampaignModal, setShowNewCampaignModal] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [campaignActionLoading, setCampaignActionLoading] = useState(false);

  // Safety Policy State

  // Rule State
  const [autoApplyThreshold, setAutoApplyThreshold] = useState(80);
  const [reviewThreshold, setReviewThreshold] = useState(65);
  const [minExpYears, setMinExpYears] = useState(0);
  const [maxExpYears, setMaxExpYears] = useState(10);
  const [mandatorySkillsInput, setMandatorySkillsInput] = useState('');

  useEffect(() => {
    loadSetupData();
    if (initialTab === 'schedules') {
      setActiveCampaignTab('safety');
    }
  }, [initialTab]);

  // Pacing/logs refresh every 5 s while a campaign is selected; paused when the tab is hidden.
  usePolling(
    () => {
      if (selectedCampaign?.id) void loadCampaignPacingAndLogs(selectedCampaign.id);
    },
    5000,
    Boolean(selectedCampaign?.id)
  );

  const loadCampaignPacingAndLogs = async (campId: string) => {
    try {
      const [pacing, logs] = await Promise.all([
        api.getCampaignPacing(campId).catch(() => null),
        api.getCampaignLogs(campId).catch(() => []),
      ]);
      if (pacing) setPacingStatus(pacing);
      setCampaignLogs(logs || []);
    } catch (e) {
      console.error('Failed to load campaign pacing/logs:', e);
    }
  };

  const syncFormFromCampaign = (camp: Campaign) => {
    setSelectedCampaign(camp);
    if (camp.rule) {
      setAutoApplyThreshold(camp.rule.auto_apply_threshold || 80);
      setReviewThreshold(camp.rule.review_threshold || 65);
      setMinExpYears(camp.rule.min_experience_years || 0);
      setMaxExpYears(camp.rule.max_experience_years || 10);
      if (camp.rule.target_roles && camp.rule.target_roles.length > 0) {
        setTargetRoles(camp.rule.target_roles);
      }
      if (camp.rule.target_locations && camp.rule.target_locations.length > 0) {
        setLocations(camp.rule.target_locations);
      }
      if (camp.rule.mandatory_skills) {
        setMandatorySkillsInput(camp.rule.mandatory_skills.join(', '));
      }
      if (camp.rule.target_platforms && camp.rule.target_platforms.length > 0) {
        setSelectedSources(camp.rule.target_platforms);
      }
    }
    setSafety((prev) => applyCampaignToSafety(prev, camp));
    loadCampaignPacingAndLogs(camp.id);
  };

  const loadSetupData = async () => {
    try {
      setLoading(true);
      const [profData, resumesData, connsData, campsData] = await Promise.all([
        api.getProfile().catch(() => null),
        api.listResumes().catch(() => []),
        api.listConnections().catch(() => []),
        api.listCampaigns().catch(() => []),
      ]);

      if (profData) {
        setProfile(profData);
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

        const initialLocs: string[] = [];
        if (profData.location) initialLocs.push(profData.location);
        initialLocs.push('Remote');
        const uniqueLocs = Array.from(new Set(initialLocs));
        setLocations(uniqueLocs);
      }

      setResumes(resumesData || []);
      const defaultRes = (resumesData || []).find((r: Resume) => r.is_default) || resumesData?.[0];
      if (defaultRes) {
        setSelectedResumeId(defaultRes.id);
      }

      setConnections(connsData || []);

      // Initialize or load campaigns
      if (campsData && campsData.length > 0) {
        setCampaigns(campsData);
        syncFormFromCampaign(campsData[0]);
      } else {
        // Auto-initialize standard default campaign
        try {
          const defaultRes = (resumesData || []).find((r: Resume) => r.is_default) || resumesData?.[0];
          const newCamp = await api.createCampaign({
            name: 'Primary Software Engineering Campaign',
            target_resume_id: defaultRes?.id || undefined,
            rule: {
              auto_apply_threshold: 80,
              review_threshold: 65,
              min_experience_years: 1,
              max_experience_years: 8,
              target_roles: ['Software Engineer'],
              target_locations: ['Bangalore', 'Remote'],
              target_platforms: ['naukri', 'linkedin'],
            },
            safety_policy: {
              daily_application_limit: 20,
              hourly_application_limit: 5,
              cooldown_seconds: 90,
              operating_start_time: '09:00',
              operating_end_time: '18:00',
            },
          });
          setCampaigns([newCamp]);
          syncFormFromCampaign(newCamp);
        } catch (err) {
          console.warn('Could not auto-create campaign:', err);
        }
      }
    } catch (e) {
      console.error('Failed to load direct apply defaults:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) {
      showWarning('Please enter a campaign name');
      return;
    }
    try {
      setCampaignActionLoading(true);
      const created = await api.createCampaign({
        name: newCampaignName.trim(),
        target_resume_id: selectedResumeId || undefined,
        rule: {
          auto_apply_threshold: autoApplyThreshold,
          review_threshold: reviewThreshold,
          min_experience_years: minExpYears,
          max_experience_years: maxExpYears,
          target_roles: targetRoles,
          target_locations: locations,
          mandatory_skills: mandatorySkillsInput.split(',').map((s) => s.trim()).filter(Boolean),
          target_platforms: selectedSources,
        },
        safety_policy: toSafetyPolicyPayload(safety),
        schedule: toSchedulePayload(safety),
      });
      showSuccess(`Campaign "${created.name}" created!`, 'Campaign Initialized');
      setCampaigns([created, ...campaigns]);
      syncFormFromCampaign(created);
      setShowNewCampaignModal(false);
      setNewCampaignName('');
    } catch (err: any) {
      showError(`Campaign creation failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setCampaignActionLoading(false);
    }
  };

  const handleSaveCampaignConfig = async () => {
    if (!selectedCampaign) return;
    try {
      setCampaignActionLoading(true);
      const updated = await api.updateCampaign(selectedCampaign.id, {
        rule: {
          auto_apply_threshold: autoApplyThreshold,
          review_threshold: reviewThreshold,
          min_experience_years: minExpYears,
          max_experience_years: maxExpYears,
          target_roles: targetRoles,
          target_locations: locations,
          mandatory_skills: mandatorySkillsInput.split(',').map((s) => s.trim()).filter(Boolean),
          target_platforms: selectedSources,
        },
        safety_policy: toSafetyPolicyPayload(safety),
        schedule: toSchedulePayload(safety),
        target_resume_id: selectedResumeId || undefined,
      });
      showSuccess('Campaign schedule, rules, and safety limits persisted!', 'Campaign Saved');
      setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)));
      syncFormFromCampaign(updated);
    } catch (err: any) {
      showError(`Failed to save campaign: ${err.response?.data?.detail || err.message}`);
    } finally {
      setCampaignActionLoading(false);
    }
  };

  const handleStartCampaignExecution = async () => {
    if (!selectedCampaign) return;
    try {
      setCampaignActionLoading(true);

      // 2. Prepare declarative campaign parameters for the Playwright runner
      const campaignRoles = selectedCampaign.rule?.target_roles && selectedCampaign.rule.target_roles.length > 0
        ? selectedCampaign.rule.target_roles
        : targetRoles.length > 0
        ? targetRoles
        : ['Software Engineer'];
      const campaignLocations = selectedCampaign.rule?.target_locations && selectedCampaign.rule.target_locations.length > 0
        ? selectedCampaign.rule.target_locations
        : locations.length > 0
        ? locations
        : undefined;

      const targetResumeId = selectedCampaign.target_resume_id || selectedResumeId || undefined;
      if (!targetResumeId && resumes.length === 0) {
        showWarning('Please upload and select a resume in Candidate Profile before running this campaign.');
        return;
      }

      // 3. One server call starts the campaign and its browser run, so closing the tab cannot split them
      await api.launchCampaign(selectedCampaign.id, {
        roles: campaignRoles,
        locations: campaignLocations,
        resume_id: targetResumeId,
        auto_apply_matches: applicationMode === 'AUTO',
        max_job_age_hours: freshnessHours > 0 ? freshnessHours : null,
        headless: true,
      });

      const updated = { ...selectedCampaign, state: 'RUNNING' as const };
      setSelectedCampaign(updated);
      setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)));
      showSuccess(`Campaign "${selectedCampaign.name}" launched with Live Telemetry!`);
      await loadCampaignPacingAndLogs(selectedCampaign.id);
      onNavigate('live_console');
    } catch (err: any) {
      showError(`Execution failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setCampaignActionLoading(false);
    }
  };

  const handlePauseCampaignExecution = async () => {
    if (!selectedCampaign) return;
    try {
      setCampaignActionLoading(true);
      await api.pauseCampaign(selectedCampaign.id);
      showSuccess('Campaign paused safely.');
      const updated = { ...selectedCampaign, state: 'PAUSED' as const };
      setSelectedCampaign(updated);
      setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)));
      await loadCampaignPacingAndLogs(selectedCampaign.id);
    } catch (err: any) {
      showError(`Pause failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setCampaignActionLoading(false);
    }
  };

  const handleResumeCampaignExecution = async () => {
    if (!selectedCampaign) return;
    try {
      setCampaignActionLoading(true);
      await api.resumeCampaign(selectedCampaign.id);
      showSuccess('Campaign execution resumed.');
      const updated = { ...selectedCampaign, state: 'RUNNING' as const };
      setSelectedCampaign(updated);
      setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)));
      await loadCampaignPacingAndLogs(selectedCampaign.id);
    } catch (err: any) {
      showError(`Resume failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setCampaignActionLoading(false);
    }
  };

  const handleStopCampaignExecution = async () => {
    if (!selectedCampaign) return;
    if (!confirm('Are you sure you want to stop the active campaign execution?')) return;
    try {
      setCampaignActionLoading(true);
      await api.stopCampaign(selectedCampaign.id);
      showSuccess('Campaign execution stopped.');
      const updated = { ...selectedCampaign, state: 'COMPLETED' as const };
      setSelectedCampaign(updated);
      setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)));
      await loadCampaignPacingAndLogs(selectedCampaign.id);
    } catch (err: any) {
      showError(`Stop failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setCampaignActionLoading(false);
    }
  };


  const handleDeleteCampaign = async () => {
    if (!selectedCampaign) return;
    if (selectedCampaign.state === 'RUNNING' || selectedCampaign.state === 'PAUSED') {
      showWarning('Stop the campaign before deleting it.');
      return;
    }
    if (!confirm(`Delete campaign "${selectedCampaign.name}"? This cannot be undone.`)) return;
    try {
      setCampaignActionLoading(true);
      await api.deleteCampaign(selectedCampaign.id);
      const remaining = campaigns.filter((c) => c.id !== selectedCampaign.id);
      setCampaigns(remaining);
      if (remaining.length > 0) {
        syncFormFromCampaign(remaining[0]);
      } else {
        setSelectedCampaign(null);
      }
      showSuccess('Campaign deleted.');
    } catch (err: any) {
      showError(`Delete failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setCampaignActionLoading(false);
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

    if (resumes.length === 0 && !selectedResumeId) {
      showWarning('Please upload a resume in Candidate Profile before auto-applying.');
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
        headless: true,
        resume_id: selectedResumeId || undefined,
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
      {/* Top Header: Campaign Selector & Control Suite */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs shrink-0">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Automation Campaigns
              </h1>
              {selectedCampaign && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-2xs ${
                  selectedCampaign.state === 'RUNNING'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                    : selectedCampaign.state === 'PAUSED'
                    ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    selectedCampaign.state === 'RUNNING'
                      ? 'bg-emerald-500 animate-pulse'
                      : selectedCampaign.state === 'PAUSED'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`} />
                  {selectedCampaign.state}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Persistent autonomous campaigns, declarative rules &amp; account safety pacing
            </p>
          </div>
        </div>

        {/* Campaign Dropdown & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {campaigns.length > 0 && (
            <select
              value={selectedCampaign?.id || ''}
              onChange={(e) => {
                const found = campaigns.find((c) => c.id === e.target.value);
                if (found) syncFormFromCampaign(found);
              }}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-xs outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.state})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setShowNewCampaignModal(true)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </button>

          {selectedCampaign && (
            <>
              {selectedCampaign.state === 'RUNNING' ? (
                <>
                  <button
                    type="button"
                    onClick={handlePauseCampaignExecution}
                    disabled={campaignActionLoading}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStopCampaignExecution}
                    disabled={campaignActionLoading}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50"
                    title="Stop Execution"
                  
 aria-label="Stop Execution"
>
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                </>
              ) : selectedCampaign.state === 'PAUSED' ? (
                <>
                  <button
                    type="button"
                    onClick={handleResumeCampaignExecution}
                    disabled={campaignActionLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStopCampaignExecution}
                    disabled={campaignActionLoading}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50"
                    title="Stop Execution"
                  
 aria-label="Stop Execution"
>
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCampaignExecution}
                  disabled={campaignActionLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Campaign</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDeleteCampaign}
                disabled={
                  campaignActionLoading ||
                  selectedCampaign.state === 'RUNNING' ||
                  selectedCampaign.state === 'PAUSED'
                }
                aria-label="Delete campaign"
                title="Delete campaign (stop it first if it is running)"
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleSaveCampaignConfig}
                disabled={campaignActionLoading}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Save Settings</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* P1: Operational Cockpit - Current Automation Status & Next Action */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm p-5 md:p-6 relative overflow-hidden transition-all">
        {/* Subtle accent gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />

        <div className="flex flex-col space-y-5">
          {/* Top Bar: Operational Status & Execution State */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div className="flex items-center space-x-3">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  pacingStatus?.attention_required
                    ? 'bg-amber-400'
                    : selectedCampaign?.state === 'RUNNING' || pacingStatus?.active_execution_status === 'RUNNING'
                    ? 'bg-emerald-400'
                    : 'bg-slate-400'
                }`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  pacingStatus?.attention_required
                    ? 'bg-amber-500'
                    : selectedCampaign?.state === 'RUNNING' || pacingStatus?.active_execution_status === 'RUNNING'
                    ? 'bg-emerald-500'
                    : 'bg-slate-400'
                }`} />
              </span>
              <span className="text-xs font-black tracking-wider uppercase text-slate-700 dark:text-slate-300">
                Current Automation Status
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                pacingStatus?.attention_required
                  ? 'bg-amber-50 text-amber-700 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                  : selectedCampaign?.state === 'RUNNING' || pacingStatus?.active_execution_status === 'RUNNING'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}>
                {pacingStatus?.active_execution_status || selectedCampaign?.state || 'IDLE'}
              </span>
            </div>

            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
                Operating Window: <strong className="text-slate-800 dark:text-slate-100 font-mono font-bold">{safety.operatingStart} - {safety.operatingEnd}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
                Pacing Delay: <strong className="text-slate-800 dark:text-slate-100 font-mono font-bold">{safety.cooldownSecs}s</strong>
              </span>
            </div>
          </div>

          {/* Operational Matrix: 4 Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Pillar 1: Current Operation */}
            <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5 mb-2">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Current Operation</span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2">
                  {pacingStatus?.active_job_title ? (
                    <span>
                      Applying to <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{pacingStatus.active_job_title}</span>
                      {pacingStatus.active_job_company && <span> at {pacingStatus.active_job_company}</span>}
                    </span>
                  ) : pacingStatus?.active_execution_status === 'RUNNING' ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Evaluating next qualified candidate in queue</span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Standby (Waiting for next cycle or trigger)</span>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                {pacingStatus?.active_execution_id ? `Exec ID: ${pacingStatus.active_execution_id.slice(0, 8)}...` : 'No active execution lease'}
              </div>
            </div>

            {/* Pillar 2: Progress Today */}
            <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Progress Today</span>
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-base font-black text-slate-900 dark:text-white">
                    {pacingStatus?.today_count ?? 0} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">/ {safety.dailyLimit} applications</span>
                  </span>
                  <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono">
                    {Math.round(((pacingStatus?.today_count ?? 0) / (safety.dailyLimit || 1)) * 100)}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round(((pacingStatus?.today_count ?? 0) / (safety.dailyLimit || 1)) * 100))}%` }}
                  />
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400">
                Hourly velocity: <strong className="text-slate-800 dark:text-slate-200 font-bold">{pacingStatus?.hourly_count ?? 0}/{safety.hourlyLimit}</strong> max
              </div>
            </div>

            {/* Pillar 3: Next Action / Cooldown */}
            <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Next Action</span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2">
                  {pacingStatus?.next_action_label || (
                    pacingStatus?.can_apply_now
                      ? 'Ready for dispatch'
                      : pacingStatus?.status_reason || 'Holding cooldown'
                  )}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                {pacingStatus?.cooldown_remaining_seconds && pacingStatus.cooldown_remaining_seconds > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    Cooldown: {pacingStatus.cooldown_remaining_seconds}s remaining
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    ✓ Pacing window open
                  </span>
                )}
              </div>
            </div>

            {/* Pillar 4: Human Attention & Live Intervention */}
            <div className={`p-4 rounded-xl border flex flex-col justify-between transition-colors ${
              pacingStatus?.attention_required
                ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60'
            }`}>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider flex items-center space-x-1.5 mb-2">
                  {pacingStatus?.attention_required ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-amber-800 dark:text-amber-300 font-bold">Action Needed</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-800 dark:text-emerald-300 font-bold">Guardian Status</span>
                    </>
                  )}
                </div>
                <div className={`text-xs font-semibold line-clamp-2 ${
                  pacingStatus?.attention_required
                    ? 'text-amber-900 dark:text-amber-200'
                    : 'text-slate-700 dark:text-slate-200'
                }`}>
                  {pacingStatus?.attention_required || 'Zero blockers detected. Autopilot running in verified safe zone.'}
                </div>
              </div>

              {pacingStatus?.attention_required ? (
                <div className="mt-3 pt-2 border-t border-amber-200/70 dark:border-amber-800/70 flex items-center space-x-2">
                  {pacingStatus.attention_required.includes('OTP') || pacingStatus.attention_required.includes('CAPTCHA') ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('live_console')}
                      className="w-full px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>Open Live Console</span>
                    </button>
                  ) : pacingStatus.attention_required.includes('Session') ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('connections')}
                      className="w-full px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Reconnect Platform</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate('live_console')}
                      className="w-full px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>Inspect Session</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-3 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                  <span>✓ 100% Autonomous</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Feature Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 text-xs font-bold">
        <button
          onClick={() => setActiveCampaignTab('rules')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeCampaignTab === 'rules'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Targeting &amp; Declarative Rules</span>
        </button>

        <button
          onClick={() => setActiveCampaignTab('safety')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeCampaignTab === 'safety'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Schedule &amp; Safety Policy</span>
        </button>

        <button
          onClick={() => setActiveCampaignTab('logs')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeCampaignTab === 'logs'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Activity Stream ({campaignLogs.length})</span>
        </button>
      </div>

      {/* Rules Tab Body */}
      {activeCampaignTab === 'rules' && (
        <>
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
                  <button aria-label="Close"
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
                  <button aria-label="Close"
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
            Click <strong>START APPLY NOW</strong> to run immediately, or set up 24/7 background autopilot.
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveCampaignTab('safety')}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center space-x-2 transition-transform active:scale-95 cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              <Clock className="w-4 h-4 text-indigo-500" />
              <span>Configure Schedule & Safety</span>
            </button>

            <button
              onClick={handleStartApply}
              disabled={starting}
              className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-xl shadow-indigo-600/25 flex items-center justify-center space-x-2 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{starting ? 'Starting Run...' : 'START APPLY NOW'}</span>
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Schedule & Safety Policy Tab Body */}
      {activeCampaignTab === 'safety' && (
        <SafetyScheduleTab
          settings={safety}
          saving={campaignActionLoading}
          onChange={(patch) => setSafety((prev) => ({ ...prev, ...patch }))}
          onSave={handleSaveCampaignConfig}
        />
      )}

      {/* Activity Stream Tab Body */}
      {activeCampaignTab === 'logs' && (
        <ActivityStream
          logs={campaignLogs}
          onRefresh={() => selectedCampaign && loadCampaignPacingAndLogs(selectedCampaign.id)}
        />
      )}

      {/* Modern Backdrop Modal for [+ New Campaign] */}
      {showNewCampaignModal && (
        <NewCampaignModal
          name={newCampaignName}
          busy={campaignActionLoading}
          onNameChange={setNewCampaignName}
          onSubmit={handleCreateNewCampaign}
          onClose={() => setShowNewCampaignModal(false)}
        />
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sliders,
  FileText,
  Activity,
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
import { CampaignHeader } from './campaigns/CampaignHeader';
import { CampaignCockpit } from './campaigns/CampaignCockpit';
import { CriteriaCard } from './campaigns/CriteriaCard';
import { NewCampaignModal } from './campaigns/NewCampaignModal';
import { CandidateProfile, Resume, PlatformConnectionInfo, Campaign, CampaignPacingStatus, CampaignActivityLog } from '../types';
import { useToast } from '../context/ToastContext';
import { usePolling } from '../hooks/usePolling';
import { ReadinessBanner } from '../components/ReadinessBanner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface DirectApplyProps {
  onNavigate: (tab: any) => void;
  initialTab?: 'instant' | 'schedules';
}

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


  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteCampaign = async () => {
    if (!selectedCampaign) return;
    if (selectedCampaign.state === 'RUNNING' || selectedCampaign.state === 'PAUSED') {
      showWarning('Stop the campaign before deleting it.');
      setConfirmDelete(false);
      return;
    }
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
      setConfirmDelete(false);
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
      <CampaignHeader
        campaigns={campaigns}
        selectedCampaign={selectedCampaign}
        campaignActionLoading={campaignActionLoading}
        syncFormFromCampaign={syncFormFromCampaign}
        setShowNewCampaignModal={setShowNewCampaignModal}
        handlePauseCampaignExecution={handlePauseCampaignExecution}
        handleResumeCampaignExecution={handleResumeCampaignExecution}
        handleStopCampaignExecution={handleStopCampaignExecution}
        handleStartCampaignExecution={handleStartCampaignExecution}
        handleSaveCampaignConfig={handleSaveCampaignConfig}
        setConfirmDelete={setConfirmDelete}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete campaign?"
        message={`"${selectedCampaign?.name ?? ''}" and its rules will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete campaign"
        destructive
        busy={campaignActionLoading}
        onConfirm={handleDeleteCampaign}
        onCancel={() => setConfirmDelete(false)}
      />

      <ReadinessBanner
        missing={[...(connectedSourcesCount === 0 ? (['connection'] as const) : []), ...(resumes.length === 0 ? (['resume'] as const) : [])]}
        platformLabel="A job platform"
        onNavigate={(tab) => onNavigate(tab)}
      />

      <CampaignCockpit connections={connections} pacingStatus={pacingStatus} safety={safety} selectedCampaign={selectedCampaign} onNavigate={onNavigate} />

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

      <CriteriaCard
        applicationMode={applicationMode}
        freshnessHours={freshnessHours}
        handleAddLocation={handleAddLocation}
        handleAddRole={handleAddRole}
        handleRemoveLocation={handleRemoveLocation}
        handleRemoveRole={handleRemoveRole}
        handleStartApply={handleStartApply}
        locations={locations}
        maxApplications={maxApplications}
        minMatchScore={minMatchScore}
        newLocationInput={newLocationInput}
        newRoleInput={newRoleInput}
        profile={profile}
        resumes={resumes}
        safety={safety}
        selectedResumeId={selectedResumeId}
        selectedSources={selectedSources}
        setActiveCampaignTab={setActiveCampaignTab}
        setApplicationMode={setApplicationMode}
        setFreshnessHours={setFreshnessHours}
        setMaxApplications={setMaxApplications}
        setMinMatchScore={setMinMatchScore}
        setNewLocationInput={setNewLocationInput}
        setNewRoleInput={setNewRoleInput}
        setSelectedResumeId={setSelectedResumeId}
        starting={starting}
        targetRoles={targetRoles}
        toggleSource={toggleSource}
      />
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

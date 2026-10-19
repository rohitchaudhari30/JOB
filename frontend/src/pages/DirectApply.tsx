import React, { useEffect, useState } from 'react';
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
import { useCampaignLaunch } from './campaigns/useCampaignLaunch';
import { useCampaignRules } from './campaigns/useCampaignRules';
import { useCampaignTransitions } from './campaigns/useCampaignTransitions';
import { CampaignTabBar } from './campaigns/CampaignTabBar';
import { PreflightBar } from './campaigns/PreflightBar';

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
  const rules = useCampaignRules();
  const {
    targetRoles,
    setTargetRoles,
    newRoleInput,
    setNewRoleInput,
    locations,
    setLocations,
    newLocationInput,
    setNewLocationInput,
    selectedSources,
    handleAddRole,
    handleRemoveRole,
    handleAddLocation,
    handleRemoveLocation,
    toggleSource,
  } = rules;
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

  // Rule State

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
    if (camp.rule) rules.applyRule(camp.rule);
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
        rule: rules.rulePayload(),
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
        rule: rules.rulePayload(),
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

  const { launchCampaign: handleStartCampaignExecution, startProfileRun: handleStartApply } = useCampaignLaunch({
    selectedCampaign,
    setSelectedCampaign,
    campaigns,
    setCampaigns,
    targetRoles,
    locations,
    selectedResumeId,
    resumes,
    applicationMode,
    freshnessHours,
    maxApplications,
    minMatchScore,
    selectedSources,
    setCampaignActionLoading,
    setStarting,
    loadCampaignPacingAndLogs,
    onNavigate,
    showWarning,
    showError,
    showSuccess,
  });

  const transitions = useCampaignTransitions({
    selectedCampaign,
    setSelectedCampaign,
    campaigns,
    setCampaigns,
    setBusy: setCampaignActionLoading,
    reload: loadCampaignPacingAndLogs,
    syncForm: syncFormFromCampaign,
    clearSelection: () => setSelectedCampaign(null),
    showWarning,
    endDelete: () => setConfirmDelete(false),
    showSuccess,
    showError,
  });
  const handleDeleteCampaign = transitions.remove;
  const handlePauseCampaignExecution = transitions.pause;
  const handleResumeCampaignExecution = transitions.resume;
  const handleStopCampaignExecution = transitions.stop;

  const [confirmDelete, setConfirmDelete] = useState(false);

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
        platformLabel="Your job platform"
        onNavigate={(tab) => onNavigate(tab)}
      />

      <CampaignCockpit connections={connections} pacingStatus={pacingStatus} safety={safety} selectedCampaign={selectedCampaign} onNavigate={onNavigate} />

      {/* Campaign Feature Tabs */}
      <CampaignTabBar activeCampaignTab={activeCampaignTab} setActiveCampaignTab={setActiveCampaignTab} logCount={campaignLogs.length} />

      {/* Rules Tab Body */}
      {activeCampaignTab === 'rules' && (
        <>
          {/* Pre-flight System Health Bar */}
      <PreflightBar profile={profile} resumes={resumes} selectedResumeId={selectedResumeId} connectedSourcesCount={connectedSourcesCount} />

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

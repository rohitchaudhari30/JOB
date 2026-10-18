import { api } from '../../services/api';
import type { Campaign, Resume } from '../../types';

interface Options {
  selectedCampaign: Campaign | null;
  setSelectedCampaign: (c: Campaign) => void;
  campaigns: Campaign[];
  setCampaigns: (c: Campaign[]) => void;
  targetRoles: string[];
  locations: string[];
  selectedResumeId: string;
  resumes: Resume[];
  applicationMode: 'AUTO' | 'APPROVAL';
  freshnessHours: number;
  maxApplications: number;
  minMatchScore: number;
  selectedSources: string[];
  setCampaignActionLoading: (b: boolean) => void;
  setStarting: (b: boolean) => void;
  loadCampaignPacingAndLogs: (id: string) => Promise<void>;
  onNavigate: (tab: any) => void;
  showWarning: (m: string) => void;
  showError: (m: string) => void;
  showSuccess: (m: string) => void;
}

/** Starting work: launch a saved campaign, or start a one-off profile run. */
export function useCampaignLaunch(o: Options) {
  const {
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
  } = o;

  const launchCampaign = async () => {
    if (!selectedCampaign) return;
    try {
      setCampaignActionLoading(true);

      // 2. Prepare declarative campaign parameters for the Playwright runner
      const campaignRoles =
        selectedCampaign.rule?.target_roles && selectedCampaign.rule.target_roles.length > 0
          ? selectedCampaign.rule.target_roles
          : targetRoles.length > 0
            ? targetRoles
            : ['Software Engineer'];
      const campaignLocations =
        selectedCampaign.rule?.target_locations && selectedCampaign.rule.target_locations.length > 0
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

  const startProfileRun = async () => {
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

  return { launchCampaign, startProfileRun };
}

import { api } from '../../services/api';
import type { Campaign } from '../../types';

type CampaignState = 'RUNNING' | 'PAUSED' | 'COMPLETED';

interface Options {
  selectedCampaign: Campaign | null;
  setSelectedCampaign: (c: Campaign) => void;
  campaigns: Campaign[];
  setCampaigns: (c: Campaign[]) => void;
  setBusy: (busy: boolean) => void;
  reload: (campaignId: string) => Promise<void>;
  syncForm: (c: Campaign) => void;
  clearSelection: () => void;
  showWarning: (message: string) => void;
  endDelete: () => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

/** Pause, resume and stop share one flow: call the API, record the new state, refresh pacing and logs. */
export function useCampaignTransitions(o: Options) {
  const run = async (
    call: (id: string) => Promise<unknown>,
    nextState: CampaignState,
    okMessage: string,
    failLabel: string,
    confirmMessage?: string,
  ) => {
    const campaign = o.selectedCampaign;
    if (!campaign) return;
    if (confirmMessage && !confirm(confirmMessage)) return;
    try {
      o.setBusy(true);
      await call(campaign.id);
      o.showSuccess(okMessage);
      const updated = { ...campaign, state: nextState };
      o.setSelectedCampaign(updated);
      o.setCampaigns(o.campaigns.map((c) => (c.id === updated.id ? updated : c)));
      await o.reload(campaign.id);
    } catch (err: any) {
      o.showError(`${failLabel} failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      o.setBusy(false);
    }
  };

  const remove = async () => {
    const campaign = o.selectedCampaign;
    if (!campaign) return;
    if (campaign.state === 'RUNNING' || campaign.state === 'PAUSED') {
      o.showWarning('Stop the campaign before deleting it.');
      o.endDelete();
      return;
    }
    try {
      o.setBusy(true);
      await api.deleteCampaign(campaign.id);
      const remaining = o.campaigns.filter((c) => c.id !== campaign.id);
      o.setCampaigns(remaining);
      if (remaining.length > 0) {
        o.syncForm(remaining[0]);
      } else {
        o.clearSelection();
      }
      o.showSuccess('Campaign deleted.');
    } catch (err: any) {
      o.showError(`Delete failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      o.setBusy(false);
      o.endDelete();
    }
  };

  return {
    remove,
    pause: () => run((id) => api.pauseCampaign(id), 'PAUSED', 'Campaign paused safely.', 'Pause'),
    resume: () => run((id) => api.resumeCampaign(id), 'RUNNING', 'Campaign execution resumed.', 'Resume'),
    stop: () =>
      run(
        (id) => api.stopCampaign(id),
        'COMPLETED',
        'Campaign execution stopped.',
        'Stop',
        'Are you sure you want to stop the active campaign execution?',
      ),
  };
}

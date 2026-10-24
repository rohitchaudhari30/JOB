import React, { useState } from 'react';
import { Rocket, Play, Plus, Pause, Square, RotateCcw, Sliders } from 'lucide-react';
import type { Campaign } from '../../types';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { OverflowMenu } from '../../components/ui/OverflowMenu';

interface CampaignHeaderProps {
  campaigns: Campaign[];
  selectedCampaign: Campaign | null;
  campaignActionLoading: boolean;
  syncFormFromCampaign: (c: Campaign) => void;
  setShowNewCampaignModal: (v: boolean) => void;
  handlePauseCampaignExecution: () => void | Promise<void>;
  handleResumeCampaignExecution: () => void | Promise<void>;
  handleStopCampaignExecution: () => void | Promise<void>;
  handleStartCampaignExecution: () => void | Promise<void>;
  handleSaveCampaignConfig: () => void | Promise<void>;
  setConfirmDelete: (v: boolean) => void;
}

/** Page title, campaign selector and the run-control buttons. */
export const CampaignHeader: React.FC<CampaignHeaderProps> = ({
  campaigns,
  selectedCampaign,
  campaignActionLoading,
  syncFormFromCampaign,
  setShowNewCampaignModal,
  handlePauseCampaignExecution,
  handleResumeCampaignExecution,
  handleStopCampaignExecution,
  handleStartCampaignExecution,
  handleSaveCampaignConfig,
  setConfirmDelete,
}) => {
  const [confirmStop, setConfirmStop] = useState(false);
  const canDelete = selectedCampaign?.state !== 'RUNNING' && selectedCampaign?.state !== 'PAUSED';

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800">
      <div className="flex items-center space-x-3 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs shrink-0">
          <Rocket className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight truncate">Automation Campaigns</h1>
            {selectedCampaign && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-2xs shrink-0 ${
                  selectedCampaign.state === 'RUNNING'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                    : selectedCampaign.state === 'PAUSED'
                      ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800'
                      : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedCampaign.state === 'RUNNING'
                      ? 'bg-emerald-500 animate-pulse'
                      : selectedCampaign.state === 'PAUSED'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                  }`}
                />
                {selectedCampaign.state}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Campaign Dropdown & Actions */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {campaigns.length > 0 && (
          <select
            aria-label="Select campaign"
            value={selectedCampaign?.id || ''}
            onChange={(e) => {
              const found = campaigns.find((c) => c.id === e.target.value);
              if (found) syncFormFromCampaign(found);
            }}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-xs outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[220px] sm:max-w-[260px] truncate"
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
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New campaign</span>
        </button>

        {selectedCampaign && (
          <>
            <button
              type="button"
              onClick={handleSaveCampaignConfig}
              disabled={campaignActionLoading}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-500" />
              <span>Save changes</span>
            </button>

            {selectedCampaign.state === 'RUNNING' ? (
              <>
                <button
                  type="button"
                  onClick={handlePauseCampaignExecution}
                  disabled={campaignActionLoading}
                  className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>Pause campaign</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmStop(true)}
                  disabled={campaignActionLoading}
                  className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  title="Stop this campaign"
                >
                  <Square className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Stop campaign</span>
                </button>
              </>
            ) : selectedCampaign.state === 'PAUSED' ? (
              <>
                <button
                  type="button"
                  onClick={handleResumeCampaignExecution}
                  disabled={campaignActionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Resume campaign</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmStop(true)}
                  disabled={campaignActionLoading}
                  className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  title="Stop this campaign"
                >
                  <Square className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Stop campaign</span>
                </button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartCampaignExecution}
                disabled={campaignActionLoading}
                className="shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run campaign</span>
              </Button>
            )}

            <OverflowMenu
              label="More campaign actions"
              items={[
                {
                  label: canDelete ? 'Delete campaign…' : 'Delete campaign (stop it first)',
                  danger: true,
                  disabled: !canDelete || campaignActionLoading,
                  onSelect: () => setConfirmDelete(true),
                },
              ]}
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmStop}
        title="Stop this campaign?"
        message="The campaign ends and any run it is doing stops. Applications already submitted are kept. You can run the campaign again later."
        confirmLabel="Stop campaign"
        destructive
        busy={campaignActionLoading}
        onConfirm={async () => {
          await handleStopCampaignExecution();
          setConfirmStop(false);
        }}
        onCancel={() => setConfirmStop(false)}
      />
    </div>
  );
};

import React from "react";
import {
  Rocket,
  Play,
  Plus,
  Pause,
  Square,
  RotateCcw,
  Trash2,
  Sliders,
} from "lucide-react";
import type { Campaign } from "../../types";

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
}) => (
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
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-2xs ${
                selectedCampaign.state === "RUNNING"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800"
                  : selectedCampaign.state === "PAUSED"
                    ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800"
                    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  selectedCampaign.state === "RUNNING"
                    ? "bg-emerald-500 animate-pulse"
                    : selectedCampaign.state === "PAUSED"
                      ? "bg-amber-500"
                      : "bg-slate-400"
                }`}
              />
              {selectedCampaign.state}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Persistent autonomous campaigns, declarative rules &amp; account
          safety pacing
        </p>
      </div>
    </div>

    {/* Campaign Dropdown & Actions */}
    <div className="flex flex-wrap items-center gap-2">
      {campaigns.length > 0 && (
        <select
          aria-label="Select campaign"
          value={selectedCampaign?.id || ""}
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
          {selectedCampaign.state === "RUNNING" ? (
            <>
              <button
                type="button"
                onClick={handlePauseCampaignExecution}
                disabled={campaignActionLoading}
                className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>

              <button
                type="button"
                onClick={handleStopCampaignExecution}
                disabled={campaignActionLoading}
                className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50"
                title="Stop Execution"

                aria-label="Stop Execution"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
            </>
          ) : selectedCampaign.state === "PAUSED" ? (
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
                className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50"
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
            onClick={() => setConfirmDelete(true)}
            disabled={
              campaignActionLoading ||
              selectedCampaign.state === "RUNNING" ||
              selectedCampaign.state === "PAUSED"
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
);

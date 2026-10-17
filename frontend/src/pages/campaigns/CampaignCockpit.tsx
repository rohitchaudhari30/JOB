import React from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  Briefcase,
  Zap,
  Globe,
  BarChart3,
} from "lucide-react";
import type {
  PlatformConnectionInfo,
  Campaign,
  CampaignPacingStatus,
} from "../../types";
import type { SafetySettings } from "./safetySettings";

interface CampaignCockpitProps {
  connections: PlatformConnectionInfo[];
  pacingStatus: CampaignPacingStatus | null;
  safety: SafetySettings;
  selectedCampaign: Campaign | null;
  onNavigate: (tab: any) => void;
}

/** Operational cockpit: current automation status and next action. */
export const CampaignCockpit: React.FC<CampaignCockpitProps> = ({
  connections,
  pacingStatus,
  safety,
  selectedCampaign,
  onNavigate,
}) => (
  <>
    {/* P1: Operational Cockpit - Current Automation Status & Next Action */}
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm p-5 md:p-6 relative overflow-hidden transition-all">
      {/* Subtle accent gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />

      <div className="flex flex-col space-y-5">
        {/* Top Bar: Operational Status & Execution State */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div className="flex items-center space-x-3">
            <span className="relative flex h-3 w-3">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  pacingStatus?.attention_required
                    ? "bg-amber-400"
                    : selectedCampaign?.state === "RUNNING" ||
                        pacingStatus?.active_execution_status === "RUNNING"
                      ? "bg-emerald-400"
                      : "bg-slate-400"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  pacingStatus?.attention_required
                    ? "bg-amber-500"
                    : selectedCampaign?.state === "RUNNING" ||
                        pacingStatus?.active_execution_status === "RUNNING"
                      ? "bg-emerald-500"
                      : "bg-slate-400"
                }`}
              />
            </span>
            <span className="text-xs font-black tracking-wider uppercase text-slate-700 dark:text-slate-300">
              Current Automation Status
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                pacingStatus?.attention_required
                  ? "bg-amber-50 text-amber-700 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                  : selectedCampaign?.state === "RUNNING" ||
                      pacingStatus?.active_execution_status === "RUNNING"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                    : "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              {pacingStatus?.active_execution_status ||
                selectedCampaign?.state ||
                "IDLE"}
            </span>
          </div>

          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
              Operating Window:{" "}
              <strong className="text-slate-800 dark:text-slate-100 font-mono font-bold">
                {safety.operatingStart} - {safety.operatingEnd}
              </strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
              Pacing Delay:{" "}
              <strong className="text-slate-800 dark:text-slate-100 font-mono font-bold">
                {safety.cooldownSecs}s
              </strong>
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
                    Applying to{" "}
                    <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                      {pacingStatus.active_job_title}
                    </span>
                    {pacingStatus.active_job_company && (
                      <span> at {pacingStatus.active_job_company}</span>
                    )}
                  </span>
                ) : pacingStatus?.active_execution_status === "RUNNING" ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Evaluating next qualified candidate in queue
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    Standby (Waiting for next cycle or trigger)
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] font-mono text-slate-500 dark:text-slate-400">
              {pacingStatus?.active_execution_id
                ? `Exec ID: ${pacingStatus.active_execution_id.slice(0, 8)}...`
                : "No active execution lease"}
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
                  {pacingStatus?.today_count ?? 0}{" "}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    / {safety.dailyLimit} applications
                  </span>
                </span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono">
                  {Math.round(
                    ((pacingStatus?.today_count ?? 0) /
                      (safety.dailyLimit || 1)) *
                      100,
                  )}
                  %
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round(((pacingStatus?.today_count ?? 0) / (safety.dailyLimit || 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400">
              Hourly velocity:{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold">
                {pacingStatus?.hourly_count ?? 0}/{safety.hourlyLimit}
              </strong>{" "}
              max
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
                {pacingStatus?.next_action_label ||
                  (pacingStatus?.can_apply_now
                    ? "Ready for dispatch"
                    : pacingStatus?.status_reason || "Holding cooldown")}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400 flex items-center space-x-1">
              {pacingStatus?.cooldown_remaining_seconds &&
              pacingStatus.cooldown_remaining_seconds > 0 ? (
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
          <div
            className={`p-4 rounded-xl border flex flex-col justify-between transition-colors ${
              pacingStatus?.attention_required
                ? "bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800"
                : "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60"
            }`}
          >
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider flex items-center space-x-1.5 mb-2">
                {pacingStatus?.attention_required ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-amber-800 dark:text-amber-300 font-bold">
                      Action Needed
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-800 dark:text-emerald-300 font-bold">
                      Guardian Status
                    </span>
                  </>
                )}
              </div>
              <div
                className={`text-xs font-semibold line-clamp-2 ${
                  pacingStatus?.attention_required
                    ? "text-amber-900 dark:text-amber-200"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {pacingStatus?.attention_required ||
                  "Zero blockers detected. Autopilot running in verified safe zone."}
              </div>
            </div>

            {pacingStatus?.attention_required ? (
              <div className="mt-3 pt-2 border-t border-amber-200/70 dark:border-amber-800/70 flex items-center space-x-2">
                {pacingStatus.attention_required.includes("OTP") ||
                pacingStatus.attention_required.includes("CAPTCHA") ? (
                  <button
                    type="button"
                    onClick={() => onNavigate("live_console")}
                    className="w-full px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Open Live Console</span>
                  </button>
                ) : pacingStatus.attention_required.includes("Session") ? (
                  <button
                    type="button"
                    onClick={() => onNavigate("connections")}
                    className="w-full px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Reconnect Platform</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate("live_console")}
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
  </>
);

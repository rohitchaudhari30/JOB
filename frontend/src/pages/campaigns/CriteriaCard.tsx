import React from "react";
import {
  Sparkles,
  Clock,
  Briefcase,
  MapPin,
  Sliders,
  Play,
  Zap,
  Globe,
  X,
} from "lucide-react";
import type { CandidateProfile, Resume } from "../../types";
import type { SafetySettings } from "./safetySettings";
import { FRESHNESS_OPTIONS } from "./freshness";

interface CriteriaCardProps {
  applicationMode: "AUTO" | "APPROVAL";
  freshnessHours: number;
  handleAddLocation: () => void;
  handleAddRole: () => void;
  handleRemoveLocation: (loc: string) => void;
  handleRemoveRole: (role: string) => void;
  handleStartApply: () => void | Promise<void>;
  locations: string[];
  maxApplications: number;
  minMatchScore: number;
  newLocationInput: string;
  newRoleInput: string;
  profile: CandidateProfile | null;
  resumes: Resume[];
  safety: SafetySettings;
  selectedResumeId: string;
  selectedSources: string[];
  setActiveCampaignTab: (t: "rules" | "safety" | "logs") => void;
  setApplicationMode: (m: "AUTO" | "APPROVAL") => void;
  setFreshnessHours: (n: number) => void;
  setMaxApplications: (n: number) => void;
  setMinMatchScore: (n: number) => void;
  setNewLocationInput: (v: string) => void;
  setNewRoleInput: (v: string) => void;
  setSelectedResumeId: (v: string) => void;
  starting: boolean;
  targetRoles: string[];
  toggleSource: (s: string) => void;
}

/** Search criteria form, limits and the primary Start CTA. */
export const CriteriaCard: React.FC<CriteriaCardProps> = ({
  applicationMode,
  freshnessHours,
  handleAddLocation,
  handleAddRole,
  handleRemoveLocation,
  handleRemoveRole,
  handleStartApply,
  locations,
  maxApplications,
  minMatchScore,
  newLocationInput,
  newRoleInput,
  profile,
  resumes,
  safety,
  selectedResumeId,
  selectedSources,
  setActiveCampaignTab,
  setApplicationMode,
  setFreshnessHours,
  setMaxApplications,
  setMinMatchScore,
  setNewLocationInput,
  setNewRoleInput,
  setSelectedResumeId,
  starting,
  targetRoles,
  toggleSource,
}) => (
  <>
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
                  aria-label="Close"
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
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), handleAddRole())
                }
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
                  aria-label="Close"
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
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), handleAddLocation())
                }
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
              { id: "naukri", label: "Naukri.com", type: "Portal" },
              { id: "linkedin", label: "LinkedIn", type: "Portal" },
              { id: "greenhouse", label: "Greenhouse", type: "ATS" },
              { id: "lever", label: "Lever ATS", type: "ATS" },
              { id: "workday", label: "Workday", type: "ATS" },
              { id: "ashby", label: "Ashby ATS", type: "ATS" },
            ].map((src) => {
              const isSelected = selectedSources.includes(src.id);
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => toggleSource(src.id)}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? "bg-indigo-50/70 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30"
                      : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800"
                  }`}
                >
                  <div>
                    <div
                      className={`text-xs font-bold ${isSelected ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}
                    >
                      {src.label}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{src.type}</div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
                      isSelected
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "border-slate-300 dark:border-slate-600"
                    }`}
                  >
                    {isSelected && "✓"}
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
            aria-label="Job freshness filter"
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
            Only surfaces jobs posted within this timeframe to avoid stale or
            expired openings.
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
            aria-label="Minimum match score for auto-apply"
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
              onClick={() => setApplicationMode("AUTO")}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                applicationMode === "AUTO"
                  ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30"
                  : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800"
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
              onClick={() => setApplicationMode("APPROVAL")}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                applicationMode === "APPROVAL"
                  ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30"
                  : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800"
              }`}
            >
              <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <span>🛡️ Require Approval</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Finds and pre-fills applications, pausing for your 1-click
                confirmation.
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
            aria-label="Maximum applications per run"
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
            aria-label="Resume to attach"
            value={selectedResumeId}
            onChange={(e) => setSelectedResumeId(e.target.value)}
            className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden"
          >
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.file_name} ({r.target_role || "General"}){" "}
                {r.is_default ? "★ Default" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Big Action CTA */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Click <strong>START APPLY NOW</strong> to run immediately, or set up
          24/7 background autopilot.
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveCampaignTab("safety")}
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
            <span>{starting ? "Starting Run..." : "START APPLY NOW"}</span>
          </button>
        </div>
      </div>
    </div>
  </>
);

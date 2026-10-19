import React from 'react';
import {
  Search,
  Rocket,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Building,
  MapPin,
  Check,
  X,
} from 'lucide-react';
import type { TimelineEvent } from '../../types';
import { parseEventData } from './parseEventData';

interface Props {
  evt: TimelineEvent;
  idx: number;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenOtpModal?: () => void;
  onNavigate?: (tab: string) => void;
}

export const TelemetryEventCard: React.FC<Props> = ({ evt, idx, isExpanded, onToggle, onOpenOtpModal, onNavigate }) => {
  const data = parseEventData(evt);
  const isMatch = evt.event_name.toUpperCase().includes('EVALUATED');
  const isApply = evt.event_name.toUpperCase().includes('APPLYING');
  const isSubmitted = evt.event_name.toUpperCase().includes('SUBMITTED');
  const isChallenge =
    evt.event_name.toUpperCase().includes('PAUSED') || evt.event_name.toUpperCase().includes('CHALLENGE');
  const isDiscovery = evt.event_name.toUpperCase().includes('DISCOVERY');

  // CARD 1: AI Evaluation / Match (Clean & Compact)
  if (isMatch) {
    const isAccepted = data.decision === 'AUTO_APPLY' || data.decision === 'REQUIRE_APPROVAL';
    const scoreVal = data.score ?? 0;
    const matched = data.matchedSkills || [];
    const missing = data.missingSkills || [];
    const visibleMatched = isExpanded ? matched : matched.slice(0, 3);
    const visibleMissing = isExpanded ? missing : missing.slice(0, 3);
    const hiddenCount = matched.length + missing.length - (visibleMatched.length + visibleMissing.length);

    return (
      <div
        key={idx}
        className={`p-3 rounded-2xl border transition-all shadow-2xs space-y-2 ${
          isAccepted
            ? 'bg-emerald-50/40 border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-800/60'
            : 'bg-white border-slate-200/80 dark:bg-slate-900/90 dark:border-slate-800'
        }`}
      >
        {/* Row 1: Header (Platform + Timestamp on Left, Score Badge on Right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700">
              {data.platform || 'PORTAL'}
            </span>
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">
              {new Date(evt.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 shrink-0 ${
              isAccepted
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-700'
                : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            {isAccepted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            <span>
              {scoreVal.toFixed(1)}% {data.decision || 'EVALUATED'}
            </span>
          </span>
        </div>

        {/* Row 2: Role Title & Company / Location */}
        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
            {data.jobTitle || 'Role Evaluation'}
          </h4>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {data.company && (
              <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                <Building className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate max-w-[220px]">{data.company}</span>
              </span>
            )}
            {data.location && (
              <span className="flex items-center gap-1">
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate max-w-[180px]">{data.location}</span>
              </span>
            )}
          </div>
        </div>

        {/* Row 3: Slim Score Meter */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              scoreVal >= 75 ? 'bg-emerald-500' : scoreVal >= 60 ? 'bg-indigo-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(scoreVal, 100)}%` }}
          />
        </div>

        {/* Row 4: Compact Skills Pills */}
        {(matched.length > 0 || missing.length > 0) && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {visibleMatched.map((skill, sIdx) => (
              <span
                key={`m-${sIdx}`}
                className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
              >
                +{skill}
              </span>
            ))}
            {visibleMissing.map((skill, sIdx) => (
              <span
                key={`g-${sIdx}`}
                className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
              >
                -{skill}
              </span>
            ))}
            {hiddenCount > 0 && !isExpanded && (
              <button
                type="button"
                onClick={() => onToggle()}
                className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 cursor-pointer"
              >
                +{hiddenCount} more
              </button>
            )}
          </div>
        )}

        {/* Row 5: Collapsible Reasoning Details */}
        {data.reasoning && (
          <div className="pt-0.5">
            {!isExpanded ? (
              <button
                type="button"
                onClick={() => onToggle()}
                className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
              >
                <span>Show AI Reasoning</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            ) : (
              <div className="space-y-1.5 animate-fadeIn">
                <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                  {data.reasoning}
                </p>
                <button
                  type="button"
                  onClick={() => onToggle()}
                  className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  <span>Hide Details</span>
                  <ChevronUp className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // CARD 2: Application Submitted / In Progress
  if (isSubmitted || isApply) {
    return (
      <div
        key={idx}
        className={`p-3 rounded-2xl border transition-all shadow-xs space-y-2 ${
          isSubmitted
            ? 'bg-gradient-to-r from-emerald-50/70 to-teal-50/40 border-emerald-300 dark:from-emerald-950/40 dark:to-slate-900 dark:border-emerald-800/80'
            : 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800/60 animate-pulse'
        }`}
      >
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-2">
            <span
              className={`px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-[10px] flex items-center gap-1 ${
                isSubmitted ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
              }`}
            >
              {isSubmitted ? <CheckCircle2 className="w-3 h-3" /> : <Rocket className="w-3 h-3" />}
              <span>{isSubmitted ? 'SUBMISSION CONFIRMED' : 'APPLYING NOW'}</span>
            </span>
            <span className="text-slate-400 font-mono text-[10px]">{new Date(evt.timestamp).toLocaleTimeString()}</span>
          </div>

          {data.score !== undefined && (
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full">
              Fit Score: {data.score}%
            </span>
          )}
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
            {data.jobTitle || 'Application Target'}
          </h4>
          {data.company && (
            <div className="flex items-center space-x-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
              <Building className="w-3 h-3 text-slate-400" />
              <span>{data.company}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {isSubmitted ? 'Application record saved to CRM' : 'Filling candidate profile via browser...'}
          </span>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('crm')}
              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View in CRM</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // CARD 3: Challenge Detected
  if (isChallenge) {
    return (
      <div
        key={idx}
        className="p-3 rounded-2xl bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/80 shadow-xs space-y-2 animate-bounce-subtle"
      >
        <div className="flex items-center justify-between text-[11px]">
          <span className="px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-[10px] bg-amber-500 text-white flex items-center gap-1">
            <KeyRound className="w-3 h-3" />
            <span>CHALLENGE DETECTED</span>
          </span>
          <span className="text-amber-700 dark:text-amber-300 font-mono text-[10px]">
            {new Date(evt.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{evt.message}</p>

        {onOpenOtpModal && (
          <button
            type="button"
            onClick={onOpenOtpModal}
            className="w-full py-1.5 px-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            Enter OTP / Resume Automation
          </button>
        )}
      </div>
    );
  }

  // CARD 4: Discovery Completed
  if (isDiscovery) {
    return (
      <div
        key={idx}
        className="p-3 rounded-2xl bg-sky-50/60 border border-sky-200 dark:bg-sky-950/20 dark:border-sky-800/60 shadow-xs space-y-1.5"
      >
        <div className="flex items-center justify-between text-[11px]">
          <span className="px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300 flex items-center gap-1">
            <Search className="w-3 h-3" />
            <span>DISCOVERY SYNC</span>
          </span>
          <span className="text-slate-400 font-mono text-[10px]">{new Date(evt.timestamp).toLocaleTimeString()}</span>
        </div>

        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{evt.message}</p>

        {evt.stats && (
          <div className="flex items-center space-x-3 text-[10px] text-slate-600 dark:text-slate-400 pt-1 border-t border-sky-100 dark:border-sky-900/40">
            <span>
              Found: <strong>{evt.stats.discovered}</strong>
            </span>
            <span>
              Matched: <strong>{evt.stats.matched}</strong>
            </span>
            <span>
              Applied: <strong>{evt.stats.applied}</strong>
            </span>
          </div>
        )}
      </div>
    );
  }

  // Fallback Generic System Event
  return (
    <div
      key={idx}
      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 dark:bg-slate-950/80 dark:border-slate-800/80 space-y-1 shadow-2xs"
    >
      <div className="flex items-center justify-between text-[10px]">
        <span className="px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700 font-bold border border-slate-300/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          {evt.event_name}
        </span>
        <span className="text-slate-400 font-mono">{new Date(evt.timestamp).toLocaleTimeString()}</span>
      </div>
      <div className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed font-sans">{evt.message}</div>
    </div>
  );
};

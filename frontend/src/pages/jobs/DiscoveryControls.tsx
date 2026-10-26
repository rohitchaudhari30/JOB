import React, { useState, useRef, useEffect } from 'react';
import { Compass, Sparkles, ChevronDown, Check, Globe } from 'lucide-react';

interface DiscoveryControlsProps {
  expYears: number;
  expMonths: number;
  handleTriggerDiscovery: () => void | Promise<void>;
  isDiscovering: boolean;
  location: string;
  platform: string;
  platforms?: string[];
  roles: string;
  setExpYears: (v: number) => void;
  setExpMonths: (v: number) => void;
  setLocation: (v: string) => void;
  setPlatform: (v: string) => void;
  setPlatforms?: (val: string[]) => void;
  setRoles: (v: string) => void;
}

export const PORTAL_ITEMS = [
  { id: 'naukri', label: 'Naukri.com', tag: 'India' },
  { id: 'linkedin', label: 'LinkedIn Jobs', tag: 'Global' },
];

const ALL_IDS = PORTAL_ITEMS.map((p) => p.id);

/** Clean, modern single-row job search bar with multi-portal popover selection. */
export const DiscoveryControls: React.FC<DiscoveryControlsProps> = ({
  expYears,
  expMonths,
  handleTriggerDiscovery,
  isDiscovering,
  location,
  platform,
  platforms = ALL_IDS,
  roles,
  setExpYears,
  setExpMonths,
  setLocation,
  setPlatform,
  setPlatforms,
  setRoles,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isAll = platform === 'all' || platforms.length === ALL_IDS.length;
  const activeList = isAll ? ALL_IDS : platforms;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const togglePortal = (id: string) => {
    let next: string[];
    if (isAll) {
      next = ALL_IDS.filter((p) => p !== id);
    } else if (activeList.includes(id)) {
      next = activeList.filter((p) => p !== id);
      if (next.length === 0) next = [id]; // keep at least 1
    } else {
      next = [...activeList, id];
    }

    if (next.length === ALL_IDS.length) {
      setPlatform('all');
      setPlatforms?.(ALL_IDS);
    } else {
      setPlatform(next[0] || 'naukri');
      setPlatforms?.(next);
    }
  };

  const selectAll = () => {
    setPlatform('all');
    setPlatforms?.(ALL_IDS);
  };

  const getDisplayText = () => {
    if (isAll) return 'All Portals (Naukri & LinkedIn)';
    if (activeList.length === 1) {
      const found = PORTAL_ITEMS.find((p) => p.id === activeList[0]);
      return found ? found.label : activeList[0];
    }
    return 'All Portals (Naukri & LinkedIn)';
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 space-y-3.5 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
              Find new jobs
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Discover roles across Naukri and LinkedIn job portals
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-800/80">
            <Sparkles className="w-3 h-3 text-indigo-500" />
            <span>Profile-Grounded</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Engine Ready</span>
          </span>
        </div>
      </div>

      {/* Form Controls Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end pt-0.5">
        {/* Source Platform Multi-Select Popover */}
        <div className="md:col-span-3 space-y-1.5 relative" ref={popoverRef}>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Source Platform
          </label>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            onClick={() => setIsOpen(!isOpen)}
            className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white flex items-center justify-between shadow-xs hover:border-slate-300 dark:hover:border-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none transition cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              {isAll ? (
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
              <span className={`truncate ${isAll ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}`}>
                {getDisplayText()}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Clean Floating Popover */}
          {isOpen && (
            <div className="absolute z-40 top-full left-0 mt-1.5 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 space-y-1 animate-fadeIn">
              <div className="flex items-center justify-between px-2.5 py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Select Portals ({activeList.length}/2)
                </span>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-indigo-600 dark:text-indigo-400 font-bold text-[11px] hover:underline cursor-pointer"
                >
                  Select Both
                </button>
              </div>

              {/* Portal Checklist */}
              <div className="space-y-0.5 pt-1">
                {PORTAL_ITEMS.map((portal) => {
                  const checked = isAll || activeList.includes(portal.id);
                  return (
                    <button
                      key={portal.id}
                      type="button"
                      onClick={() => togglePortal(portal.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition cursor-pointer text-left ${
                        checked
                          ? 'bg-indigo-50/70 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200 font-semibold'
                          : 'hover:bg-slate-50 text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center transition ${
                            checked
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="truncate">{portal.label}</span>
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 shrink-0">
                        {portal.tag}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Target Roles */}
        <div className="md:col-span-3 space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Target Job Title / Roles
          </label>
          <input
            type="text"
            value={roles}
            onChange={(e) => setRoles(e.target.value)}
            placeholder="e.g. Data Engineer, Analyst"
            className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition shadow-xs"
          />
        </div>

        {/* Locations */}
        <div className="md:col-span-2 space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Locations
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Pune, Mumbai"
            className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition shadow-xs"
          />
        </div>

        {/* Experience Target: Unified 1-Section Years & Months */}
        <div className="md:col-span-2 space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            Experience
          </label>
          <div className="flex items-center h-10 w-full rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 shadow-xs focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent focus-within:bg-white dark:focus-within:bg-slate-900 transition overflow-hidden">
            <div className="flex-1 flex items-center justify-center px-1">
              <input
                type="number"
                min={0}
                max={30}
                value={expYears}
                onChange={(e) => setExpYears(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full text-center text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-none p-0"
                title="Years of experience"
                placeholder="0"
              />
              <span className="text-[11px] font-bold text-slate-400 select-none pointer-events-none ml-0.5">yr</span>
            </div>
            <div className="h-4 w-px bg-slate-300/70 dark:bg-slate-600/70 shrink-0"></div>
            <div className="flex-1 flex items-center justify-center px-1">
              <input
                type="number"
                min={0}
                max={11}
                value={expMonths}
                onChange={(e) => setExpMonths(Math.min(11, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                className="w-full text-center text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-none p-0"
                title="Months of experience (0-11)"
                placeholder="0"
              />
              <span className="text-[11px] font-bold text-slate-400 select-none pointer-events-none ml-0.5">mo</span>
            </div>
          </div>
        </div>

        {/* Find Jobs Button */}
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={handleTriggerDiscovery}
            disabled={isDiscovering}
            className="w-full h-10 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-md shadow-indigo-600/25 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDiscovering ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"></div>
                <span className="text-white font-bold">Searching...</span>
              </>
            ) : (
              <>
                <Compass className="w-4 h-4 text-white shrink-0" />
                <span className="text-white font-bold">Search Jobs</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Compass, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface DiscoveryControlsProps {
  experience: number;
  handleTriggerDiscovery: () => void | Promise<void>;
  isDiscovering: boolean;
  location: string;
  platform: string;
  roles: string;
  setExperience: (v: number) => void;
  setLocation: (v: string) => void;
  setPlatform: (v: string) => void;
  setRoles: (v: string) => void;
}

/** Platform, roles, location and experience inputs with the Discover button. */
export const DiscoveryControls: React.FC<DiscoveryControlsProps> = ({
  experience,
  handleTriggerDiscovery,
  isDiscovering,
  location,
  platform,
  roles,
  setExperience,
  setLocation,
  setPlatform,
  setRoles,
}) => (
  <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 space-y-3.5 shadow-xs">
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
            Search a job site for roles that match what you are looking for
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Live Engine Ready</span>
        </span>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end pt-0.5">
      {/* Platform */}
      <div className="md:col-span-3 space-y-1.5">
        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Source Platform
        </label>
        <select
          aria-label="Job platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs cursor-pointer"
        >
          <option value="naukri">Naukri.com</option>
          <option value="linkedin">LinkedIn Jobs</option>
          <option value="greenhouse">Greenhouse Boards</option>
          <option value="lever">Lever Boards</option>
          <option value="workday">Workday Portals</option>
          <option value="ashby">Ashby Boards</option>
        </select>
      </div>

      {/* Roles */}
      <div className="md:col-span-3 space-y-1.5">
        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Target Roles / Titles
        </label>
        <input
          type="text"
          value={roles}
          onChange={(e) => setRoles(e.target.value)}
          placeholder="e.g. Data Engineer, Python Developer"
          className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
        />
      </div>

      {/* Locations */}
      <div className="md:col-span-2 space-y-1.5">
        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Target Locations
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Pune, Mumbai"
          className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
        />
      </div>

      {/* Experience */}
      <div className="md:col-span-2 space-y-1.5">
        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Experience
        </label>
        <div className="relative flex items-center">
          <input
            type="number"
            min={0}
            max={35}
            value={experience}
            onChange={(e) => setExperience(Number(e.target.value))}
            placeholder="2"
            className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
          />
          <span className="absolute right-3 text-xs font-semibold text-slate-400 dark:text-slate-500 pointer-events-none">
            Yrs
          </span>
        </div>
      </div>

      {/* Discover Button */}
      <div className="md:col-span-2">
        <Button variant="primary" size="sm" className="w-full h-10"
          onClick={handleTriggerDiscovery}
          disabled={isDiscovering}>
          <Sparkles className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
          <span className="truncate">
            {isDiscovering
              ? `Scanning ${platform === 'linkedin' ? 'LinkedIn' : platform === 'naukri' ? 'Naukri' : platform}...`
              : 'Find Fresh Jobs'}
          </span>
        </Button>
      </div>
    </div>
  </div>
);

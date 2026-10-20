import React from 'react';
import { Activity, Calendar, Clock, ShieldCheck, Sliders } from 'lucide-react';
import { SafetySettings, SchedulePreset } from './safetySettings';
import { Button } from '../../components/ui/Button';

interface SafetyScheduleTabProps {
  settings: SafetySettings;
  saving: boolean;
  onChange: (patch: Partial<SafetySettings>) => void;
  onSave: () => void;
}

export const SafetyScheduleTab: React.FC<SafetyScheduleTabProps> = ({ settings, saving, onChange, onSave }) => (
    <div className="space-y-6">
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Schedule &amp; Safety Policy Configuration
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Recurring execution cadence, account protection, cooldown intervals, velocity limits, and daily operating windows
              </p>
            </div>
          </div>
          <Button variant="primary" size="sm"
            onClick={onSave}
            disabled={saving}>
            <Sliders className="w-3.5 h-3.5" />
            <span>Save Schedule &amp; Safety Policy</span>
          </Button>
        </div>

        {/* Recurring Execution Cadence (Background Autopilot) */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                <span>Recurring Execution Cadence (Background Autopilot)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Choose how frequently the autonomous worker wakes up to discover matching jobs and submit applications.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {settings.schedulePreset === 'manual' ? 'Manual Only' : 'Autopilot Active'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
            {[
              { id: 'manual', label: 'Manual Only', desc: 'Trigger on-demand' },
              { id: '3hours', label: 'Every 3 Hours', desc: 'Continuous stream (Recommended)' },
              { id: 'morning', label: 'Weekdays 9 AM', desc: 'Recruiter morning peak' },
              { id: 'evening', label: 'Daily 7 PM', desc: 'Evening sync' },
              { id: 'custom', label: 'Custom Interval', desc: 'User-defined frequency' },
            ].map((preset) => {
              const active = settings.schedulePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChange({ schedulePreset: preset.id as SchedulePreset })}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/25'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="text-xs font-bold">{preset.label}</div>
                  <div className={`text-[10px] mt-1 ${active ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {preset.desc}
                  </div>
                </button>
              );
            })}
          </div>

          {settings.schedulePreset === 'custom' && (
            <div className="pt-2 flex items-center space-x-3">
              <label htmlFor="sched-interval" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Run Every (minutes):
              </label>
              <input
                id="sched-interval"
                type="number"
                min="30"
                max="1440"
                step="15"
                value={settings.scheduleIntervalMins}
                onChange={(e) => onChange({ scheduleIntervalMins: Math.max(15, Number(e.target.value)) })}
                className="w-32 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-500">
                ({Math.round(settings.scheduleIntervalMins / 60 * 10) / 10} hours)
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Limit */}
          <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <label htmlFor="safety-daily" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Daily Application Limit</span>
              </label>
              <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                {settings.dailyLimit} apps / day
              </span>
            </div>
            <input
              id="safety-daily"
              type="number"
              min="1"
              max="100"
              value={settings.dailyLimit}
              onChange={(e) => onChange({ dailyLimit: Number(e.target.value) })}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Maximum total submissions allowed per 24 hours across all job boards to keep recruiter standing natural.
            </p>
          </div>

          {/* Hourly Velocity */}
          <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <label htmlFor="safety-hourly" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                <Activity className="w-4 h-4 text-indigo-500" />
                <span>Hourly Velocity Cap</span>
              </label>
              <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                {settings.hourlyLimit} apps / hour
              </span>
            </div>
            <input
              id="safety-hourly"
              type="number"
              min="1"
              max="20"
              value={settings.hourlyLimit}
              onChange={(e) => onChange({ hourlyLimit: Number(e.target.value) })}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Prevents bursts of submissions within any rolling 60-minute window.
            </p>
          </div>

          {/* Cooldown Interval */}
          <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <label htmlFor="safety-cooldown" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Cooldown Between Applications</span>
              </label>
              <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                {settings.cooldownSecs} seconds ({Math.round(settings.cooldownSecs / 60 * 10) / 10} min)
              </span>
            </div>
            <input
              id="safety-cooldown"
              type="number"
              min="30"
              max="600"
              step="15"
              value={settings.cooldownSecs}
              onChange={(e) => onChange({ cooldownSecs: Number(e.target.value) })}
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Deliberate pause between successive browser sessions for account safety and rate moderation.
            </p>
          </div>

          {/* Operating Window */}
          <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-sky-500" />
                <span>Permitted Operating Window</span>
              </label>
              <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                {settings.operatingStart} - {settings.operatingEnd}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="safety-start" className="text-[10px] font-bold text-slate-500 uppercase">Start time</label>
                <input
                  id="safety-start"
                  type="time"
                  value={settings.operatingStart}
                  onChange={(e) => onChange({ operatingStart: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="safety-end" className="text-[10px] font-bold text-slate-500 uppercase">End time</label>
                <input
                  id="safety-end"
                  type="time"
                  value={settings.operatingEnd}
                  onChange={(e) => onChange({ operatingEnd: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Applications will only execute during these active recruiter business hours.
            </p>
          </div>
        </div>

        {/* Account Protection Explanatory Box */}
        <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/60 flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 dark:text-emerald-300 space-y-1">
            <div className="font-bold">Enterprise Safety &amp; Integrity Compliance</div>
            <p className="text-[11px] text-emerald-800/80 dark:text-emerald-400/80">
              AutoApply.ai enforces server-side rate limits, daily caps, and operating windows to ensure high recruiter delivery rates, prevent spam flagging, and guarantee account health across job boards. CAPTCHAs and OTPs always trigger human intervention.
            </p>
          </div>
        </div>
      </div>
    </div>
);

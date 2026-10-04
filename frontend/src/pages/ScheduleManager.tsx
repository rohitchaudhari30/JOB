import React, { useEffect, useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { ScheduleJobConfig } from '../types';
import { useToast } from '../context/ToastContext';

export const ScheduleManager: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const [schedules, setSchedules] = useState<ScheduleJobConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [sourceType, setSourceType] = useState('naukri');
  const [roles, setRoles] = useState('Senior Backend Engineer');
  const [locations, setLocations] = useState('Bengaluru, Remote');
  const [intervalMinutes, setIntervalMinutes] = useState(180);
  const [cronExpression, setCronExpression] = useState('');
  const [useCron, setUseCron] = useState(false);
  const [autoApply, setAutoApply] = useState(true);
  const [maxApps, setMaxApps] = useState(10);

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const data = await api.listSchedules();
      setSchedules(data);
    } catch (e) {
      console.error('Failed to load schedules:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreating(true);
      const rolesList = roles.split(',').map((r) => r.trim()).filter(Boolean);
      const locList = locations.split(',').map((l) => l.trim()).filter(Boolean);

      await api.createSchedule({
        source_type: sourceType,
        roles: rolesList,
        locations: locList,
        cron_expression: useCron ? cronExpression : undefined,
        interval_minutes: !useCron ? Number(intervalMinutes) : undefined,
        auto_apply: autoApply,
        max_applications_per_run: Number(maxApps),
      });

      showSuccess('Schedule registered successfully!');
      loadSchedules();
    } catch (e: any) {
      showError(`Failed to create schedule: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to cancel this automation schedule?')) return;
    try {
      await api.deleteSchedule(scheduleId);
      setSchedules(schedules.filter((s) => s.schedule_id !== scheduleId));
      showSuccess('Schedule cancelled and removed');
    } catch (e: any) {
      showError(`Delete failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn w-full">
      <div className="flex items-center justify-between p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-2">
          <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Automation Rules &amp; Background Schedules</h1>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
          APScheduler Worker Active
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create Schedule Form */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-800 space-y-4 shadow-sm">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center space-x-2">
            <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Create New Schedule</span>
          </h2>

          <form onSubmit={handleCreateSchedule} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Source Platform</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
              >
                <option value="naukri">Naukri.com</option>
                <option value="linkedin">LinkedIn</option>
                <option value="greenhouse">Greenhouse ATS</option>
                <option value="lever">Lever ATS</option>
                <option value="workday">Workday</option>
                <option value="ashby">Ashby</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Target Roles</label>
              <input
                type="text"
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Locations</label>
              <input
                type="text"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="e.g. Bengaluru, Remote"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
              />
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center space-x-3 text-xs text-slate-700 dark:text-slate-300">
                <label className="flex items-center space-x-1.5 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={!useCron}
                    onChange={() => setUseCron(false)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Interval (Mins)</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={useCron}
                    onChange={() => setUseCron(true)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Cron Expression</span>
                </label>
              </div>

              {!useCron ? (
                <input
                  type="number"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  placeholder="e.g. 180"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
                />
              ) : (
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 9 * * 1-5 (Mon-Fri 9AM)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Max Apps / Run</label>
              <input
                type="number"
                value={maxApps}
                onChange={(e) => setMaxApps(Number(e.target.value))}
                className="w-20 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 text-right dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
              />
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition-transform active:scale-95 disabled:opacity-50 mt-2 cursor-pointer"
            >
              {isCreating ? 'Registering...' : 'Register Automation Job'}
            </button>
          </form>
        </div>

        {/* Existing Schedules List */}
        <div className="md:col-span-2 p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-800 space-y-4 shadow-sm">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Active Automated Schedules ({schedules.length})</span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono">Running</span>
          </h2>

          {loading ? (
            <div className="text-center py-12 text-slate-500 text-xs">Loading schedules...</div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
              No active automation schedules. Configure one on the left to automate recurrent job searches.
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((s) => (
                <div
                  key={s.schedule_id}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700 transition-all flex items-center justify-between shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30">
                        {s.source_type}
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{s.roles.join(', ')}</span>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-3">
                      <span>Loc: {s.locations.join(', ') || 'Any'}</span>
                      {s.interval_minutes ? (
                        <span>Repeat: Every {s.interval_minutes} mins</span>
                      ) : (
                        <span>Cron: {s.cron_expression}</span>
                      )}
                      <span>Max: {s.max_applications_per_run} apps</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteSchedule(s.schedule_id)}
                    className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Delete Schedule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

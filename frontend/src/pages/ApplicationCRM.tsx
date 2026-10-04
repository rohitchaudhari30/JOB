import React, { useEffect, useState } from 'react';
import {
  KanbanSquare,
  Camera,
} from 'lucide-react';
import { api } from '../services/api';
import { Application, WorkflowState } from '../types';
import { useToast } from '../context/ToastContext';

export const ApplicationCRM: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const data = await api.listApplications();
      setApplications(data);
    } catch (e) {
      console.error('Failed to load applications:', e);
    } finally {
      setLoading(false);
    }
  };

  const columns: { title: string; states: WorkflowState[]; color: string; badgeColor: string }[] = [
    {
      title: 'Discovered & Matched',
      states: ['DISCOVERED', 'MATCHED', 'SHORTLISTED'],
      color: 'bg-slate-50 border-slate-200 dark:bg-slate-900/50 dark:border-slate-800/80',
      badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    },
    {
      title: 'Approval Required',
      states: ['APPROVAL_REQUIRED', 'QUESTIONS_PENDING'],
      color: 'bg-amber-50/50 border-amber-200/60 dark:bg-slate-900/50 dark:border-slate-800/80',
      badgeColor: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30',
    },
    {
      title: 'Applying / In Progress',
      states: ['APPROVED', 'APPLYING', 'FORM_DETECTED', 'FORM_FILLED', 'SUBMITTING'],
      color: 'bg-indigo-50/40 border-indigo-200/60 dark:bg-slate-900/50 dark:border-slate-800/80',
      badgeColor: 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30',
    },
    {
      title: 'Successfully Applied',
      states: ['APPLIED'],
      color: 'bg-emerald-50/50 border-emerald-200/60 dark:bg-slate-900/50 dark:border-slate-800/80',
      badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
    },
    {
      title: 'Paused / Challenges',
      states: ['PAUSED_OTP', 'PAUSED_CAPTCHA', 'PAUSED_USER_INPUT'],
      color: 'bg-purple-50/50 border-purple-200/60 dark:bg-slate-900/50 dark:border-slate-800/80',
      badgeColor: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30',
    },
    {
      title: 'Failed / Aborted',
      states: ['FAILED', 'SKIPPED', 'REJECTED'],
      color: 'bg-rose-50/40 border-rose-200/60 dark:bg-slate-900/50 dark:border-slate-800/80',
      badgeColor: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30',
    },
  ];

  const handleApprove = async (appId: string) => {
    try {
      await api.approveApplication(appId, true);
      showSuccess('Application approved and execution started!');
      loadApplications();
    } catch (e: any) {
      showError(`Approval failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-2">
          <KanbanSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Application Pipeline &amp; Audit CRM</h1>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
          Total Tracked: {applications.length} applications
        </span>
      </div>

      {/* Kanban Board Container */}
      {loading ? (
        <div className="text-center py-20 text-slate-500 text-xs">Loading applications pipeline...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const colApps = applications.filter((a) => col.states.includes(a.workflow_state));

            return (
              <div key={col.title} className={`flex flex-col rounded-3xl border p-2 min-h-[500px] shadow-xs ${col.color}`}>
                <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{col.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badgeColor}`}>
                    {colApps.length}
                  </span>
                </div>

                <div className="flex-1 p-2 space-y-3 overflow-y-auto">
                  {colApps.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-600 text-xs">No applications</div>
                  ) : (
                    colApps.map((app) => (
                      <div
                        key={app.id}
                        className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700 transition-all space-y-2.5 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-slate-400">#{app.id.slice(-6)}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${col.badgeColor}`}
                          >
                            {app.workflow_state}
                          </span>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">Job #{app.job_id.slice(-6)}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {app.applied_at ? `Applied ${new Date(app.applied_at).toLocaleDateString()}` : `Created ${new Date(app.created_at).toLocaleDateString()}`}
                          </div>
                        </div>

                        {/* Questions count */}
                        {app.questions.length > 0 && (
                          <div className="text-[10px] text-indigo-700 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40 px-2 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                            {app.questions.length} Screening Q&amp;A answered
                          </div>
                        )}

                        {/* Failure reason if any */}
                        {app.failure_reason && (
                          <div className="text-[10px] text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-200 dark:border-rose-900/40 line-clamp-2">
                            {app.failure_reason}
                          </div>
                        )}

                        {/* Actions & Artifacts */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          {app.workflow_state === 'APPROVAL_REQUIRED' && (
                            <button
                              onClick={() => handleApprove(app.id)}
                              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] shadow-sm transition-transform active:scale-95 cursor-pointer"
                            >
                              Approve
                            </button>
                          )}

                          {app.screenshot_file_path && (
                            <button
                              onClick={() => setSelectedScreenshot(app.screenshot_file_path!)}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                              title="View Failure Screenshot"
                            >
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {app.trace_file_path && (
                            <span className="text-[10px] text-slate-400 font-mono" title={app.trace_file_path}>
                              trace.zip
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Screenshot Preview Modal */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-4xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Application Screenshot Artifact</h3>
              <button
                onClick={() => setSelectedScreenshot(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              >
                Close Preview
              </button>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-mono break-all">
              Path: {selectedScreenshot}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

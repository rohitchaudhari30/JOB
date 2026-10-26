import React from 'react';
import { Table as TableIcon } from 'lucide-react';
import { ChevronDown, ArrowUpDown, Briefcase } from 'lucide-react';
import type { Application } from '../../types';
import { Pagination } from '../../components/ui/Pagination';
import { ApplicationRow } from './ApplicationRow';
import { Skeleton } from '../../components/ui/Skeleton';
type RowProps = React.ComponentProps<typeof ApplicationRow>;

interface Props {
  loading: boolean;
  applications: Application[];
  filteredApplications: Application[];
  paginatedApplications: Application[];
  matchScores: Map<string, number>;
  expandedReasonId: string | null;
  setExpandedReasonId: (id: string | null) => void;
  sortColumn: 'date' | 'match' | 'status';
  setSortColumn: (c: 'date' | 'match' | 'status') => void;
  sortDirection: 'asc' | 'desc';
  setSortDirection: (d: 'asc' | 'desc') => void;
  currentPage: number;
  setCurrentPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  setSelectedFilter: (v: string) => void;
  setSearchQuery: (v: string) => void;
  setCompanyFilter: (v: string) => void;
  setMinMatchFilter: (v: number) => void;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
  openDrawer: RowProps['onOpen'];
  handleApprove: RowProps['onApprove'];
  handleReject: RowProps['onReject'];
  handleRetry: RowProps['onRetry'];
  setSelectedAppForRationale: RowProps['onRationale'];
  setSelectedAppForReconciliation: RowProps['onReconcile'];
  openScreenshotPreview: RowProps['onScreenshot'];
  selectedAppId?: string | null;
  onNavigate: ((tab: any) => void) | undefined;
}

export const ApplicationsTable: React.FC<Props> = ({
  loading,
  selectedAppId,
  applications,
  filteredApplications,
  paginatedApplications,
  matchScores,
  expandedReasonId,
  setExpandedReasonId,
  sortColumn,
  setSortColumn,
  sortDirection,
  setSortDirection,
  currentPage,
  setCurrentPage,
  pageSize,
  setPageSize,
  setSelectedFilter,
  setSearchQuery,
  setCompanyFilter,
  setMinMatchFilter,
  setFromDate,
  setToDate,
  openDrawer,
  handleApprove,
  handleReject,
  handleRetry,
  setSelectedAppForRationale,
  setSelectedAppForReconciliation,
  openScreenshotPreview,
  onNavigate,
}) => (
  <>
    {/* Application Pipeline Table View */}
    {loading ? (
      <div className="text-center py-24 text-slate-400 dark:text-slate-500 text-xs">
        Loading applications pipeline...
      </div>
    ) : filteredApplications.length === 0 ? (
      <div className="text-center py-20 px-4 space-y-2">
        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
          <TableIcon className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No applications match filter</p>
        <p className="text-[11px] text-slate-400">
          Try switching the status filter to &quot;All&quot; or clearing your filter criteria.
        </p>
        <button type="button"
          onClick={() => {
            setSelectedFilter('All');
            setSearchQuery('');
            setCompanyFilter('');
            setMinMatchFilter(0);
            setFromDate('');
            setToDate('');
          }}
          className="mt-2 inline-flex items-center px-3 py-1.5 text-xs rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 font-medium hover:bg-indigo-100 transition-colors cursor-pointer"
        >
          Reset All Filters
        </button>
      </div>
    ) : (
      <>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500 select-none">
                <th className="py-3 px-4 font-semibold">Position</th>
                <th className="py-3 px-4 font-semibold">Location</th>
                <th className="py-3 px-4 font-semibold">Exp</th>
                <th className="py-3 px-4 font-semibold">Salary</th>
                <th
                  onClick={() => {
                    setSortColumn('status');
                    setSortDirection(sortColumn === 'status' && sortDirection === 'desc' ? 'asc' : 'desc');
                  }}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none"
                >
                  <span className="inline-flex items-center space-x-1">
                    <span>Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </span>
                </th>
                <th
                  onClick={() => {
                    setSortColumn('match');
                    setSortDirection(sortColumn === 'match' && sortDirection === 'desc' ? 'asc' : 'desc');
                  }}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none"
                >
                  <span className="inline-flex items-center space-x-1">
                    <span>Match</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </span>
                </th>
                <th
                  onClick={() => {
                    setSortColumn('date');
                    setSortDirection(sortColumn === 'date' && sortDirection === 'desc' ? 'asc' : 'desc');
                  }}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none"
                >
                  <span className="inline-flex items-center space-x-1">
                    <span>Date</span>
                    <ChevronDown
                      className={`w-3 h-3 text-slate-400 transition-transform ${
                        sortColumn === 'date' && sortDirection === 'asc' ? 'rotate-180' : ''
                      }`}
                    />
                  </span>
                </th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {loading ? (
                Array.from({ length: pageSize || 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3 px-4"><Skeleton className="h-4 w-4 rounded" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-36 rounded" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-28 rounded" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-20 rounded" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-12 rounded" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-16 rounded" /></td>
                    <td className="py-3 px-4 text-right"><Skeleton className="h-7 w-20 rounded-lg ml-auto" /></td>
                  </tr>
                ))
              ) : paginatedApplications.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 px-4 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400 shadow-2xs">
                        <Briefcase className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          {applications.length === 0
                            ? 'No Applications Recorded Yet'
                            : 'No Matching Applications Found'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {applications.length === 0
                            ? 'The automated engine has not submitted any applications yet. Discover jobs or launch an auto-apply campaign to get started.'
                            : 'No applications match your active filters or search term. Try resetting your filters to see all records.'}
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-1">
                        {applications.length === 0 && onNavigate ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onNavigate('discovery')}
                              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                            >
                              Discover Jobs
                            </button>
                            <button
                              type="button"
                              onClick={() => onNavigate('direct_apply')}
                              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              Start Auto-Apply
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFilter('All');
                              setSearchQuery('');
                              setCompanyFilter('');
                              setMinMatchFilter(0);
                              setFromDate('');
                              setToDate('');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                          >
                            Reset All Filters
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedApplications.map((app) => (
                  <ApplicationRow
                    key={app.id}
                    app={app}
                    isSelected={selectedAppId === app.id}
                    fallbackScore={matchScores.get(app.job_id)}
                    isExpanded={expandedReasonId === app.id}
                    onToggleReason={setExpandedReasonId}
                    onOpen={openDrawer}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onRetry={handleRetry}
                    onRationale={setSelectedAppForRationale}
                    onReconcile={setSelectedAppForReconciliation}
                    onScreenshot={openScreenshotPreview}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={filteredApplications.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          onResetFilters={
            filteredApplications.length !== applications.length
              ? () => {
                  setSelectedFilter('All');
                  setSearchQuery('');
                  setCompanyFilter('');
                  setMinMatchFilter(0);
                  setFromDate('');
                  setToDate('');
                }
              : undefined
          }
        />
      </>
    )}
  </>
);

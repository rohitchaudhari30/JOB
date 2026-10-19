import React from 'react';
import { Clock, Sliders, Activity } from 'lucide-react';

interface Props {
  activeCampaignTab: 'rules' | 'safety' | 'logs';
  setActiveCampaignTab: (tab: 'rules' | 'safety' | 'logs') => void;
  logCount: number;
}

export const CampaignTabBar: React.FC<Props> = ({ activeCampaignTab, setActiveCampaignTab, logCount }) => (
  <>
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 text-xs font-bold">
        <button type="button"
          onClick={() => setActiveCampaignTab('rules')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeCampaignTab === 'rules'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Targeting &amp; Declarative Rules</span>
        </button>

        <button type="button"
          onClick={() => setActiveCampaignTab('safety')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeCampaignTab === 'safety'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Schedule &amp; Safety Policy</span>
        </button>

        <button type="button"
          onClick={() => setActiveCampaignTab('logs')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeCampaignTab === 'logs'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Activity Stream ({logCount})</span>
        </button>
      </div>
  </>
);

import React from 'react';
import { AlertCircle, Camera, RefreshCw } from 'lucide-react';

interface ScreenshotModalProps {
  appId: string;
  path: string;
  imageUrl: string | null;
  loading: boolean;
  onClose: () => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({ appId, path, imageUrl, loading, onClose }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-6 animate-fadeIn">
    <div className="max-w-4xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Camera className="w-5 h-5 text-indigo-500" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Application Step Screenshot</h3>
        </div>
        <button
          onClick={onClose}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          Close Preview
        </button>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center min-h-[300px] bg-slate-950/5 dark:bg-slate-950 rounded-2xl p-2 border border-slate-200 dark:border-slate-800">
        {loading ? (
          <div className="flex flex-col items-center justify-center space-y-2 text-slate-400 py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
            <span className="text-xs">Loading screenshot artifact...</span>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Application Execution Screenshot"
            className="max-h-[65vh] w-auto max-w-full rounded-xl object-contain shadow-sm"
          />
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2 text-slate-400 py-12">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <span className="text-xs font-medium">Screenshot file could not be displayed or was pruned.</span>
          </div>
        )}
      </div>

      <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-mono break-all flex items-center justify-between">
        <span>Path: {path}</span>
        {imageUrl && (
          <a
            href={imageUrl}
            download={`screenshot_${appId}.png`}
            className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 font-bold ml-4 shrink-0"
          >
            Download Image
          </a>
        )}
      </div>
    </div>
  </div>
);

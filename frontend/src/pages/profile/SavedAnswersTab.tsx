import React from 'react';
import { Check } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface SavedAnswersTabProps {
  savedAnswers: any[];
  onChange: (answers: any[]) => void;
}

interface ScreeningIntentConfig {
  intent: string;
  label: string;
  category: string;
  defaultPattern: string;
  presets: string[];
}

const STANDARD_SCREENING_INTENTS: ScreeningIntentConfig[] = [
  {
    intent: 'work_authorization',
    label: 'Are you legally authorized to work in this location?',
    category: 'Work Authorization',
    defaultPattern: 'authorized to work',
    presets: ['Yes, Indian Citizen (No Visa Needed)', 'Yes, authorized without sponsorship', 'No, require sponsorship'],
  },
  {
    intent: 'visa_sponsorship',
    label: 'Will you require visa sponsorship now or in the future?',
    category: 'Visa Sponsorship',
    defaultPattern: 'require sponsorship',
    presets: ['No, will not require sponsorship', 'Yes, will require visa sponsorship'],
  },
  {
    intent: 'notice_period',
    label: 'What is your official notice period?',
    category: 'Availability',
    defaultPattern: 'notice period',
    presets: ['Immediate Joiner (0 Days)', '15 Days', '30 Days', '60 Days', '90 Days'],
  },
  {
    intent: 'relocation',
    label: 'Are you open to relocating for this position?',
    category: 'Relocation',
    defaultPattern: 'willing to relocate',
    presets: ['Yes, willing to relocate', 'Yes, open for hybrid relocation', 'No, remote only'],
  },
  {
    intent: 'remote_work',
    label: 'What is your comfort level with remote / hybrid setups?',
    category: 'Work Mode',
    defaultPattern: 'remote or hybrid',
    presets: ['Comfortable with Remote and Hybrid', 'Prefer 100% Remote', 'Open to On-site work'],
  },
  {
    intent: 'expected_salary',
    label: 'What is your expected annual compensation?',
    category: 'Compensation',
    defaultPattern: 'expected salary',
    presets: ['Negotiable / Market standard', '18 - 22 LPA', '24 - 28 LPA', '30+ LPA'],
  },
];

export const SavedAnswersTab: React.FC<SavedAnswersTabProps> = ({ savedAnswers, onChange }) => {
  const { showSuccess, showError } = useToast();

  const handleSaveQA = async (intent: string, pattern: string, answerText: string) => {
    if (!answerText.trim()) return;
    try {
      await api.saveSavedAnswer({
        canonical_intent: intent,
        question_pattern: pattern || intent,
        answer_text: answerText.trim(),
      });
      const updated = await api.listSavedAnswers();
      onChange(updated || []);
      showSuccess('Answer saved! Auto-applied to matched screening questions.');
    } catch (e: any) {
      showError(`Failed to save answer: ${e.message}`);
    }
  };

  return (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Saved Screening Answers Library
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pre-saved answers feed directly into the dynamic form engine so portals never prompt you twice.
              </p>
            </div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
              {savedAnswers.length} answered
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {STANDARD_SCREENING_INTENTS.map((item) => {
              const existing = savedAnswers.find((a) => a.canonical_intent === item.intent);
              return (
                <div
                  key={item.intent}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200/50 dark:border-indigo-800/40">
                      {item.category}
                    </span>
                    {existing?.answer_text && (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>Saved</span>
                      </span>
                    )}
                  </div>

                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.label}</div>

                  {/* Preset quick pills */}
                  <div className="flex flex-wrap gap-1">
                    {item.presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          const inputEl = document.getElementById(`qa-${item.intent}`) as HTMLInputElement;
                          if (inputEl) inputEl.value = preset;
                          handleSaveQA(item.intent, item.defaultPattern, preset);
                        }}
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:border-indigo-300 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  {/* Input & Save Button */}
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="text"
                      defaultValue={existing?.answer_text || ''}
                      placeholder="Type custom answer..."
                      id={`qa-${item.intent}`}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = (document.getElementById(`qa-${item.intent}`) as HTMLInputElement)?.value;
                        handleSaveQA(item.intent, item.defaultPattern, val);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
                    >
                      Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
  );
};

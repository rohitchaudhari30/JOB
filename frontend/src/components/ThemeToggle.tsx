import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="relative w-9 h-9 rounded-full flex items-center justify-center bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 border border-slate-200/90 shadow-xs transition-all duration-200 active:scale-90 cursor-pointer select-none dark:bg-slate-800/90 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      title={isDark ? 'Switch to Day / Light Mode' : 'Switch to Night / Dark Mode'}
      aria-label="Toggle theme"
    >
      <div className="relative w-4 h-4 flex items-center justify-center">
        {isDark ? (
          <Moon className="w-4 h-4 text-indigo-400 transform rotate-0 transition-transform duration-300 animate-fadeIn" />
        ) : (
          <Sun className="w-4 h-4 text-amber-500 transform rotate-0 transition-transform duration-300 animate-fadeIn" />
        )}
      </div>
    </button>
  );
};

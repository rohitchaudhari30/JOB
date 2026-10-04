import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const applyThemeToDOM = (t: Theme) => {
  const root = document.documentElement;
  const body = document.body;
  if (t === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
    if (body) {
      body.classList.add('dark');
      body.classList.remove('light');
    }
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
    if (body) {
      body.classList.remove('dark');
      body.classList.add('light');
    }
  }
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('applyflow_theme') as Theme | null;
      const initial: Theme = saved === 'dark' || saved === 'light' ? saved : 'light';
      applyThemeToDOM(initial);
      return initial;
    } catch {
      applyThemeToDOM('light');
      return 'light';
    }
  });

  useEffect(() => {
    applyThemeToDOM(theme);
    try {
      localStorage.setItem('applyflow_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      applyThemeToDOM(next);
      return next;
    });
  };

  const setTheme = (t: Theme) => {
    applyThemeToDOM(t);
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isDesktopWeb = useIsDesktopWeb();

  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return 'dark';
  });

  // Desktop web has no dark-mode UI — always force light there. Mobile and
  // the native (Capacitor/Natively) wrappers keep their stored preference.
  const effectiveTheme: Theme = isDesktopWeb ? 'light' : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Only persist a user-driven preference, not the desktop override, so
    // resizing back down to mobile restores the previous choice.
    if (!isDesktopWeb) {
      localStorage.setItem('theme', theme);
    }
  }, [effectiveTheme, theme, isDesktopWeb]);

  const toggleTheme = () => {
    if (isDesktopWeb) return;
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  };

  const setTheme = (newTheme: Theme) => {
    if (isDesktopWeb) return;
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

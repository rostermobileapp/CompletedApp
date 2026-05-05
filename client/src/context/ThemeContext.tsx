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

    // When running inside the Natively native shell (Android in particular),
    // the system status bar is owned by the native shell, not the web view.
    // Without this, the Android status bar stays white in dark mode (the
    // shell's default), producing a visible white strip above the dark app.
    // The Natively SDK exposes runtime controls — drive them off the active
    // theme so the Android (and iOS) shell match what the user sees.
    //   - setAppBackgroundColor: paints the area under the (transparent on
    //     Android 15 edge-to-edge) status bar so it visually matches the app.
    //   - setAppStatusBarStyle: 'light' = light status-bar icons on a dark
    //     background, 'dark' = dark icons on a light background.
    // The npm `natively` shim is also present in the browser preview where
    // these calls safely no-op, so no native-only guard is needed.
    const bgColor = effectiveTheme === 'dark' ? '#000000' : '#ffffff';
    const barStyle = effectiveTheme === 'dark' ? 'light' : 'dark';
    const applyNativelyTheme = () => {
      const nat = (window as any).natively;
      if (!nat) return false;
      try {
        nat.setAppBackgroundColor?.(bgColor);
        nat.setAppStatusBarStyle?.(barStyle);
        return true;
      } catch (err) {
        console.warn('[Theme] Natively theme sync failed:', err);
        return false;
      }
    };
    if (!applyNativelyTheme()) {
      // The Natively CDN script loads asynchronously; if the bridge isn't
      // ready yet, retry briefly so the very first render still gets themed.
      let attempts = 0;
      const interval = window.setInterval(() => {
        attempts += 1;
        if (applyNativelyTheme() || attempts >= 20) {
          window.clearInterval(interval);
        }
      }, 150);
      return () => window.clearInterval(interval);
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

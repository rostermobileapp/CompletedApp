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

    // Sync the Natively native shell's safe-area background and status-bar
    // icon color to the active theme. Without this, the Safe Area strip
    // above the WebView stays at its dashboard default (white) and the
    // status-bar icons stay at their dashboard default style — producing
    // invisible white-on-white icons in light mode (or a jarring white
    // strip in dark mode). Values verified against BuildNatively docs:
    // https://docs.buildnatively.com/natively-platform/appearance/style#status-bar-style
    //   - 'Dark'  = dark theme  = white/light status-bar icons (use on dark bg)
    //   - 'Light' = light theme = dark/black status-bar icons (use on light bg)
    // Values are capitalized — lowercase variants are silently ignored.
    // The npm `natively` shim is also present in the desktop browser preview
    // where these calls safely no-op, so no native-only guard is needed.
    const bgColor = effectiveTheme === 'dark' ? '#000000' : '#ffffff';
    const barStyle = effectiveTheme === 'dark' ? 'Dark' : 'Light';
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
    let intervalId: number | undefined;
    if (!applyNativelyTheme()) {
      // The Natively CDN script loads asynchronously; if the bridge isn't
      // ready yet, retry briefly so the very first render still gets themed.
      let attempts = 0;
      intervalId = window.setInterval(() => {
        attempts += 1;
        if (applyNativelyTheme() || attempts >= 20) {
          window.clearInterval(intervalId);
        }
      }, 150);
    }

    // Only persist a user-driven preference, not the desktop override, so
    // resizing back down to mobile restores the previous choice.
    if (!isDesktopWeb) {
      localStorage.setItem('theme', theme);
    }

    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
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

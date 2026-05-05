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

    // Sync the Natively native shell's background color and status-bar icon
    // style to the active theme so they match the app in both light and dark
    // modes. Values from BuildNatively docs (capitalized, case-sensitive):
    //   'Dark'  → white/light icons  (use when app background is dark)
    //   'Light' → dark/black icons   (use when app background is light)
    // We use natively.addObserver() rather than calling the methods directly:
    // addObserver() runs immediately if the native bridge is already injected,
    // or queues the call until the bridge fires notify() — correctly handling
    // the race between the async CDN script, the native bridge initialisation,
    // and React's first render.  Calling the methods directly (as before) meant
    // the trigger was sometimes queued inside the shim but never drained because
    // notify() had already fired before the CDN script reset window.natively.
    const bgColor = effectiveTheme === 'dark' ? '#000000' : '#ffffff';
    const barStyle = effectiveTheme === 'dark' ? 'Dark' : 'Light';
    const nat = (window as any).natively;
    if (nat) {
      try {
        nat.addObserver(() => {
          console.log('[Theme] Natively sync — theme:', effectiveTheme, '| barStyle:', barStyle, '| bgColor:', bgColor);
          nat.setAppBackgroundColor?.(bgColor);
          nat.setAppStatusBarStyle?.(barStyle);
        });
      } catch (err) {
        console.warn('[Theme] Natively addObserver failed:', err);
      }
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

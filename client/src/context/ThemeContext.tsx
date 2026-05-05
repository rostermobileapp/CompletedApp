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

  // One-time: ask the Natively native bridge for the actual system inset
  // sizes (status-bar height at top, gesture-nav height at bottom) and bake
  // them into CSS custom properties so the layout can push content clear of
  // the system bars without relying on env(safe-area-inset-*), which returns
  // 0 inside a Natively WebView when Safe Area is disabled in the dashboard.
  useEffect(() => {
    const nat = (window as any).natively;
    if (!nat) return;
    try {
      nat.addObserver(() => {
        nat.getInsets((insets: { top?: number; bottom?: number; left?: number; right?: number }) => {
          const top = insets?.top ?? 0;
          const bottom = insets?.bottom ?? 0;
          console.log('[Theme] Natively insets — top:', top, 'bottom:', bottom);
          const root = document.documentElement;
          root.style.setProperty('--native-inset-top', `${top}px`);
          root.style.setProperty('--native-inset-bottom', `${bottom}px`);
        });
      });
    } catch (err) {
      console.warn('[Theme] Natively getInsets failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — insets don't change during a session

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
    // Match the App Background Color to bg-card (the bottom nav's background)
    // so the native gesture-nav strip below the WebView is the same color as
    // the bottom nav — making the gap invisible without viewport-fit=cover.
    // Light: hsl(0 0% 96%) = #f5f5f5  |  Dark: hsl(240 10% 6%) ≈ #0e0e11
    const bgColor = effectiveTheme === 'dark' ? '#0e0e11' : '#f5f5f5';
    // Status bar icons on this device are always white, so keep style 'Dark'
    // (white icons) regardless of app theme. The App Background Color fills
    // the Safe Area space and will match the theme automatically via bgColor.
    const barStyle = 'Dark';
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

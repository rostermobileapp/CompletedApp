import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';

export type ScreenId = 'teams' | 'messages' | 'home' | 'payments' | 'profile';

export const SCREEN_ORDER: ScreenId[] = ['teams', 'messages', 'home', 'payments', 'profile'];

const SCREEN_ROUTES: Record<ScreenId, string> = {
  teams: '/teams',
  messages: '/messages',
  home: '/',
  payments: '/payment-requests',
  profile: '/profile',
};

function getScreenFromPath(path: string): ScreenId {
  if (path === '/') return 'home';
  if (path.startsWith('/teams') || path.startsWith('/tournament-teams')) return 'teams';
  if (path.startsWith('/messages')) return 'messages';
  if (path.startsWith('/payment-requests') || path.startsWith('/create-payment-request')) return 'payments';
  if (path.startsWith('/profile') || path.startsWith('/subscription')) return 'profile';
  return 'home';
}

interface SwipeableNavContextType {
  activeIndex: number;
  activeScreen: ScreenId;
  setActiveIndex: (index: number, animate?: boolean) => void;
  navigateToScreen: (screenId: ScreenId, animate?: boolean) => void;
  isAnimating: boolean;
  setIsAnimating: (animating: boolean) => void;
}

const SwipeableNavContext = createContext<SwipeableNavContextType | null>(null);

export function SwipeableNavProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const initialScreen = getScreenFromPath(location);
  const initialIndex = SCREEN_ORDER.indexOf(initialScreen);
  
  const [activeIndex, setActiveIndexState] = useState(initialIndex >= 0 ? initialIndex : 2);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const screenFromPath = getScreenFromPath(location);
    const indexFromPath = SCREEN_ORDER.indexOf(screenFromPath);
    if (indexFromPath !== -1 && indexFromPath !== activeIndex) {
      setActiveIndexState(indexFromPath);
    }
  }, [location]);

  const setActiveIndex = useCallback((index: number, animate = true) => {
    if (index < 0 || index >= SCREEN_ORDER.length) return;
    if (animate) {
      setIsAnimating(true);
    }
    setActiveIndexState(index);
    
    const screenId = SCREEN_ORDER[index];
    const targetRoute = SCREEN_ROUTES[screenId];
    navigate(targetRoute);
  }, [navigate]);

  const navigateToScreen = useCallback((screenId: ScreenId, animate = true) => {
    const index = SCREEN_ORDER.indexOf(screenId);
    if (index !== -1) {
      setActiveIndex(index, animate);
    }
  }, [setActiveIndex]);

  const activeScreen = SCREEN_ORDER[activeIndex];

  return (
    <SwipeableNavContext.Provider
      value={{
        activeIndex,
        activeScreen,
        setActiveIndex,
        navigateToScreen,
        isAnimating,
        setIsAnimating,
      }}
    >
      {children}
    </SwipeableNavContext.Provider>
  );
}

export function useSwipeableNav() {
  const context = useContext(SwipeableNavContext);
  if (!context) {
    throw new Error('useSwipeableNav must be used within a SwipeableNavProvider');
  }
  return context;
}

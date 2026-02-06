import { useState, useCallback, useEffect, memo, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

import Dashboard from '@/pages/Dashboard';
import Teams from '@/pages/Teams';
import Messages from '@/pages/Messages';
import PaymentRequests from '@/pages/PaymentRequests';
import Profile from '@/pages/Profile';

type ScreenId = 'teams' | 'messages' | 'home' | 'payments' | 'profile';

const SCREEN_ORDER: ScreenId[] = ['teams', 'messages', 'home', 'payments', 'profile'];

const SCREEN_ROUTES: Record<ScreenId, string> = {
  teams: '/teams',
  messages: '/messages',
  home: '/',
  payments: '/payment-requests',
  profile: '/profile',
};

function getScreenFromPath(path: string): ScreenId | null {
  if (path === '/') return 'home';
  if (path === '/teams') return 'teams';
  if (path === '/messages') return 'messages';
  if (path === '/payment-requests') return 'payments';
  if (path === '/profile') return 'profile';
  return null;
}


interface SwipeableMainScreensProps {
  children?: React.ReactNode;
}

function SwipeableMainScreensInner({ children }: SwipeableMainScreensProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  
  const currentScreen = getScreenFromPath(location);
  const isMainScreen = currentScreen !== null;
  
  const [activeIndex, setActiveIndex] = useState(() => 
    currentScreen ? SCREEN_ORDER.indexOf(currentScreen) : 2
  );
  
  const [shouldAnimate, setShouldAnimate] = useState(false);
  
  const bottomPadding = currentScreen === 'messages' ? 0 : (user?.role === 'free_tier' ? 132 : 82);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    if (currentScreen) {
      const newIndex = SCREEN_ORDER.indexOf(currentScreen);
      setActiveIndex((prev) => {
        if (prev !== newIndex) {
          setShouldAnimate(true);
          return newIndex;
        }
        return prev;
      });
    }
  }, [currentScreen]);

  const navigateToIndex = useCallback((index: number) => {
    if (index < 0 || index >= SCREEN_ORDER.length) return;
    
    const screenId = SCREEN_ORDER[index];
    navigate(SCREEN_ROUTES[screenId]);
  }, [navigate]);


  const screens = useMemo(() => [
    { id: 'teams', component: <Teams /> },
    { id: 'messages', component: <Messages /> },
    { id: 'home', component: <Dashboard /> },
    { id: 'payments', component: <PaymentRequests /> },
    { id: 'profile', component: <Profile /> },
  ], []);

  if (!isMainScreen) {
    return <>{children}</>;
  }

  const translateX = -(activeIndex * 100 / screens.length);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 overflow-hidden bg-background"
      style={{ paddingBottom: `${bottomPadding}px` }}
      data-testid="swipeable-container"
    >
      <div
        className="flex h-full"
        style={{ 
          transform: `translate3d(${translateX}%, 0, 0)`,
          transition: shouldAnimate ? 'transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'none',
          width: `${screens.length * 100}%`,
          willChange: 'transform',
        }}
        onTransitionEnd={() => setShouldAnimate(false)}
      >
        {screens.map((screen) => (
          <div
            key={screen.id}
            className="relative h-full flex flex-col bg-background overflow-y-auto overflow-x-hidden"
            style={{ 
              width: `${100 / screens.length}%`,
              flexShrink: 0,
            }}
            data-testid={`screen-${screen.id}`}
          >
            {screen.component}
          </div>
        ))}
      </div>
    </div>
  );
}

export const SwipeableMainScreens = memo(SwipeableMainScreensInner);

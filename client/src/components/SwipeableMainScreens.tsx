import { useState, useCallback, useEffect, memo, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion, useSpring } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';

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
  const { selectedType, selectedId } = useDashboardSelection();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const currentScreen = getScreenFromPath(location);
  const isMainScreen = currentScreen !== null;
  
  const [activeIndex, setActiveIndex] = useState(() => 
    currentScreen ? SCREEN_ORDER.indexOf(currentScreen) : 2
  );
  
  const springX = useSpring(0, { 
    stiffness: 400, 
    damping: 40,
    mass: 0.8,
  });
  
  const [containerWidth, setContainerWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 375);
  const bottomPadding = user?.role === 'free_tier' ? 132 : 82;

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    springX.set(-activeIndex * containerWidth);
  }, [activeIndex, containerWidth, springX]);

  useEffect(() => {
    if (currentScreen) {
      const newIndex = SCREEN_ORDER.indexOf(currentScreen);
      if (newIndex !== activeIndex) {
        setActiveIndex(newIndex);
      }
    }
  }, [currentScreen, activeIndex]);

  const navigateToIndex = useCallback((index: number) => {
    if (index < 0 || index >= SCREEN_ORDER.length) return;
    
    const screenId = SCREEN_ORDER[index];
    
    if (screenId === 'teams') {
      if (selectedType === 'tournament' && selectedId) {
        navigate(`/tournament-teams/${selectedId}`);
        return;
      }
    }
    
    navigate(SCREEN_ROUTES[screenId]);
  }, [navigate, selectedType, selectedId]);


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

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 overflow-hidden bg-background"
      style={{ paddingBottom: `${bottomPadding}px` }}
      data-testid="swipeable-container"
    >
      <motion.div
        className="flex h-full"
        style={{ 
          x: springX,
          width: `${screens.length * 100}%`,
          willChange: 'transform',
        }}
      >
        {screens.map((screen, index) => (
          <div
            key={screen.id}
            className="h-full overflow-y-auto overflow-x-hidden bg-background"
            style={{ 
              width: `${100 / screens.length}%`,
              flexShrink: 0,
            }}
            data-testid={`screen-${screen.id}`}
          >
            {screen.component}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export const SwipeableMainScreens = memo(SwipeableMainScreensInner);

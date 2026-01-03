import { useState, useCallback, useEffect, memo, useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
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

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 500;

interface SwipeableMainScreensProps {
  children?: React.ReactNode;
}

function SwipeableMainScreensInner({ children }: SwipeableMainScreensProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { selectedType, selectedId } = useDashboardSelection();
  
  const currentScreen = getScreenFromPath(location);
  const isMainScreen = currentScreen !== null;
  
  const [activeIndex, setActiveIndex] = useState(() => 
    currentScreen ? SCREEN_ORDER.indexOf(currentScreen) : 2
  );
  const [direction, setDirection] = useState(0);
  
  const bottomPadding = user?.role === 'free_tier' ? 132 : 82;

  useEffect(() => {
    if (currentScreen) {
      const newIndex = SCREEN_ORDER.indexOf(currentScreen);
      if (newIndex !== activeIndex) {
        setDirection(newIndex > activeIndex ? 1 : -1);
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

  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    
    const swipedLeft = offset.x < -SWIPE_THRESHOLD || velocity.x < -SWIPE_VELOCITY_THRESHOLD;
    const swipedRight = offset.x > SWIPE_THRESHOLD || velocity.x > SWIPE_VELOCITY_THRESHOLD;
    
    if (swipedLeft && activeIndex < SCREEN_ORDER.length - 1) {
      setDirection(1);
      const newIndex = activeIndex + 1;
      setActiveIndex(newIndex);
      navigateToIndex(newIndex);
    } else if (swipedRight && activeIndex > 0) {
      setDirection(-1);
      const newIndex = activeIndex - 1;
      setActiveIndex(newIndex);
      navigateToIndex(newIndex);
    }
  }, [activeIndex, navigateToIndex]);

  const screens = useMemo(() => ({
    teams: <Teams />,
    messages: <Messages />,
    home: <Dashboard />,
    payments: <PaymentRequests />,
    profile: <Profile />,
  }), []);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
    }),
  };

  if (!isMainScreen) {
    return <>{children}</>;
  }

  const currentScreenId = SCREEN_ORDER[activeIndex];

  return (
    <div 
      className="fixed inset-0 overflow-hidden bg-background"
      style={{ paddingBottom: `${bottomPadding}px` }}
      data-testid="swipeable-container"
    >
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={currentScreenId}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: 'spring', stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          onDirectionLock={(axis) => {
            if (axis === 'y') {
              return;
            }
          }}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden bg-background"
          style={{ paddingBottom: `${bottomPadding}px` }}
          data-testid={`screen-${currentScreenId}`}
        >
          {screens[currentScreenId]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export const SwipeableMainScreens = memo(SwipeableMainScreensInner);

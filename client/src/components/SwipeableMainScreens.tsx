import { useRef, useState, useCallback, useEffect, memo, ReactNode, useMemo } from 'react';
import { useLocation } from 'wouter';
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

const ROUTE_TO_SCREEN: Record<string, ScreenId> = {
  '/': 'home',
  '/teams': 'teams',
  '/messages': 'messages',
  '/payment-requests': 'payments',
  '/profile': 'profile',
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
const TRANSITION_DURATION = 300;

interface SwipeableMainScreensProps {
  children?: ReactNode;
}

function SwipeableMainScreensInner({ children }: SwipeableMainScreensProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { selectedType, selectedId } = useDashboardSelection();
  
  const currentScreen = getScreenFromPath(location);
  const isMainScreen = currentScreen !== null;
  
  const activeIndex = currentScreen ? SCREEN_ORDER.indexOf(currentScreen) : 2;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(activeIndex);
  
  const bottomPadding = user?.role === 'free_tier' ? 132 : 82;

  useEffect(() => {
    if (!isTransitioning) {
      setDisplayIndex(activeIndex);
    }
  }, [activeIndex, isTransitioning]);

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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isTransitioning || !isMainScreen) return;
    setTouchStart(e.touches[0].clientX);
    setTouchEnd(null);
    setIsDragging(true);
    setDragOffset(0);
  }, [isTransitioning, isMainScreen]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart || !isDragging || !isMainScreen) return;
    
    const currentTouch = e.touches[0].clientX;
    const diff = currentTouch - touchStart;
    
    if (displayIndex === 0 && diff > 0) {
      setDragOffset(diff * 0.3);
      return;
    }
    if (displayIndex === SCREEN_ORDER.length - 1 && diff < 0) {
      setDragOffset(diff * 0.3);
      return;
    }
    
    setDragOffset(diff);
    setTouchEnd(currentTouch);
  }, [touchStart, isDragging, displayIndex, isMainScreen]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart || touchEnd === null || isTransitioning || !isMainScreen) {
      setIsDragging(false);
      setDragOffset(0);
      return;
    }
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > SWIPE_THRESHOLD;
    const isRightSwipe = distance < -SWIPE_THRESHOLD;
    
    setIsDragging(false);
    setDragOffset(0);
    
    let newIndex = displayIndex;
    if (isLeftSwipe && displayIndex < SCREEN_ORDER.length - 1) {
      newIndex = displayIndex + 1;
    } else if (isRightSwipe && displayIndex > 0) {
      newIndex = displayIndex - 1;
    }
    
    if (newIndex !== displayIndex) {
      setIsTransitioning(true);
      setDisplayIndex(newIndex);
      
      setTimeout(() => {
        navigateToIndex(newIndex);
        setIsTransitioning(false);
      }, TRANSITION_DURATION);
    }
    
    setTouchStart(null);
    setTouchEnd(null);
  }, [touchStart, touchEnd, displayIndex, navigateToIndex, isTransitioning, isMainScreen]);

  const getTransform = () => {
    const baseOffset = -displayIndex * 100;
    if (isDragging && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const dragPercent = (dragOffset / containerWidth) * 100;
      return `translateX(calc(${baseOffset}% + ${dragPercent}%))`;
    }
    return `translateX(${baseOffset}%)`;
  };

  const screens = useMemo(() => [
    <Teams key="teams" />,
    <Messages key="messages" />,
    <Dashboard key="home" />,
    <PaymentRequests key="payments" />,
    <Profile key="profile" />,
  ], []);

  if (!isMainScreen) {
    return <>{children}</>;
  }

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 overflow-hidden touch-pan-y bg-background"
      style={{ paddingBottom: `${bottomPadding}px` }}
      data-testid="swipeable-container"
    >
      <div
        className="flex h-full"
        style={{
          width: `${screens.length * 100}%`,
          transform: getTransform(),
          transition: isDragging ? 'none' : `transform ${TRANSITION_DURATION}ms ease-out`,
          willChange: 'transform',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {screens.map((screen, index) => (
          <div
            key={SCREEN_ORDER[index]}
            className="h-full overflow-y-auto overflow-x-hidden bg-background"
            style={{ 
              width: `${100 / screens.length}%`,
              flexShrink: 0,
            }}
            data-testid={`screen-${SCREEN_ORDER[index]}`}
          >
            {screen}
          </div>
        ))}
      </div>
    </div>
  );
}

export const SwipeableMainScreens = memo(SwipeableMainScreensInner);

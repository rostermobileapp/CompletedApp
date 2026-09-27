import { useState, useCallback, useEffect, useLayoutEffect, memo, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

import Dashboard from '@/pages/Dashboard';
import Teams from '@/pages/Teams';
import Messages from '@/pages/Messages';
import PaymentRequests from '@/pages/PaymentRequests';
import Profile from '@/pages/Profile';

type ScreenId = 'teams' | 'messages' | 'home' | 'payments' | 'profile';

const SCREEN_ORDER: ScreenId[] = ['teams', 'messages', 'home', 'payments', 'profile'];

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
  const [location] = useLocation();
  const { user } = useAuth();
  
  const currentScreen = getScreenFromPath(location);
  const isMainScreen = currentScreen !== null;
  const wasMainScreen = useRef(isMainScreen);
  
  const [activeIndex, setActiveIndex] = useState(() => 
    currentScreen ? SCREEN_ORDER.indexOf(currentScreen) : 2
  );
  const [transition, setTransition] = useState<{
    from: number;
    to: number;
    direction: 'forward' | 'backward';
  } | null>(null);
  const bottomPadding = user?.role === 'free_tier' ? 132 : 82;

  const finishTransition = useCallback(() => {
    setTransition(null);
  }, []);

  useLayoutEffect(() => {
    if (!currentScreen) {
      wasMainScreen.current = false;
      finishTransition();
      return;
    }

    const nextIndex = SCREEN_ORDER.indexOf(currentScreen);
    if (!wasMainScreen.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActiveIndex(nextIndex);
      finishTransition();
    } else if (nextIndex !== activeIndex) {
      // Only animate the two endpoints, even for nonadjacent tabs. If the
      // previous animation is interrupted, snap to the newest destination
      // rather than briefly painting three full pages at once.
      setTransition(transition ? null : {
        from: activeIndex,
        to: nextIndex,
        direction: nextIndex > activeIndex ? 'forward' : 'backward',
      });
      setActiveIndex(nextIndex);
    }
    wasMainScreen.current = true;
  }, [currentScreen, activeIndex, transition, finishTransition]);

  // An interrupted transition (or a browser that omits transitionend) must
  // not leave the outgoing screen painted indefinitely.
  useEffect(() => {
    if (!transition) return;
    const timeout = window.setTimeout(finishTransition, 450);
    return () => window.clearTimeout(timeout);
  }, [transition, finishTransition]);


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
      className="fixed inset-0 overflow-hidden bg-background"
      data-testid="swipeable-container"
    >
      {screens.map((screen, index) => {
        const direction = transition?.direction;
        const entering = transition?.to === index;
        const exiting = transition?.from === index;
        const visible = index === activeIndex || exiting;
        const animation = direction
          ? entering
            ? `main-screen-enter-${direction} 0.35s cubic-bezier(0.25, 0.1, 0.25, 1) both`
            : exiting
              ? `main-screen-exit-${direction} 0.35s cubic-bezier(0.25, 0.1, 0.25, 1) both`
              : undefined
          : undefined;
        return (
          <div
            key={screen.id}
            className="absolute inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y swipeable-screen"
            style={{
              paddingBottom: screen.id === 'messages' ? 0 : bottomPadding,
              visibility: visible ? 'visible' : 'hidden',
              pointerEvents: index === activeIndex ? 'auto' : 'none',
              animation,
              willChange: animation ? 'transform' : undefined,
              zIndex: entering ? 2 : exiting ? 1 : 0,
            }}
            aria-hidden={index !== activeIndex}
            data-testid={`screen-${screen.id}`}
            onAnimationEnd={(event) => {
              if (entering && direction && event.target === event.currentTarget &&
                  event.animationName === `main-screen-enter-${direction}`) {
                finishTransition();
              }
            }}
          >
            {screen.component}
          </div>
        );
      })}
    </div>
  );
}

export const SwipeableMainScreens = memo(SwipeableMainScreensInner);

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode, useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

interface PageTransitionProps {
  children: ReactNode;
}

const getPageIndex = (path: string): number => {
  if (path === '/teams') return 0;
  if (path === '/messages') return 1;
  if (path === '/') return 2;
  if (path === '/more') return 3;
  if (path === '/profile') return 4;
  return 2; // Default to home
};

const isBottomNavPage = (path: string): boolean => {
  return path === '/' || 
         path === '/teams' || 
         path === '/messages' || 
         path === '/more' || 
         path === '/profile';
};

// Simple global state for animation direction
let globalAnimationDirection: 'left' | 'right' | 'up' | 'down' | null = null;

export const setPageTransitionDirection = (direction: 'left' | 'right' | 'up' | 'down') => {
  globalAnimationDirection = direction;
};

export function PageTransition({ children }: PageTransitionProps) {
  const [location] = useLocation();
  const previousPageIndexRef = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const currentPageIndex = getPageIndex(location);
  const isBottomNav = isBottomNavPage(location);
  
  // Determine animation direction
  let direction: 'left' | 'right' | 'up' | 'down' = 'right';
  
  if (globalAnimationDirection) {
    direction = globalAnimationDirection;
    globalAnimationDirection = null; // Reset after use
  } else if (isBottomNav && previousPageIndexRef.current !== null && isInitialized) {
    direction = currentPageIndex > previousPageIndexRef.current ? 'left' : 'right';
  }
  
  // Update previous page index and initialization state
  useEffect(() => {
    if (isBottomNav) {
      if (previousPageIndexRef.current !== null) {
        setIsInitialized(true);
      }
      previousPageIndexRef.current = currentPageIndex;
    }
  }, [currentPageIndex, isBottomNav]);
  
  const variants = {
    initial: (direction: string) => {
      switch (direction) {
        case 'up':
          return { y: '100%', opacity: 1 };
        case 'down':
          return { y: '-100%', opacity: 1 };
        case 'left':
          return { x: '100%', opacity: 1 };
        case 'right':
        default:
          return { x: '-100%', opacity: 1 };
      }
    },
    animate: {
      x: 0,
      y: 0,
      opacity: 1,
    },
    exit: (direction: string) => {
      switch (direction) {
        case 'up':
          return { y: '-100%', opacity: 1 };
        case 'down':
          return { y: '100%', opacity: 1 };
        case 'left':
          return { x: '-100%', opacity: 1 };
        case 'right':
        default:
          return { x: '100%', opacity: 1 };
      }
    },
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        custom={direction}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          type: "tween",
          ease: [0.4, 0, 0.2, 1],
          duration: 0.3,
        }}
        className="absolute inset-0 w-full h-full bg-background"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
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
  
  const currentPageIndex = getPageIndex(location);
  const isBottomNav = isBottomNavPage(location);
  
  // Determine animation direction
  let direction: 'left' | 'right' | 'up' | 'down' = 'right';
  
  if (globalAnimationDirection) {
    direction = globalAnimationDirection;
    globalAnimationDirection = null; // Reset after use
  } else if (isBottomNav && previousPageIndexRef.current !== null) {
    direction = currentPageIndex > previousPageIndexRef.current ? 'left' : 'right';
  }
  
  // Update previous page index
  useEffect(() => {
    if (isBottomNav) {
      previousPageIndexRef.current = currentPageIndex;
    }
  }, [currentPageIndex, isBottomNav]);
  
  const variants = {
    initial: (direction: string) => {
      switch (direction) {
        case 'up':
          return { opacity: 0, y: '100%' };
        case 'down':
          return { opacity: 0, y: '-100%' };
        case 'left':
          return { opacity: 0, x: '100%' };
        case 'right':
        default:
          return { opacity: 0, x: '-100%' };
      }
    },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
    },
    exit: (direction: string) => {
      switch (direction) {
        case 'up':
          return { opacity: 0, y: '-100%' };
        case 'down':
          return { opacity: 0, y: '100%' };
        case 'left':
          return { opacity: 0, x: '-100%' };
        case 'right':
        default:
          return { opacity: 0, x: '100%' };
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
          duration: 0.1,
        }}
        className="absolute inset-0 w-full h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
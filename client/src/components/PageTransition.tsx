import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export const setPageTransitionDirection = (direction: 'left' | 'right' | 'up' | 'down') => {
  // No-op function to maintain compatibility
};

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <div className="w-full min-h-screen bg-background pb-20">
      {children}
    </div>
  );
}
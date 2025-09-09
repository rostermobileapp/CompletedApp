import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export const setPageTransitionDirection = (direction: 'left' | 'right' | 'up' | 'down') => {
  // No-op function to maintain compatibility
};

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <div className="absolute inset-0 w-full h-full bg-background">
      {children}
    </div>
  );
}
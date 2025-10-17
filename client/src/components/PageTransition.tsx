import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface PageTransitionProps {
  children: ReactNode;
}

export const setPageTransitionDirection = (direction: 'left' | 'right' | 'up' | 'down') => {
  // No-op function to maintain compatibility
};

export function PageTransition({ children }: PageTransitionProps) {
  const { user } = useAuth();
  
  // Bottom navigation is ~82px, ad banner is 50px
  // Free tier: need space for both (132px total)
  // Paid tier: only need space for nav (82px)
  const bottomPadding = user?.role === 'free_tier' ? '132px' : '82px';
  
  return (
    <div className="w-full min-h-screen bg-background" style={{ paddingBottom: bottomPadding }}>
      {children}
    </div>
  );
}
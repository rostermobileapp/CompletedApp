import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

interface PageTransitionProps {
  children: ReactNode;
}

export const setPageTransitionDirection = (direction: 'left' | 'right' | 'up' | 'down') => {
  // No-op function to maintain compatibility
};

export function PageTransition({ children }: PageTransitionProps) {
  const { user } = useAuth();
  const isDesktopWeb = useIsDesktopWeb();

  // Bottom navigation is ~82px, ad banner is 50px (mobile/native only)
  // Free tier: need space for both (132px total)
  // Paid tier: only need space for nav (82px)
  // Desktop has no bottom nav and shares the available main height with the app shell.
  const bottomPadding = isDesktopWeb
    ? '0px'
    : user?.role === 'free_tier'
      ? '132px'
      : '82px';

  return (
    <div
      className={
        isDesktopWeb
          ? 'w-full h-full bg-background'
          : 'w-full min-h-screen bg-background'
      }
      style={{ paddingBottom: bottomPadding }}
    >
      {children}
    </div>
  );
}
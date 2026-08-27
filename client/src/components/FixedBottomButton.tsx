import { useAuth } from '@/hooks/useAuth';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { cn } from '@/lib/utils';

interface FixedBottomButtonProps {
  children: React.ReactNode;
  className?: string;
}

export function FixedBottomButton({ children, className }: FixedBottomButtonProps) {
  const { user } = useAuth();
  const isDesktopWeb = useIsDesktopWeb();

  // On desktop, render inline (in normal document flow) so the action button
  // sits inside the page's content column rather than being fixed to the
  // viewport — a viewport-fixed bar overlays the desktop sidebars and the
  // App Store / Google Play promo cards at the bottom of DesktopMenuColumn.
  if (isDesktopWeb) {
    return (
      <div
        className={cn(
          'mt-6 px-6 py-3 border-t border-border bg-background',
          className
        )}
        data-testid="fixed-bottom-button-container"
      >
        {children}
      </div>
    );
  }

  const isFreeTier = user?.role === 'free_tier';
  // The mobile navigation is taller than its 60px minimum once labels,
  // padding, and the device safe area are included. Keep fixed actions fully
  // above it so the nav cannot cover or intercept the submit button.
  const bottomOffset = isFreeTier ? 148 : 98;

  return (
    <div
      className={cn(
        'fixed left-0 right-0 px-6 py-3 bg-background/95 backdrop-blur-sm border-t border-border z-[90]',
        className
      )}
      style={{
        bottom: `calc(${bottomOffset}px + var(--native-inset-bottom, env(safe-area-inset-bottom, 0px)))`,
      }}
      data-testid="fixed-bottom-button-container"
    >
      {children}
    </div>
  );
}

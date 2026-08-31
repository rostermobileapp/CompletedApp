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
  // The mobile navigation's content is 75px tall. The free-tier promotional
  // banner sits above the navigation, so free users retain its larger offset.
  // Safe-area space is added separately in the bottom style below.
  const bottomOffset = isFreeTier ? 148 : 75;

  return (
    <div
      className={cn(
        // Keep dialogs (z-50) above this page-level action bar. The action
        // bar still sits above normal page content and remains clear of the
        // mobile navigation via its bottom offset.
        'fixed left-0 right-0 px-6 py-3 bg-background/95 backdrop-blur-sm border-t border-border z-[40]',
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

import { useMemo } from 'react';
import { useLocation } from 'wouter';
import homeLogo from '@assets/Home_Logo_1768323157245.png';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { useKeyboard } from '@/hooks/use-keyboard';
import { useSwipeableNav, SCREEN_ORDER, ScreenId } from '@/context/SwipeableNavContext';
import { useAuth } from '@/hooks/useAuth';
import { useSlideUpOverlay } from '@/components/SlideUpOverlay';
import { useLeagueUnreadMessages } from '@/hooks/useLeagueUnreadMessages';
import {
  MAIN_NAV_ITEMS,
  getActiveMainScreen,
  type MainScreenId,
} from '@/lib/mainNavRoutes';

interface BottomNavigationProps {
  useSwipeNav?: boolean;
}

export function BottomNavigation({ useSwipeNav = false }: BottomNavigationProps) {
  const [location, navigate] = useLocation();
  const { selectedType, selectedId } = useDashboardSelection();
  const { isOpen: isKeyboardOpen } = useKeyboard();
  const { isAuthenticated } = useAuth();
  
  let swipeNav: ReturnType<typeof useSwipeableNav> | null = null;
  try {
    swipeNav = useSwipeableNav();
  } catch {
    swipeNav = null;
  }
  
  let slideOverlay: ReturnType<typeof useSlideUpOverlay> | null = null;
  try {
    slideOverlay = useSlideUpOverlay();
  } catch {
    slideOverlay = null;
  }

  const { data: unpaidPaymentData } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    refetchInterval: 60000,
    staleTime: 30000,
  });
  
  const unpaidPaymentCount = (unpaidPaymentData as { count: number } | undefined)?.count ?? 0;
  
  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
    enabled: !!isAuthenticated,
  });
  
  const primaryTeamId = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0].id : null;

  // Unread message counts mapped by league
  const leagueUnreadMessages = useLeagueUnreadMessages();

  // Resolve current league ID from dashboard selection
  const currentLeagueId = useMemo(() => {
    if (selectedType === 'league') return selectedId;
    if (selectedType === 'team' && Array.isArray(userTeams)) {
      const team = (userTeams as any[]).find((t: any) => t.id === selectedId);
      return team?.leagueId ?? null;
    }
    return null;
  }, [selectedType, selectedId, userTeams]);

  // Only count unread messages for the currently selected league
  const currentLeagueUnread = currentLeagueId ? (leagueUnreadMessages[currentLeagueId] ?? 0) : 0;
  
  const activeId: ScreenId | '' =
    useSwipeNav && swipeNav
      ? SCREEN_ORDER[swipeNav.activeIndex]
      : (getActiveMainScreen(location, primaryTeamId) as ScreenId | '');

  const navItemsById = useMemo(
    () => new Map(MAIN_NAV_ITEMS.map((item) => [item.id, item])),
    [],
  );

  const handleNavClick = (shortcutId: ScreenId) => {
    if (useSwipeNav && swipeNav) {
      swipeNav.navigateToScreen(shortcutId, true);
    } else {
      const targetRoute =
        navItemsById.get(shortcutId as MainScreenId)?.route ?? '/';
      if (slideOverlay?.isOverlayRoute) {
        slideOverlay.closeWithSlideDown(targetRoute);
      } else {
        navigate(targetRoute);
      }
    }
  };

  // Bottom-nav uses a different visual order than the desktop sidebar:
  // Home is centered between teams/messages on the left and payments/profile
  // on the right. Labels and icons are sourced from MAIN_NAV_ITEMS so they
  // can never drift from the desktop sidebar.
  const FIXED_SHORTCUTS = (
    ['teams', 'messages', 'home', 'payments', 'profile'] as ScreenId[]
  ).map((id) => {
    const config = navItemsById.get(id as MainScreenId);
    return {
      id,
      icon: config?.icon ?? null,
      label: config?.label ?? '',
    };
  });
  
  if (isKeyboardOpen) {
    return null;
  }

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-[100]" 
      data-testid="bottom-navigation" 
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        minHeight: '60px'
      }}
    >
      <div className="grid py-2 grid-cols-5 bg-[#e2e2e2] dark:bg-[#212121]">
        {FIXED_SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon;
          const isActive = activeId === shortcut.id;

          // Badges anchor to the icon's local positioning context so they
          // travel with the icon whether it sits flat in the bar or floats
          // up inside the active circle.
          const badge =
            shortcut.id === 'messages' && currentLeagueUnread > 0 ? (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" data-testid="message-badge">
                {currentLeagueUnread > 99 ? '99+' : currentLeagueUnread}
              </div>
            ) : shortcut.id === 'payments' && unpaidPaymentCount > 0 ? (
              <div className="absolute -top-1 -right-4 bg-red-500 text-white text-[10px] rounded-full w-[17px] h-[17px] flex items-center justify-center font-bold" data-testid="payment-badge">
                {unpaidPaymentCount > 99 ? '99+' : unpaidPaymentCount}
              </div>
            ) : null;

          return (
            <button
              key={shortcut.id}
              onClick={() => handleNavClick(shortcut.id)}
              className={cn(
                "flex flex-col items-center py-2 w-full transition-colors",
                isActive ? "text-primary" : "text-[#212121]/70 dark:text-muted-foreground"
              )}
              data-testid={`nav-${shortcut.id}`}
            >
              {/* Icon slot has a fixed height so labels stay on the same
                  baseline whether the active tab is floating above or not. */}
              <div className="relative h-[35px] w-full flex items-center justify-center mb-1">
                {isActive ? (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-6 w-12 h-12 rounded-full bg-[#e2e2e2] dark:bg-[#212121] hairline elev-lift flex items-center justify-center">
                    {shortcut.id === 'home' ? (
                      <img src={homeLogo} alt="Home" className="w-7 h-7" />
                    ) : Icon && (
                      <div className="relative">
                        <Icon className="w-6 h-6" />
                        {badge}
                      </div>
                    )}
                  </div>
                ) : shortcut.id === 'home' ? (
                  <img src={homeLogo} alt="Home" className="w-[35px] h-[35px] -mt-[10px]" />
                ) : Icon && (
                  <div className="relative">
                    <Icon className="w-[25px] h-[25px]" />
                    {badge}
                  </div>
                )}
              </div>
              <span className={cn("text-xs", isActive ? "font-bold" : "font-medium")}>{shortcut.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

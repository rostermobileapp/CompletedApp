import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, LayoutGroup } from 'framer-motion';
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
        paddingBottom: 'var(--native-inset-bottom, env(safe-area-inset-bottom, 0px))',
        minHeight: '60px'
      }}
    >
      <LayoutGroup>
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
                    // Shared-layoutId pill: framer-motion morphs this circle
                    // from the previous active tab to this one with spring
                    // physics whenever the active tab changes.
                    <motion.div
                      layoutId="active-nav-pill"
                      className="absolute -top-6 w-12 h-12 rounded-full bg-[#e2e2e2] dark:bg-[#212121] hairline elev-lift flex items-center justify-center"
                      style={{ left: '50%', marginLeft: '-24px' }}
                      transition={{
                        type: 'spring',
                        stiffness: 520,
                        damping: 30,
                        mass: 0.9,
                      }}
                    >
                      {/* Icon inside the pill cross-fades on tab change so
                          the morph reads as a single object changing identity. */}
                      <motion.div
                        key={shortcut.id}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 600,
                          damping: 28,
                          mass: 0.6,
                          delay: 0.05,
                        }}
                        className="relative flex items-center justify-center"
                      >
                        {shortcut.id === 'home' ? (
                          <img src={homeLogo} alt="Home" className="w-7 h-7" />
                        ) : Icon && (
                          <div className="relative">
                            <Icon className="w-6 h-6" />
                            {badge}
                          </div>
                        )}
                      </motion.div>
                    </motion.div>
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
      </LayoutGroup>
    </nav>
  );
}

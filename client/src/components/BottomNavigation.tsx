import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
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
import { BottomNavigationView } from '@/components/BottomNavigationView';

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

  // Count unread messages: current league + direct messages (no leagueId)
  const currentLeagueUnread = (currentLeagueId ? (leagueUnreadMessages[currentLeagueId] ?? 0) : 0)
    + (leagueUnreadMessages['__dm__'] ?? 0);
  
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

  if (isKeyboardOpen) {
    return null;
  }

  return (
    <BottomNavigationView
      activeId={activeId}
      onNavigate={handleNavClick}
      unreadMessages={currentLeagueUnread}
      unpaidPayments={unpaidPaymentCount}
    />
  );
}

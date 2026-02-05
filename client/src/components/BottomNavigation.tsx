import { Users, MessageCircle, User, DollarSign } from 'lucide-react';
import { useLocation } from 'wouter';
import homeLogo from '@assets/Home_Logo_1768323157245.png';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { useKeyboard } from '@/hooks/use-keyboard';
import { useSwipeableNav, SCREEN_ORDER, ScreenId } from '@/context/SwipeableNavContext';
import { useAuth } from '@/hooks/useAuth';

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
  
  const { data: unreadData } = useQuery({
    queryKey: ['/api/messages/unread-count'],
    refetchInterval: 60000, // Reduced from 10s to 60s to lower egress
    staleTime: 30000,
  });
  
  const unreadCount = (unreadData as { count: number } | undefined)?.count ?? 0;

  const { data: unpaidPaymentData } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    refetchInterval: 60000, // Reduced from 10s to 60s to lower egress
    staleTime: 30000,
  });
  
  const unpaidPaymentCount = (unpaidPaymentData as { count: number } | undefined)?.count ?? 0;
  
  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
    enabled: !!isAuthenticated,
  });
  
  const primaryTeamId = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0].id : null;
  
  const getActiveId = (pathname: string): ScreenId | '' => {
    if (pathname === '/') return 'home';
    if (pathname.startsWith('/teams') || pathname.startsWith('/tournament-teams') || (pathname.startsWith('/team/') && primaryTeamId && pathname.includes(primaryTeamId))) return 'teams';
    if (pathname.startsWith('/messages')) return 'messages';
    if (pathname.startsWith('/profile') || pathname.startsWith('/subscription')) return 'profile';
    if (pathname.startsWith('/payment-requests') || pathname.startsWith('/create-payment-request')) return 'payments';
    return '';
  };
  
  const activeId = useSwipeNav && swipeNav ? SCREEN_ORDER[swipeNav.activeIndex] : getActiveId(location);
  
  const handleNavClick = (shortcutId: ScreenId) => {
    if (useSwipeNav && swipeNav) {
      swipeNav.navigateToScreen(shortcutId, true);
    } else {
      if (shortcutId === 'teams') {
        if (selectedType === 'tournament' && selectedId) {
          navigate(`/tournament-teams/${selectedId}`);
        } else if (primaryTeamId) {
          navigate(`/team/${primaryTeamId}`);
        } else {
          navigate('/teams');
        }
      } else if (shortcutId === 'messages') {
        navigate('/messages');
      } else if (shortcutId === 'home') {
        navigate('/');
      } else if (shortcutId === 'payments') {
        navigate('/payment-requests');
      } else if (shortcutId === 'profile') {
        navigate('/profile');
      }
    }
  };
  
  const FIXED_SHORTCUTS: { id: ScreenId; icon: typeof Users | null; label: string }[] = [
    { id: 'teams', icon: Users, label: 'My Team' },
    { id: 'messages', icon: MessageCircle, label: 'Messages' },
    { id: 'home', icon: null, label: 'Home' },
    { id: 'payments', icon: DollarSign, label: 'Payments' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];
  
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
              {shortcut.id === 'home' ? (
                <img src={homeLogo} alt="Home" className="w-[35px] h-[35px] mb-1 -mt-[10px]" />
              ) : Icon && (
                <div className="relative">
                  <Icon className="w-[25px] h-[25px] mb-1" />
                  {shortcut.id === 'messages' && unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" data-testid="message-badge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                  )}
                  {shortcut.id === 'payments' && unpaidPaymentCount > 0 && (
                    <div className="absolute -top-1 -right-4 bg-red-500 text-white text-[10px] rounded-full w-[17px] h-[17px] flex items-center justify-center font-bold" data-testid="payment-badge">
                      {unpaidPaymentCount > 99 ? '99+' : unpaidPaymentCount}
                    </div>
                  )}
                </div>
              )}
              <span className={cn("text-xs", isActive ? "font-bold" : "font-medium")}>{shortcut.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

import { Users, MessageCircle, User, DollarSign } from 'lucide-react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import rostersLogoUrl from '@assets/Roster R White_1757096715093.png';

export function BottomNavigation() {
  const [location, navigate] = useLocation();
  const { selectedType, selectedId } = useDashboardSelection();
  
  // Fetch unread message count
  const { data: unreadData } = useQuery({
    queryKey: ['/api/messages/unread-count'],
    refetchInterval: 10000,
    staleTime: 5000,
  });
  
  const unreadCount = (unreadData as { count: number } | undefined)?.count ?? 0;

  // Fetch unpaid payment requests count
  const { data: unpaidPaymentData } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    refetchInterval: 10000,
    staleTime: 5000,
  });
  
  const unpaidPaymentCount = (unpaidPaymentData as { count: number } | undefined)?.count ?? 0;
  
  const getActiveId = (pathname: string) => {
    if (pathname === '/') return 'home';
    if (pathname.startsWith('/teams') || pathname.startsWith('/tournament-teams')) return 'teams';
    if (pathname.startsWith('/messages')) return 'messages';
    if (pathname.startsWith('/profile') || pathname.startsWith('/subscription')) return 'profile';
    if (pathname.startsWith('/payment-requests') || pathname.startsWith('/create-payment-request')) return 'payments';
    return '';
  };
  
  const activeId = getActiveId(location);
  
  const handleNavClick = (shortcutId: string) => {
    // Handle dynamic routing based on dashboard selection
    if (shortcutId === 'teams') {
      if (selectedType === 'tournament' && selectedId) {
        // Navigate to tournament teams page (matching league My Team design)
        navigate(`/tournament-teams/${selectedId}`);
      } else {
        // Navigate to teams page for league teams
        navigate('/teams');
      }
    } else if (shortcutId === 'messages') {
      // Messages page filters automatically based on dashboard selection
      navigate('/messages');
    } else if (shortcutId === 'home') {
      // Always navigate to main dashboard - it will show filtered content based on selection
      navigate('/');
    } else if (shortcutId === 'payments') {
      navigate('/payment-requests');
    } else if (shortcutId === 'profile') {
      navigate('/profile');
    }
  };
  
  // Define fixed navigation shortcuts
  const FIXED_SHORTCUTS = [
    { id: 'teams', icon: Users, label: 'My Team' },
    { id: 'messages', icon: MessageCircle, label: 'Messages' },
    { id: 'home', icon: null, label: 'Home' },
    { id: 'payments', icon: DollarSign, label: 'Payments' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50" data-testid="bottom-navigation">
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
                <img 
                  src={rostersLogoUrl}
                  alt="Home"
                  className="mb-1 object-contain invert dark:invert-0"
                  style={{ width: '30px', height: '30px' }}
                />
              ) : Icon && (
                <div className="relative">
                  <Icon className="w-5 h-5 mb-1" />
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
    </div>
  );
}

import { Users, MessageCircle, Bird, User } from 'lucide-react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import rostersLogoUrl from '@assets/Roster R White_1757096715093.png';

const navItems = [
  { id: 'teams', icon: Users, label: 'Teams', path: '/teams' },
  { id: 'messages', icon: MessageCircle, label: 'Messages', path: '/messages' },
  { id: 'home', icon: null, label: 'Home', path: '/' },
  { id: 'more', icon: Bird, label: 'Chirp', path: '/more' },
  { id: 'profile', icon: User, label: 'Profile', path: '/profile' },
];

export function BottomNavigation() {
  const [location, navigate] = useLocation();
  
  // Fetch unread message count
  const { data: unreadData } = useQuery({
    queryKey: ['/api/messages/unread-count'],
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
  });
  
  const unreadCount = (unreadData as { count: number } | undefined)?.count ?? 0;

  const getActiveId = (pathname: string) => {
    if (pathname === '/') return 'home';
    if (pathname.startsWith('/teams')) return 'teams';
    if (pathname.startsWith('/messages')) return 'messages';
    if (pathname.startsWith('/more') || pathname.startsWith('/roster')) return 'more';
    if (pathname.startsWith('/profile') || pathname.startsWith('/subscription')) return 'profile';
    return '';
  };

  const activeId = getActiveId(location);

  return (
    <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-sm bg-card border-t border-border z-50" data-testid="bottom-navigation">
      <div className="grid grid-cols-5 py-2">
        {navItems.map(({ id, icon: Icon, label, path }) => (
          <button
            key={id}
            onClick={() => navigate(path)}
            className={cn(
              "flex flex-col items-center py-2 transition-colors",
              activeId === id ? "text-primary" : "text-muted-foreground"
            )}
            data-testid={`nav-${id}`}
          >
            {id === 'home' ? (
              <img 
                src={rostersLogoUrl}
                alt="Home"
                className="mb-1 object-contain"
                style={{ width: '30px', height: '30px' }}
              />
            ) : Icon && (
              <div className="relative">
                <Icon className="w-5 h-5 mb-1" />
                {id === 'messages' && unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" data-testid="message-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </div>
                )}
              </div>
            )}
            <span className="text-xs">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
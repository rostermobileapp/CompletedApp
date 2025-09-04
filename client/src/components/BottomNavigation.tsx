import { Home, Users, MessageCircle, MoreHorizontal, User } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

const navItems = [
  { id: 'home', icon: Home, label: 'Home', path: '/' },
  { id: 'teams', icon: Users, label: 'Teams', path: '/teams' },
  { id: 'messages', icon: MessageCircle, label: 'Messages', path: '/messages' },
  { id: 'more', icon: MoreHorizontal, label: 'More', path: '/more' },
  { id: 'profile', icon: User, label: 'Profile', path: '/profile' },
];

export function BottomNavigation() {
  const [location, navigate] = useLocation();

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
    <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-sm bg-card border-t border-border" data-testid="bottom-navigation">
      <div className="flex items-center justify-around py-2">
        {navItems.map(({ id, icon: Icon, label, path }) => (
          <button
            key={id}
            onClick={() => navigate(path)}
            className={cn(
              "flex flex-col items-center py-2 px-4 transition-colors",
              activeId === id ? "text-primary" : "text-muted-foreground"
            )}
            data-testid={`nav-${id}`}
          >
            <Icon className="w-5 h-5 mb-1" />
            <span className="text-xs">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

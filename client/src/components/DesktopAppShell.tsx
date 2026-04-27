import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Users, Trophy, Info, LifeBuoy, Shield, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { useLeagueUnreadMessages } from '@/hooks/useLeagueUnreadMessages';
import { useSlideUpOverlay } from '@/components/SlideUpOverlay';
import { DesktopMenuColumn } from '@/components/DesktopMenuColumn';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Dashboard from '@/pages/Dashboard';
import Teams from '@/pages/Teams';
import Messages from '@/pages/Messages';
import PaymentRequests from '@/pages/PaymentRequests';
import Profile from '@/pages/Profile';
import {
  MAIN_NAV_ITEMS,
  getActiveMainScreen,
} from '@/lib/mainNavRoutes';
import homeLogo from '@assets/Home_Logo_1768323157245.png';
import desktopHeaderLogo from '@assets/Roster-12_1777300221378.png';

/**
 * For the 5 primary tabs we render the page component directly (mirroring the
 * mobile SwipeableMainScreens behavior). For every other authenticated route
 * we fall through to the children (the wouter <Switch>).
 */
function getMainScreenForPath(path: string): JSX.Element | null {
  if (path === '/') return <Dashboard />;
  if (path === '/teams') return <Teams />;
  if (path === '/messages') return <Messages />;
  if (path === '/payment-requests') return <PaymentRequests />;
  if (path === '/profile') return <Profile />;
  return null;
}

interface DesktopAppShellProps {
  /**
   * Rendered inside the main content area for routes that are not one of the
   * 5 primary tabs (e.g. /tournaments, /league-management, /create-team, ...).
   */
  children: React.ReactNode;
}

export function DesktopAppShell({ children }: DesktopAppShellProps) {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const {
    selectedType,
    selectedId,
    setTeamSelection,
    setLeagueSelection,
  } = useDashboardSelection();
  const slideOverlay = useSlideUpOverlay();

  const { data: userTeams } = useQuery<any[]>({
    queryKey: ['/api/user/teams'],
    enabled: !!isAuthenticated,
  });

  const { data: userLeagueMemberships } = useQuery<any[]>({
    queryKey: ['/api/user/league-memberships'],
    enabled: !!isAuthenticated,
  });

  const { data: unpaidPaymentData } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    refetchInterval: 60000,
    staleTime: 30000,
    enabled: !!isAuthenticated,
  });

  const unpaidPaymentCount =
    (unpaidPaymentData as { count: number } | undefined)?.count ?? 0;

  const leagueUnreadMessages = useLeagueUnreadMessages();

  const primaryTeamId =
    Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0].id : null;
  const activeScreen = getActiveMainScreen(location, primaryTeamId);

  const currentLeagueId = useMemo(() => {
    if (selectedType === 'league') return selectedId;
    if (selectedType === 'team' && Array.isArray(userTeams)) {
      const team = userTeams.find((t: any) => t.id === selectedId);
      return team?.leagueId ?? null;
    }
    return null;
  }, [selectedType, selectedId, userTeams]);

  const currentLeagueUnread = currentLeagueId
    ? leagueUnreadMessages[currentLeagueId] ?? 0
    : 0;

  const teamOptions = Array.isArray(userTeams) ? userTeams : [];
  const teamLeagueIds = new Set(teamOptions.map((t: any) => t.leagueId));
  const leagueOptions = Array.isArray(userLeagueMemberships)
    ? userLeagueMemberships.filter(
        (m: any) => m.leagueId && !teamLeagueIds.has(m.leagueId),
      )
    : [];

  const dropdownValue =
    selectedType && selectedId ? `${selectedType}:${selectedId}` : '';

  const handleDropdownChange = (value: string) => {
    const [type, id] = value.split(':');
    if (!id) return;
    if (type === 'team') setTeamSelection(id);
    else if (type === 'league') setLeagueSelection(id);
  };

  const handleNavClick = (route: string) => {
    if (slideOverlay?.isOverlayRoute) {
      slideOverlay.closeWithSlideDown(route);
    } else {
      navigate(route);
    }
  };

  const mainScreen = getMainScreenForPath(location);

  return (
    <div
      className="min-h-screen w-full flex bg-background"
      data-testid="desktop-app-shell"
    >
      {/* Left sidebar */}
      <aside
        className="fixed top-0 left-0 h-screen w-[120px] flex flex-col bg-[#3c83f6] border-r border-[#3c83f6] z-40"
        data-testid="desktop-sidebar"
      >
        <div className="px-2 py-6 flex items-center justify-center border-b border-white/20">
          <img src={desktopHeaderLogo} alt="Roster" className="w-14 h-14 object-contain" />
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {MAIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.route)}
                className={cn(
                  'w-full flex flex-col items-center gap-1 px-2 py-3 rounded-lg transition-colors',
                  isActive
                    ? 'bg-white text-[#3c83f6] font-bold'
                    : 'text-white/85 hover:bg-white/10 hover:text-white font-medium',
                )}
                data-testid={`desktop-nav-${item.id}`}
              >
                <span className="relative flex items-center justify-center w-7 h-7 flex-shrink-0">
                  {item.id === 'home' ? (
                    <img
                      src={desktopHeaderLogo}
                      alt=""
                      className="w-7 h-7 object-contain"
                    />
                  ) : Icon ? (
                    <Icon className="w-6 h-6" />
                  ) : null}
                  {item.id === 'messages' && currentLeagueUnread > 0 && (
                    <span
                      className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1"
                      data-testid="desktop-message-badge"
                    >
                      {currentLeagueUnread > 99 ? '99+' : currentLeagueUnread}
                    </span>
                  )}
                  {item.id === 'payments' && unpaidPaymentCount > 0 && (
                    <span
                      className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1"
                      data-testid="desktop-payment-badge"
                    >
                      {unpaidPaymentCount > 99 ? '99+' : unpaidPaymentCount}
                    </span>
                  )}
                </span>
                <span className="text-xs leading-tight text-center">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <nav
          className="px-2 py-3 border-t border-white/20 space-y-1"
          data-testid="desktop-sidebar-footer"
        >
          {[
            { id: 'about', label: 'About', icon: Info, route: '/about' },
            { id: 'support', label: 'Support', icon: LifeBuoy, route: '/support' },
            { id: 'privacy', label: 'Privacy Policy', icon: Shield, route: '/privacy-policy' },
            { id: 'terms', label: 'Terms of Service', icon: FileText, route: '/terms-of-service' },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = location === item.route;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.route)}
                className={cn(
                  'w-full flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors',
                  isActive
                    ? 'bg-white text-[#3c83f6] font-bold'
                    : 'text-white/85 hover:bg-white/10 hover:text-white font-medium',
                )}
                data-testid={`desktop-footer-${item.id}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-[11px] leading-tight text-center">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Permanent menu column — always visible on desktop, replacing the
          hamburger-triggered SlideOutMenu */}
      <aside
        className="fixed top-0 left-[120px] h-screen w-[280px] flex flex-col bg-background border-r border-border z-30 overflow-y-auto"
        data-testid="desktop-menu-sidebar"
      >
        <DesktopMenuColumn />
      </aside>

      {/* Right side: header + main content */}
      <div className="flex-1 ml-[400px] min-h-screen flex flex-col min-w-0">
        <header
          className="sticky top-0 z-20 flex items-center gap-4 px-8 py-3 bg-card/95 backdrop-blur border-b border-border"
          data-testid="desktop-header"
        >
          <div className="flex-1 max-w-md">
            {teamOptions.length > 0 || leagueOptions.length > 0 ? (
              <Select
                value={dropdownValue || undefined}
                onValueChange={handleDropdownChange}
              >
                <SelectTrigger
                  className="w-full h-11"
                  data-testid="desktop-team-selector"
                >
                  <SelectValue placeholder="Select a team or league" />
                </SelectTrigger>
                <SelectContent>
                  {teamOptions.map((team: any) => (
                    <SelectItem
                      key={`team-${team.id}`}
                      value={`team:${team.id}`}
                      data-testid={`desktop-team-option-${team.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <span>{team.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                  {leagueOptions.map((membership: any) => (
                    <SelectItem
                      key={`league-${membership.leagueId}`}
                      value={`league:${membership.leagueId}`}
                      data-testid={`desktop-league-option-${membership.leagueId}`}
                    >
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-primary" />
                        <span>{membership.league?.name ?? 'League'}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div />
            )}
          </div>
        </header>

        <main
          className="flex-1 w-full"
          data-testid="desktop-main-content"
        >
          <div className="mx-auto w-full max-w-[1440px] px-8 py-8">
            {mainScreen ?? children}
          </div>
        </main>
      </div>
    </div>
  );
}

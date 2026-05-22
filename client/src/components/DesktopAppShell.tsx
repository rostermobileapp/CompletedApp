import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Users, Trophy, Swords, Info, LifeBuoy, Clock } from 'lucide-react';
import PastSeasonsModal from '@/components/PastSeasonsModal';
import FeedbackModal from '@/components/FeedbackModal';
import { SiAppstore, SiGoogleplay } from 'react-icons/si';
import { cn } from '@/lib/utils';
import { getImageUrl } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { useLeagueUnreadMessages } from '@/hooks/useLeagueUnreadMessages';
import { useSlideUpOverlay } from '@/components/SlideUpOverlay';
import { DesktopMenuColumn } from '@/components/DesktopMenuColumn';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check } from 'lucide-react';
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
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const {
    selectedType,
    selectedId,
    setTeamSelection,
    setLeagueSelection,
    setTournamentSelection,
  } = useDashboardSelection();
  const slideOverlay = useSlideUpOverlay();

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/user'],
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const { data: userTeams } = useQuery<any[]>({
    queryKey: ['/api/user/teams'],
    enabled: !!isAuthenticated,
  });

  const { data: userLeagueMemberships } = useQuery<any[]>({
    queryKey: ['/api/user/league-memberships'],
    enabled: !!isAuthenticated,
  });

  const { data: userLeagues } = useQuery<any[]>({
    queryKey: ['/api/user/leagues'],
    enabled: !!isAuthenticated,
  });

  // Tournaments where the user is a creator/commissioner or an approved
  // participant. Mirrors the data the mobile dashboard already uses so the
  // desktop selector exposes the same items (including tournaments the user
  // created themselves).
  const { data: userTournaments } = useQuery<any[]>({
    queryKey: ['/api/user/paid-tournaments'],
    enabled: !!isAuthenticated,
  });

  const getTeamDisplayName = (team: any) => {
    if (!team) return 'Select Team';
    if (!team.leagueId) return team.name;
    const league = Array.isArray(userLeagues)
      ? userLeagues.find((l: any) => l.id === team.leagueId)
      : null;
    if (league) {
      const seasonLabel = team.seasonName ?? league.seasonName;
      if (seasonLabel) {
        return `${league.name}: ${seasonLabel} - ${team.name}`;
      }
      return `${league.name}: ${team.name}`;
    }
    return team.name;
  };

  const getLeagueDisplayName = (league: any) => {
    if (!league) return 'Select League';
    if (league.seasonName) {
      return `${league.name}: ${league.seasonName}`;
    }
    return league.name;
  };

  const { data: unpaidPaymentData } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    refetchInterval: 60000,
    staleTime: 30000,
    enabled: !!isAuthenticated,
  });

  const unpaidPaymentCount =
    (unpaidPaymentData as { count: number } | undefined)?.count ?? 0;

  const leagueUnreadMessages = useLeagueUnreadMessages();

  // Per-league actionable task counts (sub approvals, score verifications,
  // pending players, stars). Used to flag the team selector when other
  // teams/leagues have items that need this user's attention.
  const { data: notificationCounts } = useQuery<{
    leagues: Record<string, number>;
    leagueTasks?: Record<string, number>;
    teams?: Record<string, number>;
    tournaments: Record<string, number>;
  }>({
    queryKey: ['/api/user/notification-counts'],
    enabled: !!isAuthenticated,
    refetchInterval: 60000,
    staleTime: 30000,
  });

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

  // Split teams into active vs. past based on the season's isActive flag.
  // Teams with no season association (standalone / legacy) are treated as
  // active so they keep showing in the main selector.
  const allTeams = Array.isArray(userTeams) ? userTeams : [];
  const teamOptions = allTeams.filter(
    (t: any) => t.seasonIsActive !== false,
  );
  const pastSeasonTeams = allTeams.filter(
    (t: any) => t.seasonIsActive === false,
  );
  // Lookup: leagueId -> hasActiveSeason flag (sourced from /api/user/leagues
  // payload, which we extended in getUserLeagues to include season metadata).
  const leagueActivityMap = useMemo(() => {
    const map = new Map<string, { hasActiveSeason: boolean; pastSeasons: any[]; name: string }>();
    if (Array.isArray(userLeagues)) {
      for (const lg of userLeagues as any[]) {
        if (!lg?.id) continue;
        map.set(lg.id, {
          hasActiveSeason: lg.hasActiveSeason !== false,
          pastSeasons: Array.isArray(lg.pastSeasons) ? lg.pastSeasons : [],
          name: lg.name,
        });
      }
    }
    return map;
  }, [userLeagues]);

  // Past-only leagues: leagues the user belongs to where every season has
  // ended. They're hidden from the main selector and surfaced via the modal.
  const pastOnlyLeagues = useMemo(() => {
    if (!Array.isArray(userLeagueMemberships)) return [] as any[];
    const result: any[] = [];
    const seen = new Set<string>();
    for (const m of userLeagueMemberships as any[]) {
      const lid = m?.leagueId;
      if (!lid || seen.has(lid)) continue;
      const info = leagueActivityMap.get(lid);
      if (info && !info.hasActiveSeason) {
        seen.add(lid);
        result.push({
          id: lid,
          name: info.name,
          pastSeasons: info.pastSeasons,
        });
      }
    }
    return result;
  }, [userLeagueMemberships, leagueActivityMap]);

  const hasPastSeasons = pastSeasonTeams.length > 0 || pastOnlyLeagues.length > 0;
  // Only suppress a league from the main list when the user has an ACTIVE
  // team in it. Also hide leagues whose seasons are all closed — those are
  // routed through the Past Seasons modal instead.
  const activeTeamLeagueIds = new Set(teamOptions.map((t: any) => t.leagueId));
  const leagueOptions = Array.isArray(userLeagueMemberships)
    ? (userLeagueMemberships as any[]).filter((m: any) => {
        if (!m.leagueId) return false;
        if (activeTeamLeagueIds.has(m.leagueId)) return false;
        const info = leagueActivityMap.get(m.leagueId);
        // If the league isn't yet in the map (e.g. payload still loading)
        // we keep it visible; once `userLeagues` arrives we filter it out
        // when its seasons are all closed.
        if (info && !info.hasActiveSeason) return false;
        return true;
      })
    : [];
  const [pastSeasonsOpen, setPastSeasonsOpen] = useState(false);
  // Deduplicate tournaments by id (a creator who is also a participant
  // appears twice in the underlying response).
  const tournamentOptions = Array.isArray(userTournaments)
    ? Array.from(
        new Map(
          userTournaments
            .filter((t: any) => t && t.id)
            .map((t: any) => [t.id, t]),
        ).values(),
      )
    : [];

  // Show a slow red pulse on the selector when ANY non-selected context
  // (team, league, or tournament) has unreviewed alerts.
  //   - Per-team check uses team-specific counts so two teams in the same
  //     league are distinguishable (e.g. only one captain has stars pending).
  //   - Per-league check covers commissioner/league-wide items (pending
  //     members, score verifications, scrimmage invites, unread
  //     announcements) for ANY league other than the one currently in view.
  //   - Per-tournament check covers tournament-scoped alerts.
  const otherTeamsHaveAlerts = useMemo(() => {
    const leagueCounts = notificationCounts?.leagues || {};
    const tournamentCounts = notificationCounts?.tournaments || {};
    const teamCounts = notificationCounts?.teams || {};

    // Per-team check (covers same-league multi-team case).
    for (const team of teamOptions) {
      if (selectedType === 'team' && selectedId === team.id) continue;
      if ((teamCounts[team.id] || 0) > 0) return true;
    }
    // Per-league check for any league other than the currently-selected one.
    // This catches commissioner/league-wide alerts (which aren't attributed
    // to individual teams) in OTHER leagues the user belongs to.
    const seenLeagues = new Set<string>();
    for (const team of teamOptions) {
      const lid = team.leagueId;
      if (!lid || seenLeagues.has(lid)) continue;
      seenLeagues.add(lid);
      if (lid === currentLeagueId) continue;
      if ((leagueCounts[lid] || 0) > 0) return true;
    }
    for (const m of leagueOptions) {
      if (!m.leagueId || seenLeagues.has(m.leagueId)) continue;
      seenLeagues.add(m.leagueId);
      if (m.leagueId === currentLeagueId) continue;
      if ((leagueCounts[m.leagueId] || 0) > 0) return true;
    }
    // Tournament-scoped alerts. Only consider tournaments that are actually
    // selectable from the dropdown so the glow can't fire on tournaments the
    // user can't navigate to from here.
    for (const tournament of tournamentOptions) {
      if (selectedType === 'tournament' && selectedId === tournament.id) continue;
      if ((tournamentCounts[tournament.id] || 0) > 0) return true;
    }
    return false;
  }, [
    notificationCounts,
    teamOptions,
    leagueOptions,
    tournamentOptions,
    selectedType,
    selectedId,
    currentLeagueId,
  ]);

  const dropdownValue =
    selectedType && selectedId ? `${selectedType}:${selectedId}` : '';
  const [selectOpen, setSelectOpen] = useState(false);

  // Compute the trigger label ourselves so a past-season selection (made via
  // the modal — those rows are not rendered as SelectItems) still displays
  // correctly in the trigger instead of falling back to the placeholder.
  const triggerLabel = useMemo(() => {
    if (selectedType === 'team' && selectedId) {
      const team = allTeams.find((t: any) => t.id === selectedId);
      if (team) return getTeamDisplayName(team);
    }
    if (selectedType === 'league' && selectedId) {
      const membership = Array.isArray(userLeagueMemberships)
        ? userLeagueMemberships.find((m: any) => m.leagueId === selectedId)
        : null;
      if (membership?.league) return getLeagueDisplayName(membership.league);
      const league = Array.isArray(userLeagues)
        ? userLeagues.find((l: any) => l.id === selectedId)
        : null;
      if (league) return getLeagueDisplayName(league);
    }
    if (selectedType === 'tournament' && selectedId) {
      const tournament = tournamentOptions.find(
        (t: any) => t.id === selectedId,
      );
      if (tournament) return tournament.name || 'Tournament';
    }
    return null;
  }, [
    selectedType,
    selectedId,
    allTeams,
    userLeagueMemberships,
    userLeagues,
    tournamentOptions,
  ]);

  const handleDropdownChange = (value: string) => {
    const [type, id] = value.split(':');
    if (!id) return;
    if (type === 'team') setTeamSelection(id);
    else if (type === 'league') setLeagueSelection(id);
    else if (type === 'tournament') setTournamentSelection(id);
  };

  const handlePastSeasonSelect = (s: { type: 'team' | 'league'; id: string }) => {
    if (s.type === 'team') setTeamSelection(s.id);
    else setLeagueSelection(s.id);
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
      className="h-screen w-full flex bg-background overflow-hidden"
      data-testid="desktop-app-shell"
    >
      {/* Left sidebar — width and icon sizes shrink on smaller / shorter
          desktop screens so all nav items stay visible without scrolling. */}
      <aside
        className="fixed top-0 left-0 h-screen w-[88px] xl:w-[120px] [@media(max-height:760px)]:w-[80px] flex flex-col bg-[#3c83f6] border-r border-[#3c83f6] z-40"
        data-testid="desktop-sidebar"
      >
        <div className="px-2 py-3 xl:py-6 [@media(max-height:760px)]:py-2 flex items-center justify-center border-b border-white/20">
          {currentUser?.profileImageUrl ? (
            <img
              src={getImageUrl(currentUser.profileImageUrl) || ''}
              alt="Profile"
              className="w-10 h-10 xl:w-14 xl:h-14 [@media(max-height:760px)]:w-8 [@media(max-height:760px)]:h-8 rounded-full object-cover ring-2 ring-white/40"
            />
          ) : (
            <img
              src={desktopHeaderLogo}
              alt="Roster"
              className="w-10 h-10 xl:w-14 xl:h-14 [@media(max-height:760px)]:w-8 [@media(max-height:760px)]:h-8 object-contain"
            />
          )}
        </div>
        <nav className="flex-1 px-1.5 xl:px-2 py-2 xl:py-4 [@media(max-height:760px)]:py-1 space-y-0.5 xl:space-y-1 overflow-y-auto">
          {MAIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.route)}
                className={cn(
                  'w-full flex flex-col items-center gap-0.5 xl:gap-1 px-1.5 xl:px-2 py-2 xl:py-3 [@media(max-height:760px)]:py-1.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-black/30 text-white font-bold ring-1 ring-white/20 shadow-[var(--elev-lift)]'
                    : 'text-white/85 hover:bg-black/15 hover:text-white font-medium',
                )}
                data-testid={`desktop-nav-${item.id}`}
              >
                <span className="relative flex items-center justify-center w-6 h-6 xl:w-7 xl:h-7 [@media(max-height:760px)]:w-5 [@media(max-height:760px)]:h-5 flex-shrink-0">
                  {item.id === 'home' ? (
                    <img
                      src={desktopHeaderLogo}
                      alt=""
                      className="w-6 h-6 xl:w-7 xl:h-7 [@media(max-height:760px)]:w-5 [@media(max-height:760px)]:h-5 object-contain"
                    />
                  ) : Icon ? (
                    <Icon className="w-5 h-5 xl:w-6 xl:h-6 [@media(max-height:760px)]:w-4 [@media(max-height:760px)]:h-4" />
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
                <span className="text-[11px] xl:text-xs [@media(max-height:760px)]:text-[10px] leading-tight text-center">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
        <nav
          className="px-1.5 xl:px-2 py-2 xl:py-3 [@media(max-height:760px)]:py-1.5 border-t border-white/20 space-y-0.5 xl:space-y-1"
          data-testid="desktop-sidebar-footer"
        >
          {([
            { id: 'about', label: 'About', icon: Info, route: '/about' },
            { id: 'support', label: 'Support', icon: LifeBuoy, route: '/support' },
            {
              id: 'app-store',
              label: 'App Store',
              icon: SiAppstore,
              href: 'https://apps.apple.com/us/app/roster-hockey/id6756852981',
            },
            {
              id: 'google-play',
              label: 'Google Play',
              icon: SiGoogleplay,
              href: 'https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively&utm_source=na_Med',
            },
          ] as const).map((item) => {
            const Icon = item.icon;
            const isActive = 'route' in item && location === item.route;
            const baseClasses = cn(
              'w-full flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors',
              isActive
                ? 'bg-black/30 text-white font-bold ring-1 ring-white/20 shadow-[var(--elev-lift)]'
                : 'text-white/85 hover:bg-black/15 hover:text-white font-medium',
            );

            if ('href' in item) {
              return (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={baseClasses}
                  data-testid={`desktop-footer-${item.id}`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-[11px] leading-tight text-center">{item.label}</span>
                </a>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.route)}
                className={baseClasses}
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
          hamburger-triggered SlideOutMenu. Its `left` offset tracks the
          responsive sidebar width above. */}
      <aside
        className="fixed top-0 left-[88px] xl:left-[120px] [@media(max-height:760px)]:left-[80px] h-screen w-[280px] flex flex-col bg-background border-r border-border z-30 overflow-y-auto"
        data-testid="desktop-menu-sidebar"
      >
        <DesktopMenuColumn />
      </aside>
      {/* Right side: header + main content. Margin tracks sidebar (88/120) +
          permanent menu column (280) widths. */}
      <div className="flex-1 ml-[368px] xl:ml-[400px] [@media(max-height:760px)]:ml-[360px] h-screen flex flex-col min-w-0">
        <header
          className="flex-shrink-0 z-20 flex items-center gap-4 px-8 py-3 bg-card/95 backdrop-blur border-b border-border"
          data-testid="desktop-header"
        >
          <div className="flex-1 max-w-md">
            {teamOptions.length > 0 ||
            leagueOptions.length > 0 ||
            tournamentOptions.length > 0 ||
            hasPastSeasons ? (
              <Select
                value={dropdownValue || undefined}
                onValueChange={handleDropdownChange}
                open={selectOpen}
                onOpenChange={setSelectOpen}
              >
                <SelectTrigger
                  className={cn(
                    'w-full h-11',
                    otherTeamsHaveAlerts && 'alerts-glow',
                  )}
                  data-testid="desktop-team-selector"
                >
                  <SelectValue placeholder="Select a team, league, or tournament">
                    {triggerLabel ?? undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {teamOptions.map((team: any) => {
                    const count =
                      (team.leagueId &&
                        notificationCounts?.leagues?.[team.leagueId]) ||
                      0;
                    const label = getTeamDisplayName(team);
                    return (
                      <SelectPrimitive.Item
                        key={`team-${team.id}`}
                        value={`team:${team.id}`}
                        textValue={label}
                        className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        data-testid={`desktop-team-option-${team.id}`}
                      >
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <SelectPrimitive.ItemIndicator>
                            <Check className="h-4 w-4" />
                          </SelectPrimitive.ItemIndicator>
                        </span>
                        <div className="flex items-center justify-between gap-2 w-full">
                          <SelectPrimitive.ItemText>
                            <span className="flex items-center gap-2 min-w-0">
                              <Users className="w-4 h-4 text-primary flex-shrink-0" />
                              <span className="truncate">{label}</span>
                            </span>
                          </SelectPrimitive.ItemText>
                          {count > 0 && (
                            <span
                              className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold"
                              data-testid={`desktop-team-alert-count-${team.id}`}
                            >
                              {count}
                            </span>
                          )}
                        </div>
                      </SelectPrimitive.Item>
                    );
                  })}
                  {leagueOptions.map((membership: any) => {
                    const count =
                      (membership.leagueId &&
                        notificationCounts?.leagues?.[membership.leagueId]) ||
                      0;
                    const label =
                      getLeagueDisplayName(membership.league) ?? 'League';
                    return (
                      <SelectPrimitive.Item
                        key={`league-${membership.leagueId}`}
                        value={`league:${membership.leagueId}`}
                        textValue={label}
                        className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        data-testid={`desktop-league-option-${membership.leagueId}`}
                      >
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <SelectPrimitive.ItemIndicator>
                            <Check className="h-4 w-4" />
                          </SelectPrimitive.ItemIndicator>
                        </span>
                        <div className="flex items-center justify-between gap-2 w-full">
                          <SelectPrimitive.ItemText>
                            <span className="flex items-center gap-2 min-w-0">
                              <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
                              <span className="truncate">{label}</span>
                            </span>
                          </SelectPrimitive.ItemText>
                          {count > 0 && (
                            <span
                              className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold"
                              data-testid={`desktop-league-alert-count-${membership.leagueId}`}
                            >
                              {count}
                            </span>
                          )}
                        </div>
                      </SelectPrimitive.Item>
                    );
                  })}
                  {tournamentOptions.map((tournament: any) => {
                    const count =
                      notificationCounts?.tournaments?.[tournament.id] || 0;
                    const label = tournament.name || 'Tournament';
                    return (
                      <SelectPrimitive.Item
                        key={`tournament-${tournament.id}`}
                        value={`tournament:${tournament.id}`}
                        textValue={label}
                        className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        data-testid={`desktop-tournament-option-${tournament.id}`}
                      >
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <SelectPrimitive.ItemIndicator>
                            <Check className="h-4 w-4" />
                          </SelectPrimitive.ItemIndicator>
                        </span>
                        <div className="flex items-center justify-between gap-2 w-full">
                          <SelectPrimitive.ItemText>
                            <span className="flex items-center gap-2 min-w-0">
                              <Swords className="w-4 h-4 text-primary flex-shrink-0" />
                              <span className="truncate">{label}</span>
                            </span>
                          </SelectPrimitive.ItemText>
                          {count > 0 && (
                            <span
                              className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold"
                              data-testid={`desktop-tournament-alert-count-${tournament.id}`}
                            >
                              {count}
                            </span>
                          )}
                        </div>
                      </SelectPrimitive.Item>
                    );
                  })}
                  {hasPastSeasons && (
                    // Non-selectable footer button: closes the Radix select
                    // and opens the Past Seasons modal instead of selecting a
                    // value. Using onPointerDown so we beat Radix's internal
                    // focus/close handling.
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectOpen(false);
                        setPastSeasonsOpen(true);
                      }}
                      className="mt-1 w-full text-left flex items-center gap-2 rounded-sm py-2 pl-8 pr-2 text-sm border-t border-border hover:bg-accent hover:text-accent-foreground"
                      data-testid="desktop-past-seasons-option"
                    >
                      <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">Past Seasons</span>
                    </button>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div />
            )}
          </div>
          {/* Find a League / Team / Feedback buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate('/league-tournament-search')}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 font-medium text-sm whitespace-nowrap"
              data-testid="desktop-button-find-league"
            >
              Find a League / Tournament
            </button>
            <button
              onClick={() => navigate('/team-search')}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 font-medium text-sm whitespace-nowrap"
              data-testid="desktop-button-find-team"
            >
              Find a Team
            </button>
            <button
              onClick={() => setShowFeedbackModal(true)}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 font-medium text-sm whitespace-nowrap"
              data-testid="desktop-button-send-feedback"
            >
              Send Feedback
            </button>
          </div>
        </header>
        <FeedbackModal isOpen={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />
        <PastSeasonsModal
          open={pastSeasonsOpen}
          onOpenChange={setPastSeasonsOpen}
          teams={pastSeasonTeams as any[]}
          leagues={
            Array.isArray(userLeagues)
              ? (userLeagues as any[]).map((l: any) => ({
                  id: l.id,
                  name: l.name,
                  isPastOnly: l.hasActiveSeason === false,
                  pastSeasons: Array.isArray(l.pastSeasons) ? l.pastSeasons : [],
                }))
              : []
          }
          onSelect={handlePastSeasonSelect}
        />

        <main
          className="flex-1 w-full overflow-y-auto"
          data-testid="desktop-main-content"
        >
          <div className="mx-auto w-full max-w-[1440px] px-8 py-8 h-full pt-[4px] pb-[4px] pl-[0px] pr-[0px]">
            {mainScreen ?? children}
          </div>
        </main>
      </div>
    </div>
  );
}

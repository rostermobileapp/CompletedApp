import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Trophy, Clipboard, ChevronRight } from 'lucide-react';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { TournamentCountdown } from '@/components/TournamentCountdown';
import { Button } from '@/components/ui/button';
import { getImageUrl } from '@/lib/queryClient';
import { PAGE_BG, cardClass, cardStyle, sectionTitleClass } from './cardStyles';
import { UpNextCard } from './UpNextCard';
import { AlertsExpanded } from './AlertsExpanded';
import { TeamLeadersCard } from './TeamLeadersCard';
import { StandingsTable } from './StandingsTable';
import { ScheduleCalendar } from './ScheduleCalendar';

interface UserTeam {
  id: string;
  leagueId?: string | null;
}

interface HomeDesktopProps {
  /** Optional callback to open the global add-event dialog (rendered in
   *  Dashboard.tsx). When provided, the Schedule card shows an "+ Add"
   *  button in its header that triggers this. */
  onAddEvent?: () => void;
}

/**
 * Desktop-only Roster Home page (>=1024px). Renders inside the existing
 * DesktopAppShell. Mobile/tablet (<1024px) and Natively/Capacitor wrappers
 * keep the original mobile Dashboard layout — see Dashboard.tsx where this
 * component is gated by useIsDesktopWeb().
 *
 * Layout (final, per user feedback on 2026-04-27):
 *   ≥1024px: Row 1 = Up Next + Alerts (1fr/1fr)
 *            Row 2 = Schedule card (capped at 1080px, centered)
 *            Row 3 = Team Leaders + Standings (1.4fr/1fr)
 */
export function HomeDesktop({ onAddEvent }: HomeDesktopProps = {}) {
  const {
    selectedType,
    selectedId,
    selectedTeamId,
    selectedLeagueId,
    selectedTournamentId,
  } = useDashboardSelection();
  const isTournamentScope = selectedType === 'tournament' && !!selectedTournamentId;

  const { data: userTeams } = useQuery<UserTeam[]>({
    queryKey: ['/api/user/teams'],
    staleTime: 60_000,
  });

  const { data: userLeagues } = useQuery<any[]>({
    queryKey: ['/api/user/leagues'],
    staleTime: 60_000,
  });

  // Effective league id: explicit league selection, else selected team's league,
  // else the first league the user has any team in. When the user picked a
  // tournament we don't fall back to a league at all, otherwise the home
  // screen would silently show another league's standings/leaders/alerts.
  const effectiveLeagueId = useMemo<string | null>(() => {
    if (isTournamentScope) return null;
    if (selectedType === 'league' && selectedLeagueId) return selectedLeagueId;
    if (selectedType === 'team' && selectedTeamId && Array.isArray(userTeams)) {
      const t = userTeams.find((x) => x.id === selectedTeamId);
      if (t?.leagueId) return t.leagueId;
    }
    if (Array.isArray(userTeams) && userTeams.length > 0) {
      const first = userTeams.find((t) => !!t.leagueId);
      if (first?.leagueId) return first.leagueId;
    }
    if (Array.isArray(userLeagues) && userLeagues.length > 0) {
      return userLeagues[0]?.id || null;
    }
    return null;
  }, [
    isTournamentScope,
    selectedType,
    selectedLeagueId,
    selectedTeamId,
    userTeams,
    userLeagues,
  ]);

  const allUserTeamIds = useMemo<string[]>(
    () => (Array.isArray(userTeams) ? userTeams.map((t) => t.id) : []),
    [userTeams],
  );

  const userTeamIdsInLeague = useMemo<string[]>(() => {
    if (!Array.isArray(userTeams) || !effectiveLeagueId) return [];
    return userTeams
      .filter((t) => t.leagueId === effectiveLeagueId)
      .map((t) => t.id);
  }, [userTeams, effectiveLeagueId]);

  // True when the user explicitly selected a league (no specific team scope).
  // In that case, Up Next and Schedule should restrict to events involving
  // any of the user's teams within that league instead of a single team.
  const isLeagueScope = selectedType === 'league' && !selectedTeamId;

  // Fetch active season for the league for the season label / leaders sort
  const { data: seasons } = useQuery<any[]>({
    queryKey: [`/api/leagues/${effectiveLeagueId}/seasons`],
    enabled: !!effectiveLeagueId,
    staleTime: 5 * 60 * 1000,
  });

  const activeSeason = useMemo(() => {
    if (!Array.isArray(seasons)) return null;
    return seasons.find((s) => s?.isActive) || seasons[0] || null;
  }, [seasons]);

  // Effective season id: prefer the selected team's own seasonId, fall back to the
  // league's active season. This ensures standings (and other season-scoped data)
  // always show data for the season the user currently has selected, not all-time.
  const effectiveSeasonId = useMemo<string | null>(() => {
    if (isTournamentScope) return null;
    if (selectedType === 'team' && selectedTeamId && Array.isArray(userTeams)) {
      const t = userTeams.find((x: any) => x.id === selectedTeamId);
      if (t?.seasonId) return t.seasonId;
    }
    return activeSeason?.id || null;
  }, [isTournamentScope, selectedType, selectedTeamId, userTeams, activeSeason]);

  const seasonLabel: string | undefined =
    activeSeason?.name ||
    (activeSeason?.year ? String(activeSeason.year) : undefined) ||
    String(new Date().getFullYear());

  return (
    <div
      className="min-h-screen w-full"
      style={{ backgroundColor: PAGE_BG }}
      data-testid="home-desktop"
    >
      <div className="mx-auto w-full max-w-[1280px] px-6 py-6 flex flex-col gap-4">
        {isTournamentScope ? (
          <>
            {/* Tournament layout: Up Next + Alerts full-width, then tournament cards */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <UpNextCard
                effectiveLeagueId={effectiveLeagueId}
                selectedTeamId={selectedTeamId}
                userTeamIds={allUserTeamIds}
                isLeagueScope={isLeagueScope}
                leagueTeamIds={userTeamIdsInLeague}
                selectedTournamentId={selectedTournamentId}
              />
              <AlertsExpanded
                effectiveLeagueId={effectiveLeagueId}
                userTeamIds={allUserTeamIds}
              />
            </div>
            <TournamentBracketCard tournamentId={selectedTournamentId!} />
            <TournamentScorekeeperCard tournamentId={selectedTournamentId!} />
          </>
        ) : (
          <>
            {/* Row 1: Left = compact Up Next + Alerts stacked; Right = Stats + Standings */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_3fr] lg:items-stretch">
              {/* Left column: compact cards stacked */}
              <div className="flex flex-col gap-4">
                <UpNextCard
                  compact
                  effectiveLeagueId={effectiveLeagueId}
                  selectedTeamId={selectedTeamId}
                  userTeamIds={allUserTeamIds}
                  isLeagueScope={isLeagueScope}
                  leagueTeamIds={userTeamIdsInLeague}
                  selectedTournamentId={selectedTournamentId}
                />
                <AlertsExpanded
                  compact
                  effectiveLeagueId={effectiveLeagueId}
                  userTeamIds={allUserTeamIds}
                />
              </div>
              {/* Right column: Stats + Standings side by side, full height */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
                <TeamLeadersCard
                  effectiveLeagueId={effectiveLeagueId}
                  seasonId={activeSeason?.id || null}
                  seasonLabel={seasonLabel}
                  seasons={seasons ?? undefined}
                />
                <StandingsTable
                  effectiveLeagueId={effectiveLeagueId}
                  userTeamIdsInLeague={userTeamIdsInLeague}
                  seasonLabel={seasonLabel}
                  seasonId={effectiveSeasonId}
                  seasons={seasons ?? undefined}
                />
              </div>
            </div>
          </>
        )}

        {/* Schedule (capped 1080px, centered) */}
        <div className="mx-auto w-full max-w-[1080px]">
          <ScheduleCalendar
            selectedTeamId={selectedTeamId}
            effectiveLeagueId={effectiveLeagueId}
            userTeamIds={allUserTeamIds}
            isLeagueScope={isLeagueScope}
            leagueTeamIds={userTeamIdsInLeague}
            onAddEvent={onAddEvent}
            selectedTournamentId={selectedTournamentId}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Tournament-scoped bottom card. Mirrors the mobile dashboard's tournament
 * section: shows a live countdown when the user's access window has not yet
 * opened, otherwise a "View Bracket" CTA that navigates to the tournament
 * detail page. Polls the tournament every 30s so the countdown auto-swaps to
 * the bracket card the moment access opens, without requiring a refresh.
 */
function TournamentBracketCard({ tournamentId }: { tournamentId: string }) {
  const [, navigate] = useLocation();
  const { data: tournament } = useQuery<any>({
    queryKey: ['/api/tournaments', tournamentId],
    enabled: !!tournamentId,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  if (!tournament) {
    return (
      <div
        className={cardClass}
        style={cardStyle}
        data-testid="card-tournament-bracket-loading"
      >
        <div className="h-24 rounded-lg bg-black/[0.03] animate-pulse" />
      </div>
    );
  }

  if (tournament.accessState === 'pending') {
    return (
      <div
        className={cardClass}
        style={cardStyle}
        data-testid="card-tournament-countdown"
      >
        <div className="[&>div]:min-h-0 [&>div]:py-0">
          <TournamentCountdown
            tournamentId={tournament.id}
            name={tournament.name}
            logoUrl={tournament.logoUrl}
            accessStartDate={tournament.accessStartDate}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cardClass}
      style={cardStyle}
      data-testid="card-tournament-bracket"
    >
      <div className={sectionTitleClass}>Tournament</div>
      <div className="mt-3 flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-[#FBEDD8] flex items-center justify-center overflow-hidden flex-shrink-0">
          {tournament.logoUrl ? (
            <img
              src={getImageUrl(tournament.logoUrl) || ''}
              alt={`${tournament.name} logo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <Trophy className="w-6 h-6" style={{ color: '#d97706' }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[15px] font-medium text-[#212121] truncate"
            data-testid="tournament-bracket-name"
          >
            {tournament.name}
          </div>
          {tournament.uniqueTournamentId && (
            <div className="text-[12px] text-[#777] truncate">
              ID: {tournament.uniqueTournamentId}
            </div>
          )}
        </div>
        <Button
          onClick={() => {
            setPageTransitionDirection('up');
            navigate(`/tournaments/${tournament.id}`);
          }}
          className="bg-orange-500 hover:bg-orange-600"
          data-testid="button-view-bracket"
        >
          View Bracket
        </Button>
      </div>
    </div>
  );
}

/**
 * Scorekeeper Dashboard shortcut, shown on the desktop home only when the
 * user has scorekeeper access for the selected tournament. Mirrors the
 * mobile Dashboard's scorekeeper link box (Dashboard.tsx ~line 2693).
 *
 * Access is determined server-side via `/api/scorekeeper/options`, which
 * returns the set of leagues + tournaments the current user is allowed to
 * scorekeep (commissioners, league/global stat_managers, tournament creators,
 * and explicit tournament scorekeeper invitees). If the selected tournament
 * appears in that list, we render the card.
 */
function TournamentScorekeeperCard({ tournamentId }: { tournamentId: string }) {
  const [, navigate] = useLocation();
  const { data: options } = useQuery<{
    tournaments?: Array<{ id: string }>;
  }>({
    queryKey: ['/api/scorekeeper/options'],
    staleTime: 60_000,
  });

  const hasAccess = useMemo(
    () =>
      Array.isArray(options?.tournaments) &&
      options!.tournaments!.some((t) => t.id === tournamentId),
    [options, tournamentId],
  );

  if (!hasAccess) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setPageTransitionDirection('up');
        navigate('/scorekeeper');
      }}
      className={`${cardClass} w-full text-left hover:bg-black/[0.02] transition-colors`}
      style={cardStyle}
      data-testid="card-tournament-scorekeeper"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Clipboard className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-[#212121]">
            Scorekeeper Dashboard
          </div>
          <div className="text-[12px] text-[#777]">
            Manage game scores for this tournament
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-[#777] flex-shrink-0" />
      </div>
    </button>
  );
}

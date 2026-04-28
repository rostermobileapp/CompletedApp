import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { PAGE_BG } from './cardStyles';
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
  const { selectedType, selectedId, selectedTeamId, selectedLeagueId } =
    useDashboardSelection();

  const { data: userTeams } = useQuery<UserTeam[]>({
    queryKey: ['/api/user/teams'],
    staleTime: 60_000,
  });

  const { data: userLeagues } = useQuery<any[]>({
    queryKey: ['/api/user/leagues'],
    staleTime: 60_000,
  });

  // Effective league id: explicit league selection, else selected team's league,
  // else the first league the user has any team in.
  const effectiveLeagueId = useMemo<string | null>(() => {
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
  }, [selectedType, selectedLeagueId, selectedTeamId, userTeams, userLeagues]);

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
        {/* Row 1: Up Next + Alerts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UpNextCard
            effectiveLeagueId={effectiveLeagueId}
            selectedTeamId={selectedTeamId}
            userTeamIds={allUserTeamIds}
            isLeagueScope={isLeagueScope}
            leagueTeamIds={userTeamIdsInLeague}
          />
          <AlertsExpanded
            effectiveLeagueId={effectiveLeagueId}
            userTeamIds={allUserTeamIds}
          />
        </div>

        {/* Row 2: Schedule (capped 1080px, centered) */}
        <div className="mx-auto w-full max-w-[1080px]">
          <ScheduleCalendar
            selectedTeamId={selectedTeamId}
            effectiveLeagueId={effectiveLeagueId}
            userTeamIds={allUserTeamIds}
            isLeagueScope={isLeagueScope}
            leagueTeamIds={userTeamIdsInLeague}
            onAddEvent={onAddEvent}
          />
        </div>

        {/* Row 3: Team Leaders + Standings */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <TeamLeadersCard
            effectiveLeagueId={effectiveLeagueId}
            seasonId={activeSeason?.id || null}
            seasonLabel={seasonLabel}
          />
          <StandingsTable
            effectiveLeagueId={effectiveLeagueId}
            userTeamIdsInLeague={userTeamIdsInLeague}
            seasonLabel={seasonLabel}
          />
        </div>
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { Trophy, MapPin, Clock } from 'lucide-react';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { cardClass, cardStyle, sectionTitleClass } from './cardStyles';

interface UpNextCardProps {
  effectiveLeagueId?: string | null;
  selectedTeamId?: string | null;
  userTeamIds: string[];
  /** When true, the user has selected a league (not a specific team). Filter
   *  to games involving only that league's teams instead of a single team. */
  isLeagueScope?: boolean;
  /** All user-team IDs that belong to the active league (for league scope). */
  leagueTeamIds?: string[];
  /** When set, restrict to tournament matches for the given tournament. */
  selectedTournamentId?: string | null;
  /** Compact mode: reduced padding and condensed content for narrow column layouts. */
  compact?: boolean;
}

interface UpcomingItem {
  id: string;
  scheduledAt: string;
  homeTeam?: { id: string; name: string; logoUrl?: string | null } | null;
  awayTeam?: { id: string; name: string; logoUrl?: string | null } | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  venue?: string | null;
  location?: string | null;
  isScrimmage?: boolean;
  scrimmageTitle?: string | null;
  isCompleted?: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
  tournamentId?: string | null;
  isTournamentMatch?: boolean;
}

export function UpNextCard({
  effectiveLeagueId,
  selectedTeamId,
  userTeamIds,
  isLeagueScope = false,
  leagueTeamIds,
  selectedTournamentId,
  compact = false,
}: UpNextCardProps) {
  const [, navigate] = useLocation();

  const { data: upcoming, isLoading: upcomingLoading } = useQuery<UpcomingItem[]>({
    queryKey: ['/api/user/games/upcoming'],
    staleTime: 30_000,
  });

  // When a league is selected, also fetch ALL league games so commissioners
  // (who may have no team) can still see the next game in the league.
  const { data: leagueGames, isLoading: leagueLoading } = useQuery<UpcomingItem[]>({
    queryKey: ['/api/leagues', effectiveLeagueId, 'games'],
    enabled: isLeagueScope && !!effectiveLeagueId,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/leagues/${effectiveLeagueId}/games`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const isLoading = upcomingLoading || (isLeagueScope && leagueLoading);

  // Pick the next non-completed game (prefer real games over scrimmages but
  // the API already returns chronological order, so use first non-completed).
  const nextGame = (() => {
    const now = Date.now();

    const makeEligible = (list: UpcomingItem[] | undefined) => {
      if (!Array.isArray(list)) return [];
      return list.filter((g) => {
        if (g.isCompleted) return false;
        const t = new Date(g.scheduledAt).getTime();
        if (Number.isNaN(t)) return false;
        return t + 2 * 60 * 60 * 1000 >= now;
      });
    };

    const eligible = makeEligible(upcoming);

    // Tournament scope: only show this tournament's matches.
    if (selectedTournamentId) {
      return eligible.find((g) => g.tournamentId === selectedTournamentId) || null;
    }

    // Strict team scope: when a team is selected, only show that team's games.
    if (selectedTeamId) {
      return eligible.find(
        (g) =>
          g.homeTeam?.id === selectedTeamId ||
          g.awayTeam?.id === selectedTeamId ||
          g.homeTeamId === selectedTeamId ||
          g.awayTeamId === selectedTeamId,
      ) || null;
    }

    if (isLeagueScope) {
      // When the user has teams in the league, prefer their next playing game.
      if (Array.isArray(leagueTeamIds) && leagueTeamIds.length) {
        const set = new Set(leagueTeamIds);
        const teamGame = eligible.find(
          (g) =>
            (g.homeTeam?.id && set.has(g.homeTeam.id)) ||
            (g.awayTeam?.id && set.has(g.awayTeam.id)) ||
            (g.homeTeamId && set.has(g.homeTeamId)) ||
            (g.awayTeamId && set.has(g.awayTeamId)),
        );
        if (teamGame) return teamGame;
      }

      // Commissioner-only (or no team game found): show next scheduled
      // game in the league, sorted ascending by scheduledAt.
      const leagueEligible = makeEligible(leagueGames).sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
      return leagueEligible[0] || null;
    }

    return eligible[0] || null;
  })();

  // Determine which team is "us" for this game so we can show the opponent
  const ourTeamId = nextGame
    ? userTeamIds.find(
        (id) =>
          id === nextGame.homeTeam?.id ||
          id === nextGame.awayTeam?.id ||
          id === nextGame.homeTeamId ||
          id === nextGame.awayTeamId,
      ) || null
    : null;

  const opponent = nextGame
    ? nextGame.homeTeam?.id === ourTeamId
      ? nextGame.awayTeam
      : nextGame.homeTeam
    : null;

  // Fetch RSVP summary for the upcoming game (if a real game, not scrimmage)
  const showRsvp = !!nextGame && !nextGame.isScrimmage && !!ourTeamId;
  const { data: rsvpSummary } = useQuery<{
    attending?: any[];
    notAttending?: any[];
    noResponse?: any[];
  }>({
    queryKey: [
      `/api/games/${nextGame?.id}/rsvp-summary`,
      ourTeamId || undefined,
    ],
    enabled: showRsvp,
    queryFn: async () => {
      const url = `/api/games/${nextGame!.id}/rsvp-summary?teamId=${ourTeamId}`;
      const res = await apiRequest('GET', url);
      return res.json();
    },
    staleTime: 30_000,
  });

  const handleClick = () => {
    if (!nextGame) return;
    setPageTransitionDirection('up');
    navigate(`/game/${nextGame.id}`);
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <div
          className={`${compact ? 'mt-2 h-12' : 'mt-3 h-20'} rounded-lg bg-black/[0.03] animate-pulse`}
          data-testid="up-next-loading"
        />
      );
    }

    if (!nextGame) {
      const emptyMessage = selectedTournamentId
        ? 'No upcoming tournament matches'
        : selectedTeamId
        ? 'No upcoming games for this team'
        : isLeagueScope
          ? 'No upcoming games for this league'
          : 'No upcoming games scheduled.';
      return (
        <div
          className={`text-sm text-[#666] ${compact ? 'mt-2 py-1' : 'mt-3 py-6 text-center'}`}
          data-testid="up-next-empty"
        >
          {emptyMessage}
        </div>
      );
    }

    // Pick the headline. When the viewer plays on one of the teams we use
    // the familiar "vs Opponent" framing. When they don't (e.g. tournament
    // admin watching all bracket games), we show "TeamA vs TeamB" so they
    // can see who's actually playing.
    const home = nextGame.homeTeam;
    const away = nextGame.awayTeam;
    const homeName = home?.name?.trim() || 'TBD';
    const awayName = away?.name?.trim() || 'TBD';
    let headline: string;
    if (nextGame.isScrimmage) {
      headline = nextGame.scrimmageTitle || 'Scrimmage';
    } else if (ourTeamId && opponent?.name) {
      headline = `vs ${opponent.name}`;
    } else if (home || away) {
      headline = `${homeName} vs ${awayName}`;
    } else {
      headline = 'Game';
    }
    const venueText = nextGame.venue || nextGame.location || '';

    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className={`${compact ? 'mt-2' : 'mt-3'} w-full flex items-center gap-2.5 text-left rounded-lg p-2 -mx-2 hover:bg-black/[0.03] transition-colors`}
          data-testid="up-next-game"
        >
          <div className={`${compact ? 'w-9 h-9' : 'w-12 h-12'} rounded-lg bg-[#DBEAFE] flex items-center justify-center overflow-hidden flex-shrink-0`}>
            {opponent?.logoUrl ? (
              <img
                src={getImageUrl(opponent.logoUrl) || ''}
                alt={`${opponent.name} logo`}
                className="w-full h-full object-cover"
              />
            ) : (
              <Trophy className={`${compact ? 'w-4 h-4' : 'w-5 h-5'}`} style={{ color: '#1E3A8A' }} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`${compact ? 'text-[13px]' : 'text-[15px]'} font-medium text-[#212121] truncate`}>
              {headline}
            </div>
            <div className={`mt-0.5 flex items-center gap-1 ${compact ? 'text-[12px]' : 'text-[13px]'} text-[#555]`}>
              <Clock className="w-3 h-3" />
              <span className="truncate">
                {format(new Date(nextGame.scheduledAt), compact ? 'MMM d • h:mm a' : 'EEE MMM d • h:mm a')}
              </span>
            </div>
            {venueText && !compact && (
              <div className="mt-0.5 flex items-center gap-1 text-[12px] text-[#777]">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{venueText}</span>
              </div>
            )}
          </div>
        </button>

        {showRsvp && (
          <div
            className={`${compact ? 'mt-2' : 'mt-3'} grid grid-cols-3 gap-1.5`}
            data-testid="up-next-rsvp"
          >
            <RsvpCell
              count={rsvpSummary?.attending?.length || 0}
              label="in"
              bg="#E6F6EC"
              fg="#15803d"
              testid="rsvp-in"
              compact={compact}
            />
            <RsvpCell
              count={rsvpSummary?.notAttending?.length || 0}
              label="out"
              bg="#FBE7E7"
              fg="#b91c1c"
              testid="rsvp-out"
              compact={compact}
            />
            <RsvpCell
              count={rsvpSummary?.noResponse?.length || 0}
              label="?"
              bg="#EFEFEC"
              fg="#555"
              testid="rsvp-noresponse"
              compact={compact}
            />
          </div>
        )}
      </>
    );
  };

  const wrapperClass = compact
    ? 'bg-white rounded-xl px-4 py-3 text-[#212121]'
    : cardClass;

  return (
    <div className={wrapperClass} style={cardStyle} data-testid="card-up-next">
      <div className={compact ? 'text-[13px] font-medium text-[#212121] tracking-tight' : sectionTitleClass}>Up next</div>
      {renderBody()}
    </div>
  );
}

function RsvpCell({
  count,
  label,
  bg,
  fg,
  testid,
  compact = false,
}: {
  count: number;
  label: string;
  bg: string;
  fg: string;
  testid: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg text-center ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
      style={{ backgroundColor: bg, color: fg }}
      data-testid={testid}
    >
      <div className={`${compact ? 'text-[14px]' : 'text-[18px]'} font-medium leading-none`}>{count}</div>
      <div className={`${compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'}`}>{label}</div>
    </div>
  );
}

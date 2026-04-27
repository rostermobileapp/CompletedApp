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
}

export function UpNextCard({
  effectiveLeagueId: _effectiveLeagueId,
  selectedTeamId,
  userTeamIds,
  isLeagueScope = false,
  leagueTeamIds,
}: UpNextCardProps) {
  const [, navigate] = useLocation();

  const { data: upcoming, isLoading } = useQuery<UpcomingItem[]>({
    queryKey: ['/api/user/games/upcoming'],
    staleTime: 30_000,
  });

  // Pick the next non-completed game (prefer real games over scrimmages but
  // the API already returns chronological order, so use first non-completed).
  const nextGame = (() => {
    if (!Array.isArray(upcoming)) return null;
    const now = Date.now();
    const eligible = upcoming.filter((g) => {
      if (g.isCompleted) return false;
      const t = new Date(g.scheduledAt).getTime();
      if (Number.isNaN(t)) return false;
      // Show items up to 2 hours after scheduled start
      return t + 2 * 60 * 60 * 1000 >= now;
    });

    // If a team is selected, prefer that team's games
    if (selectedTeamId) {
      const teamGame = eligible.find(
        (g) =>
          g.homeTeam?.id === selectedTeamId ||
          g.awayTeam?.id === selectedTeamId ||
          g.homeTeamId === selectedTeamId ||
          g.awayTeamId === selectedTeamId,
      );
      if (teamGame) return teamGame;
    }

    // If a league is selected (not a specific team), restrict to games
    // involving the user's teams in that league.
    if (isLeagueScope && Array.isArray(leagueTeamIds) && leagueTeamIds.length) {
      const set = new Set(leagueTeamIds);
      const leagueGame = eligible.find(
        (g) =>
          (g.homeTeam?.id && set.has(g.homeTeam.id)) ||
          (g.awayTeam?.id && set.has(g.awayTeam.id)) ||
          (g.homeTeamId && set.has(g.homeTeamId)) ||
          (g.awayTeamId && set.has(g.awayTeamId)),
      );
      if (leagueGame) return leagueGame;
      return null;
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
          className="mt-3 h-20 rounded-lg bg-black/[0.03] animate-pulse"
          data-testid="up-next-loading"
        />
      );
    }

    if (!nextGame) {
      return (
        <div
          className="mt-3 text-sm text-[#666] py-6 text-center"
          data-testid="up-next-empty"
        >
          No upcoming games scheduled.
        </div>
      );
    }

    const opponentName =
      opponent?.name ||
      (nextGame.isScrimmage ? nextGame.scrimmageTitle || 'Scrimmage' : 'Game');
    const venueText = nextGame.venue || nextGame.location || '';

    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className="mt-3 w-full flex items-center gap-3 text-left rounded-lg p-2 -mx-2 hover:bg-black/[0.03] transition-colors"
          data-testid="up-next-game"
        >
          <div className="w-12 h-12 rounded-lg bg-[#DBEAFE] flex items-center justify-center overflow-hidden flex-shrink-0">
            {opponent?.logoUrl ? (
              <img
                src={getImageUrl(opponent.logoUrl) || ''}
                alt={`${opponent.name} logo`}
                className="w-full h-full object-cover"
              />
            ) : (
              <Trophy className="w-5 h-5" style={{ color: '#1E3A8A' }} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-[#212121] truncate">
              {ourTeamId ? `vs ${opponentName}` : opponentName}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[13px] text-[#555]">
              <Clock className="w-3.5 h-3.5" />
              <span className="truncate">
                {format(new Date(nextGame.scheduledAt), 'EEE MMM d • h:mm a')}
              </span>
            </div>
            {venueText && (
              <div className="mt-0.5 flex items-center gap-1 text-[12px] text-[#777]">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{venueText}</span>
              </div>
            )}
          </div>
        </button>

        {showRsvp && (
          <div
            className="mt-3 grid grid-cols-3 gap-2"
            data-testid="up-next-rsvp"
          >
            <RsvpCell
              count={rsvpSummary?.attending?.length || 0}
              label="in"
              bg="#E6F6EC"
              fg="#15803d"
              testid="rsvp-in"
            />
            <RsvpCell
              count={rsvpSummary?.notAttending?.length || 0}
              label="out"
              bg="#FBE7E7"
              fg="#b91c1c"
              testid="rsvp-out"
            />
            <RsvpCell
              count={rsvpSummary?.noResponse?.length || 0}
              label="?"
              bg="#EFEFEC"
              fg="#555"
              testid="rsvp-noresponse"
            />
          </div>
        )}
      </>
    );
  };

  return (
    <div className={cardClass} style={cardStyle} data-testid="card-up-next">
      <div className={sectionTitleClass}>Up next</div>
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
}: {
  count: number;
  label: string;
  bg: string;
  fg: string;
  testid: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-center"
      style={{ backgroundColor: bg, color: fg }}
      data-testid={testid}
    >
      <div className="text-[18px] font-medium leading-none">{count}</div>
      <div className="mt-1 text-[11px]">{label}</div>
    </div>
  );
}

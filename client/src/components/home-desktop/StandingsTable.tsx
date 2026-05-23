import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { cardClass, cardStyle, sectionTitleClass } from './cardStyles';

interface StandingsRow {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  shootoutLosses?: number;
  points: number;
  goalsFor?: number;
  goalsAgainst?: number;
}

interface StandingsTableProps {
  effectiveLeagueId?: string | null;
  userTeamIdsInLeague: string[];
  seasonLabel?: string;
  seasonId?: string | null;
  /** Full list of seasons for this league (passed from HomeDesktop to avoid refetch). */
  seasons?: any[];
}

export function StandingsTable({
  effectiveLeagueId,
  userTeamIdsInLeague,
  seasonLabel,
  seasonId,
  seasons,
}: StandingsTableProps) {
  // Let user pick a prior season; default to the active season passed in.
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(
    seasonId ?? null,
  );

  // Re-sync when the parent season or league changes (e.g., user switches league).
  useEffect(() => {
    setSelectedSeasonId(seasonId ?? null);
  }, [seasonId, effectiveLeagueId]);

  const { data: standings, isLoading } = useQuery<StandingsRow[]>({
    queryKey: ['/api/leagues', effectiveLeagueId, 'standings', selectedSeasonId ?? null],
    queryFn: async () => {
      const url = selectedSeasonId
        ? `/api/leagues/${effectiveLeagueId}/standings?seasonId=${selectedSeasonId}`
        : `/api/leagues/${effectiveLeagueId}/standings`;
      const res = await apiRequest('GET', url);
      return res.json();
    },
    enabled: !!effectiveLeagueId,
    staleTime: 60_000,
  });

  // Label for the currently selected season
  const displayLabel = (() => {
    if (!Array.isArray(seasons) || !seasons.length) return seasonLabel;
    const found = seasons.find((s) => s.id === selectedSeasonId);
    return found?.name || seasonLabel;
  })();

  // Sort: points desc, then GF-GA desc, then wins desc
  const sorted = (() => {
    if (!Array.isArray(standings)) return [];
    return [...standings].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const aDiff = (a.goalsFor || 0) - (a.goalsAgainst || 0);
      const bDiff = (b.goalsFor || 0) - (b.goalsAgainst || 0);
      if (bDiff !== aDiff) return bDiff - aDiff;
      return (b.wins || 0) - (a.wins || 0);
    });
  })();

  return (
    <div className={cardClass} style={cardStyle} data-testid="card-standings">
      <div className="flex items-center justify-between gap-2">
        <div className={sectionTitleClass}>Standings</div>
        {Array.isArray(seasons) && seasons.length > 1 ? (
          <select
            value={selectedSeasonId ?? ''}
            onChange={(e) => setSelectedSeasonId(e.target.value || null)}
            className="text-[12px] text-[#444] bg-black/[0.04] border-0 rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#3b82f6] cursor-pointer"
            data-testid="standings-season-select"
            aria-label="Select season"
          >
            {seasons.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : displayLabel ? (
          <span className="text-[12px] text-[#666]" data-testid="standings-season">
            {displayLabel}
          </span>
        ) : null}
      </div>

      {!effectiveLeagueId ? (
        <div className="mt-3 text-sm text-[#666] py-4 text-center">
          Select a league to view standings.
        </div>
      ) : isLoading ? (
        <div className="mt-3 flex flex-col gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-7 rounded bg-black/[0.04] animate-pulse"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-3 text-sm text-[#666] py-4 text-center">
          No standings yet.
        </div>
      ) : (
        <div className="mt-3 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[11px] text-[#777] font-normal">
                <th className="text-left font-normal pb-1.5 pl-1 w-7">#</th>
                <th className="text-left font-normal pb-1.5">Team</th>
                <th className="text-right font-normal pb-1.5 w-8">GP</th>
                <th className="text-right font-normal pb-1.5 w-8">W</th>
                <th className="text-right font-normal pb-1.5 w-8">L</th>
                <th className="text-right font-normal pb-1.5 w-8">T</th>
                <th className="text-right font-normal pb-1.5 pr-1 w-10">PTS</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => {
                const isUserTeam = userTeamIdsInLeague.includes(row.teamId);
                return (
                  <tr
                    key={row.teamId}
                    className="text-[#212121]"
                    style={{
                      backgroundColor: isUserTeam ? '#E8F1FE' : 'transparent',
                    }}
                    data-testid={`standings-row-${row.teamId}`}
                  >
                    <td className="py-1 pl-1 text-[#666]">{idx + 1}</td>
                    <td className="py-1 truncate max-w-[160px]">
                      {row.teamName}
                    </td>
                    <td className="py-1 text-right">{row.gamesPlayed}</td>
                    <td className="py-1 text-right">{row.wins}</td>
                    <td className="py-1 text-right">{row.losses}</td>
                    <td className="py-1 text-right">{row.ties}</td>
                    <td className="py-1 text-right pr-1 font-medium">
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

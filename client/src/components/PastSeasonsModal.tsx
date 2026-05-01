import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Trophy } from 'lucide-react';

export interface PastSeasonTeam {
  id: string;
  name: string;
  leagueId: string | null;
  seasonId: string | null;
  seasonName?: string | null;
  seasonIsActive?: boolean | null;
  seasonStartDate?: string | Date | null;
}

export interface PastSeasonLeague {
  id: string;
  name: string;
  /**
   * When true, this league has no active season. The modal renders a
   * dedicated league-level row so the user can still navigate into the
   * league's dashboard even if they have no team in any season.
   */
  isPastOnly?: boolean;
  /**
   * Closed seasons for the league, used to derive the most recent past-season
   * label and a sortable timestamp for the league row.
   */
  pastSeasons?: { id: string; name: string; startDate: string | Date | null }[];
}

interface PastSeasonsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: PastSeasonTeam[];
  leagues: PastSeasonLeague[];
  onSelect: (selection: { type: 'team' | 'league'; id: string }) => void;
}

interface PastSeasonRow {
  key: string;
  leagueId: string | null;
  leagueName: string;
  seasonId: string | null;
  seasonName: string;
  teamId: string | null;
  teamName: string | null;
  seasonStartTs: number;
}

export default function PastSeasonsModal({
  open,
  onOpenChange,
  teams,
  leagues,
  onSelect,
}: PastSeasonsModalProps) {
  const rows = useMemo<PastSeasonRow[]>(() => {
    const leagueNameMap = new Map<string, string>();
    for (const lg of leagues) leagueNameMap.set(lg.id, lg.name);

    const out: PastSeasonRow[] = [];

    // Team rows — one per past-season team membership.
    for (const team of teams) {
      const seasonName = team.seasonName ?? 'Past Season';
      const leagueName = team.leagueId
        ? leagueNameMap.get(team.leagueId) ?? 'League'
        : 'League';
      const startTs = team.seasonStartDate
        ? new Date(team.seasonStartDate).getTime()
        : 0;
      out.push({
        key: `team-${team.id}`,
        leagueId: team.leagueId,
        leagueName,
        seasonId: team.seasonId,
        seasonName,
        teamId: team.id,
        teamName: team.name,
        seasonStartTs: Number.isFinite(startTs) ? startTs : 0,
      });
    }

    // League rows — one per past-only league. These let users navigate to a
    // league context where they have a membership but no team in any season.
    // The row's timestamp uses the league's most recent past season so it
    // sorts naturally alongside team rows.
    for (const lg of leagues) {
      if (!lg.isPastOnly) continue;
      const past = Array.isArray(lg.pastSeasons) ? lg.pastSeasons : [];
      const newest = past.reduce<number>((acc, s) => {
        const ts = s.startDate ? new Date(s.startDate).getTime() : 0;
        return Number.isFinite(ts) && ts > acc ? ts : acc;
      }, 0);
      const seasonLabel =
        past.length > 0
          ? past
              .slice()
              .sort((a, b) => {
                const aTs = a.startDate ? new Date(a.startDate).getTime() : 0;
                const bTs = b.startDate ? new Date(b.startDate).getTime() : 0;
                return bTs - aTs;
              })[0].name
          : 'Past Season';
      out.push({
        key: `league-${lg.id}`,
        leagueId: lg.id,
        leagueName: lg.name,
        seasonId: null,
        seasonName: seasonLabel,
        teamId: null,
        teamName: null,
        seasonStartTs: newest,
      });
    }

    out.sort((a, b) => {
      if (b.seasonStartTs !== a.seasonStartTs) {
        return b.seasonStartTs - a.seasonStartTs;
      }
      const lg = a.leagueName.localeCompare(b.leagueName);
      if (lg !== 0) return lg;
      // League-context rows render above team rows within the same league.
      if (!a.teamId && b.teamId) return -1;
      if (a.teamId && !b.teamId) return 1;
      return a.seasonName.localeCompare(b.seasonName);
    });
    return out;
  }, [teams, leagues]);

  const grouped = useMemo(() => {
    const map = new Map<string, { leagueName: string; rows: PastSeasonRow[] }>();
    for (const row of rows) {
      const key = row.leagueId ?? '__none__';
      if (!map.has(key)) {
        map.set(key, { leagueName: row.leagueName, rows: [] });
      }
      map.get(key)!.rows.push(row);
    }
    return Array.from(map.values());
  }, [rows]);

  const handleClick = (row: PastSeasonRow) => {
    if (row.teamId) {
      onSelect({ type: 'team', id: row.teamId });
    } else if (row.leagueId) {
      onSelect({ type: 'league', id: row.leagueId });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[80vh] overflow-y-auto"
        data-testid="modal-past-seasons"
      >
        <DialogHeader>
          <DialogTitle>Past Seasons</DialogTitle>
        </DialogHeader>
        {rows.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">
            You don't have any past seasons yet.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group, idx) => (
              <div key={idx} className="space-y-1">
                <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.leagueName}
                </div>
                <div className="rounded-lg overflow-hidden hairline">
                  {group.rows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => handleClick(row)}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center gap-2 border-b border-border last:border-b-0"
                      data-testid={`past-season-row-${row.teamId ?? row.leagueId}`}
                    >
                      {row.teamId ? (
                        <Users className="w-4 h-4 text-primary flex-shrink-0" />
                      ) : (
                        <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {row.teamId ? row.seasonName : `${group.leagueName} (League)`}
                        </div>
                        {row.teamId ? (
                          row.teamName && (
                            <div className="text-xs text-muted-foreground truncate">
                              {row.teamName}
                            </div>
                          )
                        ) : (
                          <div className="text-xs text-muted-foreground truncate">
                            Last season: {row.seasonName}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

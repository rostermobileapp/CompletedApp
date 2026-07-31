import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { ArrowLeft, Flame, Snowflake, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { getImageUrl, apiRequest } from '@/lib/queryClient';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface SeasonTotals {
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  penaltyMinutes: number;
  pointsPerGame: number;
}

interface GameLogEntry {
  gameId: string;
  date: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  opponentName: string | null;
  goals: number;
  assists: number;
  points: number;
  penaltyMinutes: number;
}

interface StatsTrendsData {
  seasonTotals: SeasonTotals | null;
  gameLog: GameLogEntry[];
  streakStatus: 'HOT' | 'COLD' | 'NEUTRAL';
  streakRatio: number;
}

function StreakBadge({ status }: { status: 'HOT' | 'COLD' | 'NEUTRAL' }) {
  if (status === 'HOT') {
    return (
      <span className="inline-flex items-center gap-1 text-orange-500 font-semibold text-sm">
        <Flame className="w-4 h-4" />
        Hot Streak
      </span>
    );
  }
  if (status === 'COLD') {
    return (
      <span className="inline-flex items-center gap-1 text-blue-400 font-semibold text-sm">
        <Snowflake className="w-4 h-4" />
        Cold Streak
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
      <Minus className="w-4 h-4" />
      Neutral
    </span>
  );
}

export default function PlayerStatsTrends() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [, navigate] = useLocation();

  // Parse query params
  const searchParams = new URLSearchParams(window.location.search);
  const leagueId = searchParams.get('leagueId') ?? '';
  const seasonId = searchParams.get('seasonId') ?? '';
  const displayName = searchParams.get('name') ?? 'Player';

  const { data: profileData } = useQuery<{ firstName?: string; lastName?: string; profileImageUrl?: string; playerType?: string; jerseyNumber?: number; position?: string }>({
    queryKey: ['/api/users', userId],
    enabled: !!userId,
  });

  const { data, isLoading, isError } = useQuery<StatsTrendsData>({
    queryKey: ['/api/users', userId, 'stats-trends', leagueId, seasonId],
    queryFn: async () => {
      const params = new URLSearchParams({ leagueId });
      if (seasonId) params.set('seasonId', seasonId);
      const res = await apiRequest('GET', `/api/users/${userId}/stats-trends?${params}`);
      return res.json();
    },
    enabled: !!userId && !!leagueId,
  });

  const fullName = profileData
    ? `${profileData.firstName ?? ''} ${profileData.lastName ?? ''}`.trim() || displayName
    : displayName;

  // Build chart data (oldest → newest for cumulative progression)
  const chartData = (() => {
    if (!data?.gameLog) return [];
    const reversed = [...data.gameLog].reverse();
    let cumulative = 0;
    return reversed.map((g, i) => {
      cumulative += g.points;
      return {
        game: i + 1,
        gamePoints: g.points,
        cumulative,
      };
    });
  })();

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const getOpponentDisplay = (entry: GameLogEntry) => {
    // Show whichever team name is available
    if (entry.homeTeamName && entry.awayTeamName) {
      return `${entry.homeTeamName} vs ${entry.awayTeamName}`;
    }
    if (entry.opponentName) return `vs ${entry.opponentName}`;
    if (entry.homeTeamName) return entry.homeTeamName;
    if (entry.awayTeamName) return entry.awayTeamName;
    return '—';
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          className="p-2 -ml-2"
          onClick={() => {
            setPageTransitionDirection('down');
            if (window.history.length > 1) window.history.back();
            else navigate('/');
          }}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {profileData?.profileImageUrl ? (
            <img
              src={getImageUrl(profileData.profileImageUrl) || ''}
              alt={fullName}
              className="w-9 h-9 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground text-sm font-bold">
                {fullName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">{fullName}</h1>
            {data && <StreakBadge status={data.streakStatus} />}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">Loading stats…</div>
        )}
        {isError && (
          <div className="text-center py-12 text-muted-foreground">Could not load stats for this player.</div>
        )}

        {data && (
          <>
            {/* Section 1 — Season Totals */}
            <Card className="hairline elev-rest">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Season Totals
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {data.seasonTotals ? (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'GP', value: data.seasonTotals.gamesPlayed },
                      { label: 'G', value: data.seasonTotals.goals },
                      { label: 'A', value: data.seasonTotals.assists },
                      { label: 'PTS', value: data.seasonTotals.points },
                      { label: 'PIM', value: data.seasonTotals.penaltyMinutes },
                      { label: 'P/GP', value: data.seasonTotals.pointsPerGame },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center bg-muted/40 rounded-lg py-3">
                        <div className="text-xl font-bold">{value}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No season stats available.</p>
                )}
              </CardContent>
            </Card>

            {/* Section 3 — Points Progression chart (shown before table so chart context frames the table) */}
            {chartData.length > 0 && (
              <Card className="hairline elev-rest">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Points Progression
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="game"
                        tick={{ fontSize: 11 }}
                        label={{ value: 'Game', position: 'insideBottom', offset: -2, fontSize: 11 }}
                        height={28}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        formatter={(value: any, name: string) => [
                          value,
                          name === 'cumulative' ? 'Cumulative Pts' : 'Game Pts',
                        ]}
                        labelFormatter={(label) => `Game ${label}`}
                      />
                      <Bar dataKey="gamePoints" fill="hsl(var(--primary) / 0.35)" name="Game Pts" radius={[2, 2, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="cumulative"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                        name="Cumulative Pts"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Section 2 — Game-by-Game */}
            <Card className="hairline elev-rest">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Game Log
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {data.gameLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No game stats recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Date</th>
                          <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Matchup</th>
                          <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">G</th>
                          <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">A</th>
                          <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">P</th>
                          <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">PIM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.gameLog.map((entry, idx) => (
                          <tr
                            key={entry.gameId}
                            className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                          >
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                              {formatDate(entry.date)}
                            </td>
                            <td className="px-2 py-2 text-xs truncate max-w-[120px]">
                              {getOpponentDisplay(entry)}
                            </td>
                            <td className="px-2 py-2 text-center font-medium">{entry.goals}</td>
                            <td className="px-2 py-2 text-center font-medium">{entry.assists}</td>
                            <td className="px-2 py-2 text-center font-bold">{entry.points}</td>
                            <td className="px-2 py-2 text-center text-muted-foreground">{entry.penaltyMinutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

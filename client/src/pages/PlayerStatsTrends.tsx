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
} from 'recharts';

interface SeasonTotals {
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  penaltyMinutes: number;
  pointsPerGame: number;
  beers?: number;
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
  beers?: number;
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

function NoDataMessage() {
  return (
    <p className="text-sm text-muted-foreground text-center py-6 italic">
      Not enough data to calculate trends
    </p>
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

  const { data: profileData } = useQuery<{
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    playerType?: string;
    jerseyNumber?: number;
    position?: string;
  }>({
    queryKey: ['/api/users', userId],
    enabled: !!userId,
  });

  const { data, isLoading } = useQuery<StatsTrendsData>({
    queryKey: ['/api/users', userId, 'stats-trends', leagueId, seasonId],
    queryFn: async () => {
      const p = new URLSearchParams({ leagueId });
      if (seasonId) p.set('seasonId', seasonId);
      const res = await apiRequest('GET', `/api/users/${userId}/stats-trends?${p}`);
      return res.json();
    },
    enabled: !!userId && !!leagueId,
  });

  const fullName = profileData
    ? `${profileData.firstName ?? ''} ${profileData.lastName ?? ''}`.trim() || displayName
    : displayName;

  // Build chart data (oldest → newest for cumulative progression)
  const chartData = (() => {
    if (!data?.gameLog?.length) return [];
    const reversed = [...data.gameLog].reverse();
    let cumulative = 0;
    return reversed.map((g, i) => {
      cumulative += g.points;
      return { game: i + 1, gamePoints: g.points, cumulative };
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
    if (entry.homeTeamName && entry.awayTeamName) return `${entry.homeTeamName} vs ${entry.awayTeamName}`;
    if (entry.opponentName) return `vs ${entry.opponentName}`;
    if (entry.homeTeamName) return entry.homeTeamName;
    if (entry.awayTeamName) return entry.awayTeamName;
    return '—';
  };

  const totals = data?.seasonTotals;
  const gameLog = data?.gameLog ?? [];
  const hasData = !!data;

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
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading stats…</div>
        ) : (
          <>
            {/* Season Totals */}
            <Card className="hairline elev-rest">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Season Totals
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {totals ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'GP', value: totals.gamesPlayed },
                        { label: 'G',  value: totals.goals },
                        { label: 'A',  value: totals.assists },
                        { label: 'PTS', value: totals.points },
                        { label: 'PIM', value: totals.penaltyMinutes },
                        { label: 'P/GP', value: totals.pointsPerGame },
                      ].map(({ label, value }) => (
                        <div key={label} className="text-center bg-muted/40 rounded-lg py-3">
                          <div className="text-xl font-bold">{value}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>
                    {/* Beer counter row */}
                    <div className="mt-3 grid grid-cols-1">
                      <div className="text-center bg-muted/40 rounded-lg py-3 flex items-center justify-center gap-2">
                        <span className="text-xl font-bold">{totals.beers ?? (data as any)?.beers ?? 0}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Beers Drank 🍺</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Show zeroed-out grid as skeleton */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      {['GP', 'G', 'A', 'PTS', 'PIM', 'P/GP'].map((label) => (
                        <div key={label} className="text-center bg-muted/40 rounded-lg py-3 opacity-40">
                          <div className="text-xl font-bold">0</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>
                    {/* Still show beer count even if no hockey stats */}
                    {((data as any)?.beers ?? 0) > 0 && (
                      <div className="grid grid-cols-1 mb-3">
                        <div className="text-center bg-muted/40 rounded-lg py-3 flex items-center justify-center gap-2">
                          <span className="text-xl font-bold">{(data as any)?.beers}</span>
                          <span className="text-xs text-muted-foreground">Beers Drank 🍺</span>
                        </div>
                      </div>
                    )}
                    <NoDataMessage />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Points Progression Chart */}
            <Card className="hairline elev-rest">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Points Progression
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {chartData.length > 0 ? (
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
                ) : (
                  /* Empty-state chart axes so the card looks like a chart placeholder */
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={180}>
                      <ComposedChart data={[]} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="game"
                          tick={{ fontSize: 11 }}
                          label={{ value: 'Game', position: 'insideBottom', offset: -2, fontSize: 11 }}
                          height={28}
                        />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-sm text-muted-foreground italic bg-background/80 px-3 py-1 rounded-md">
                        Not enough data to calculate trends
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Game Log */}
            <Card className="hairline elev-rest">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Game Log
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {/* Always show the table header */}
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
                      {gameLog.length > 0 ? (
                        gameLog.map((entry, idx) => (
                          <tr key={entry.gameId} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
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
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6}>
                            <NoDataMessage />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

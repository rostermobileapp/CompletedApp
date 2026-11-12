import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type ScorerProjection = {
  id: string;
  name: string;
  projectedPoints: number;
  chanceOfPoint: number;
  form: "hot" | "cold" | null;
};

export type WinChanceData = {
  homeTeamId: string;
  awayTeamId: string;
  homeWinProbability: number | null;
  awayWinProbability: number | null;
  tieProbability: number | null;
  expectedGoalsHome: number | null;
  expectedGoalsAway: number | null;
  moneylineHome: string;
  moneylineAway: string;
  projectedScoreHome: number;
  projectedScoreAway: number;
  winByTwoHome: number | null;
  winByTwoAway: number | null;
  overUnderLine: number | null;
  overProbability: number | null;
  underProbability: number | null;
  topScorersHome: ScorerProjection[];
  topScorersAway: ScorerProjection[];
  homeRecordSnapshot: { wins: number; losses: number; ties: number };
  awayRecordSnapshot: { wins: number; losses: number; ties: number };
  homeStreak: number;
  awayStreak: number;
  goalieHome: string | null;
  goalieAway: string | null;
  calculatedAt: string;
};

type RsvpPlayer = {
  user?: { id?: string; firstName?: string | null; lastName?: string | null };
  userId?: string;
};

interface WinChanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prediction: WinChanceData | null;
  homeTeamName: string;
  awayTeamName: string;
  viewerTeamId: string;
  notAttending?: RsvpPlayer[];
}

function percent(value: number | null | undefined): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function recordLine(record: { wins: number; losses: number; ties: number }): string {
  return `${record.wins}-${record.losses}-${record.ties}`;
}

function streakLine(streak: number): string {
  if (!streak) return "No active streak";
  return `${Math.abs(streak)} straight ${streak > 0 ? "win" : "loss"}${Math.abs(streak) === 1 ? "" : "s"}`;
}

export function WinChanceSheet({
  open,
  onOpenChange,
  prediction,
  homeTeamName,
  awayTeamName,
  viewerTeamId,
  notAttending = [],
}: WinChanceSheetProps) {
  if (!prediction) return null;

  const viewerIsHome = viewerTeamId === prediction.homeTeamId;
  const viewerScorers = viewerIsHome ? prediction.topScorersHome : prediction.topScorersAway;
  const outIds = new Set(notAttending.map((player) => player.user?.id || player.userId).filter(Boolean));
  const unavailableScorers = viewerScorers.filter((player) => outIds.has(player.id));
  const homeChance = prediction.homeWinProbability ?? 0;
  const awayChance = prediction.awayWinProbability ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:mx-auto sm:max-w-xl"
        data-testid="sheet-win-chance"
      >
        <SheetHeader className="mb-5 pr-8 text-left">
          <SheetTitle className="text-xl">Game win chance</SheetTitle>
          <p className="text-sm text-muted-foreground">
            A stats-based estimate for fun, not wagering advice.
          </p>
        </SheetHeader>

        <div className="space-y-4">
          <section className="rounded-xl border border-border p-4" aria-label="Win probabilities">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <TeamChance
                name={homeTeamName}
                chance={homeChance}
                record={prediction.homeRecordSnapshot}
                streak={prediction.homeStreak}
                align="left"
              />
              {prediction.tieProbability && prediction.tieProbability > 0 ? (
                <div className="text-center">
                  <div className="text-lg font-semibold tabular-nums">{percent(prediction.tieProbability)}</div>
                  <div className="text-xs text-muted-foreground">tie</div>
                </div>
              ) : (
                <div className="text-xs font-medium text-muted-foreground">VS</div>
              )}
              <TeamChance
                name={awayTeamName}
                chance={awayChance}
                record={prediction.awayRecordSnapshot}
                streak={prediction.awayStreak}
                align="right"
              />
            </div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="bg-primary transition-all" style={{ width: `${homeChance * 100}%` }} />
              <div className="bg-muted-foreground/40 transition-all" style={{ width: `${awayChance * 100}%` }} />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Metric label="Projected score" value={`${prediction.projectedScoreHome} – ${prediction.projectedScoreAway}`} />
            <Metric label="Expected goals" value={`${(prediction.expectedGoalsHome ?? 0).toFixed(1)} – ${(prediction.expectedGoalsAway ?? 0).toFixed(1)}`} />
            <Metric label="Win by 2+" value={`${percent(prediction.winByTwoHome)} / ${percent(prediction.winByTwoAway)}`} detail="Home / Away" />
            <Metric label="Over / under" value={`${prediction.overUnderLine ?? "—"} goals`} detail={`${percent(prediction.overProbability)} over · ${percent(prediction.underProbability)} under`} />
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">For-fun moneyline</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">{homeTeamName}</span>
                <span className="font-semibold tabular-nums">{prediction.moneylineHome}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">{awayTeamName}</span>
                <span className="font-semibold tabular-nums">{prediction.moneylineAway}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Top scorers for your team</h3>
              <Badge variant="secondary">{viewerIsHome ? homeTeamName : awayTeamName}</Badge>
            </div>
            {unavailableScorers.length > 0 && (
              <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                RSVP update: {unavailableScorers.map((player) => player.name).join(", ")} {unavailableScorers.length === 1 ? "is" : "are"} marked out. That response is reflected in the latest saved estimate.
              </p>
            )}
            {viewerScorers.length ? (
              <ul className="space-y-2">
                {viewerScorers.map((player) => (
                  <li key={player.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">
                      {player.name}
                      {player.form && (
                        <span className={`ml-2 text-xs ${player.form === "hot" ? "text-emerald-600" : "text-blue-600"}`}>
                          {player.form}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right text-muted-foreground">
                      {player.projectedPoints.toFixed(1)} pts · {percent(player.chanceOfPoint)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No player projections are available yet.</p>
            )}
          </section>

          <p className="pb-1 text-center text-xs text-muted-foreground">
            Saved {new Date(prediction.calculatedAt).toLocaleString()}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TeamChance({
  name,
  chance,
  record,
  streak,
  align,
}: {
  name: string;
  chance: number;
  record: { wins: number; losses: number; ties: number };
  streak: number;
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="truncate text-sm font-semibold">{name}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{percent(chance)}</div>
      <div className="mt-1 text-xs text-muted-foreground">Record {recordLine(record)}</div>
      <div className="text-xs text-muted-foreground">{streakLine(streak)}</div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-base font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { formatWinChanceRecord, type WinChanceRecord } from "@shared/winChanceRecord";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  homeRecordSnapshot: WinChanceRecord;
  awayRecordSnapshot: WinChanceRecord;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        disableAnimation
        closeClassName="z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-primary/40 bg-primary/20 p-2 text-foreground opacity-100 shadow-sm transition-colors hover:bg-primary/30"
        className="max-h-[88dvh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-background px-4 py-5 shadow-2xl sm:px-6 sm:py-6"
        data-testid="dialog-win-chance"
      >
        <DialogHeader className="mb-1 pr-8 text-left">
          <DialogTitle className="text-xl">Game prediction</DialogTitle>
          <DialogDescription>
            A stats-based estimate for fun. Predictions are not guarantees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="rounded-xl border border-primary/20 bg-primary/10 p-4" aria-label="Win probabilities">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <TeamChance
                name={homeTeamName}
                chance={homeChance}
                odds={prediction.moneylineHome}
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
                odds={prediction.moneylineAway}
                record={prediction.awayRecordSnapshot}
                streak={prediction.awayStreak}
                align="right"
              />
            </div>
            <div className="relative mt-4 h-5" aria-hidden="true">
              <div className="absolute inset-x-0 top-1/2 flex h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
                <div className={viewerIsHome ? "h-full bg-[#22c55e]" : "h-full bg-[#ef4444]"} style={{ width: `${homeChance * 100}%` }} />
                <div className={viewerIsHome ? "h-full bg-[#ef4444]" : "h-full bg-[#22c55e]"} style={{ width: `${awayChance * 100}%` }} />
              </div>
              <div
                className="absolute left-0 top-1/2 z-10 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                style={{ left: `${homeChance * 100}%` }}
              />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3" aria-label="Prediction metrics">
            <Metric label="Projected score" value={`${prediction.projectedScoreHome} – ${prediction.projectedScoreAway}`} />
            <Metric label="Expected goals" value={`${(prediction.expectedGoalsHome ?? 0).toFixed(1)} – ${(prediction.expectedGoalsAway ?? 0).toFixed(1)}`} />
            <Metric label="Win by 2+ goals" value={`${percent(prediction.winByTwoHome)} / ${percent(prediction.winByTwoAway)}`} detail="Home / away" />
            <Metric
              label="Estimated total goals"
              value={`${((prediction.expectedGoalsHome ?? 0) + (prediction.expectedGoalsAway ?? 0)).toFixed(1)}`}
            />
          </section>

          <section className="rounded-xl border border-primary/20 bg-primary/10 p-4">
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
      </DialogContent>
    </Dialog>
  );
}

function TeamChance({
  name,
  chance,
  odds,
  record,
  streak,
  align,
}: {
  name: string;
  chance: number;
  odds: string;
  record: WinChanceRecord;
  streak: number;
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="truncate text-sm font-semibold">{name}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{percent(chance)}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">Odds {odds}</div>
      <div className="mt-1 text-xs text-muted-foreground" title={record.shootoutLosses == null ? "Wins–Losses–Ties" : "Wins–Losses–Ties–Overtime/shootout losses"}>
        Record {formatWinChanceRecord(record)}
      </div>
      <div className="text-xs text-muted-foreground">{streakLine(streak)}</div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-primary/30 bg-primary/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-base font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

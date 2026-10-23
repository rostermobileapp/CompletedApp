import type { ComboProjection } from "@shared/lineComboPredictions";

export function LineComboPredictionBadge({
  projection, filledCount, loading = false, failed = false,
}: { projection?: ComboProjection; filledCount: number; loading?: boolean; failed?: boolean }) {
  if (filledCount < 2) return null;
  const explanation = failed ? "Line-combo statistics could not be loaded."
    : loading ? "Loading scorekeeper history."
    : !projection ? "Every selected player needs recorded scoring history in completed games with saved lineups."
    : projection.kind === "predicted"
      ? `Predicted combined goals + assists per game: individual historical PPG plus conservative corrections learned from pre-game forecast errors, including familiar player pairs. At least ${projection.sampleGames} historical games per player. ${
        projection.tuningGames ? `Automatically tuned using ${projection.tuningGames} scored games.`
          : projection.learningAvailable === false ? "Automatic learning is unavailable; this is the unadjusted baseline."
          : "Baseline estimate; automatic tuning starts when a future saved forecast has a verified game result."
      }${projection.recordedPointsPerGame !== undefined ? ` Recorded average: ${projection.recordedPointsPerGame.toFixed(1)} PPG in ${projection.recordedGames} games.` : ""} This estimates combined player production, not shift-tracked chemistry.`
      : `Recorded combined goals + assists per game in ${projection.sampleGames} completed games with this exact grouping. This is saved-lineup history, not shift tracking.`;
  return (
    <span
      data-testid="line-combo-projection"
      data-projection-kind={projection?.kind ?? "unavailable"}
      title={explanation}
      aria-label={explanation}
      className="inline-flex max-w-full flex-wrap items-center gap-x-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      {failed ? "Stats unavailable" : loading ? "Loading stats…" : !projection ? "Need player history" : <>
        <span>{projection.kind === "predicted" ? "Predicted" : "Recorded"} {projection.pointsPerGame.toFixed(1)} PPG</span>
        <span className="opacity-70">({projection.sampleGames}{projection.kind === "predicted" ? "g/player" : "g"})</span>
        {projection.tuningGames !== undefined && <span className="opacity-70" data-testid="line-combo-learning-status">
          · {projection.learningAvailable === false ? "Learning unavailable"
            : projection.tuningGames > 0 ? `Tuned · ${projection.tuningGames} games` : "Baseline · awaiting results"}
        </span>}
        {projection.recordedPointsPerGame !== undefined && <span className="opacity-70">
          · Recorded {projection.recordedPointsPerGame.toFixed(1)} PPG
        </span>}
        {projection.sampleGames < 3 && <span className="opacity-70">· limited sample</span>}
      </>}
    </span>
  );
}

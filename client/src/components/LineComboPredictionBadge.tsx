import type { ComboProjection } from "@shared/lineComboPredictions";

export function LineComboPredictionBadge({
  projection, filledCount, loading = false, failed = false,
}: { projection?: ComboProjection; filledCount: number; loading?: boolean; failed?: boolean }) {
  if (filledCount < 2) return null;
  const explanation = failed ? "Line-combo statistics could not be loaded."
    : loading ? "Loading scorekeeper history."
    : !projection ? "Every selected player needs recorded scoring history in completed games with saved lineups."
    : projection.kind === "predicted"
      ? `Predicted combined goals + assists per game: the sum of these players' individual historical PPG. At least ${projection.sampleGames} games per player. This estimates production, not on-ice chemistry.`
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
        {projection.sampleGames < 3 && <span className="opacity-70">· limited sample</span>}
      </>}
    </span>
  );
}

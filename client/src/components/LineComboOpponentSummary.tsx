import type { LineComboOpponent } from "@shared/lineComboOpponent";

export function LineComboOpponentSummary({ opponent }: { opponent?: LineComboOpponent }) {
  if (!opponent) return null;
  const change = Math.round((opponent.multiplier - 1) * 100);
  return <details className="rounded-lg border border-border/60 px-2.5 py-2 text-[11px] text-muted-foreground" data-testid="line-combo-opponent">
    <summary className="cursor-pointer">
      {opponent.status === "no-upcoming-game" ? "No upcoming game · no matchup adjustment" : <>
        <span className="font-semibold">Next: {opponent.opponentName || "Opponent TBD"}</span>
        {opponent.status === "adjusted" ? <>
          {" · "}{opponent.goalsForPerGame!.toFixed(1)} GF/G · {opponent.goalsAgainstPerGame!.toFixed(1)} GA/G
          {" · "}{change > 0 ? "+" : ""}{change}% matchup
        </> : " · no opponent scoring history"}
      </>}
    </summary>
    <p className="mt-1.5 leading-relaxed">
      {opponent.status === "adjusted"
        ? `Based on ${opponent.gamesPlayed} completed opponent games in this league and season. Goals allowed carries the larger weight; goals scored contributes a smaller pace adjustment. Both are compared with the league average (${opponent.leagueGoalsPerTeam!.toFixed(1)} goals per team per game), with five league-average prior games and a ±30% limit. The matchup-adjusted baseline is then tuned using verified forecast results. Recorded averages are unchanged.`
        : "Predictions still use player scoring history and available automatic tuning. No opponent adjustment is applied until a tracked next opponent has completed, scored games in the same league and season."}
    </p>
  </details>;
}

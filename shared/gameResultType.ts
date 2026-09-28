export function hasOneGoalMargin(homeScore: number | null, awayScore: number | null): boolean {
  return homeScore !== null && awayScore !== null &&
    Number.isInteger(homeScore) && Number.isInteger(awayScore) &&
    homeScore >= 0 && awayScore >= 0 &&
    Math.abs(homeScore - awayScore) === 1;
}
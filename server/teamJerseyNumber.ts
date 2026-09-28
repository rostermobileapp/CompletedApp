// Prefer the number on the league assignment. A captain's direct membership
// may have been created without one; direct-only numbers still remain usable.
export function resolveTeamJerseyNumber(
  directNumber: number | null | undefined,
  assignedNumber: number | null | undefined,
  hasLeagueAssignment: boolean,
): number | null {
  return (hasLeagueAssignment ? assignedNumber ?? directNumber : directNumber) ?? null;
}
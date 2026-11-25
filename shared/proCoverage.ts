/** Payment coverage is not membership, parent authority, or an administrative role. */
export type AccountPro = {
  personal: boolean;
  legacy: boolean;
  source: "stripe" | "apple" | "google" | "manual_override" | "legacy_grant" | "operational" | "none";
  validUntil?: string | null;
};
export type ProContext = { leagueId?: string | null; teamId?: string | null };
export type ProCoverage = {
  userId: string;
  account: AccountPro;
  teams: { id: string; leagueId?: string | null }[];
  seats: { leagueId: string; startMonth: string; endMonth: string }[];
  personalVerificationUnavailable?: boolean;
};
export const NO_ACCOUNT_PRO: AccountPro = { personal: false, legacy: false, source: "none" };

export function hasAccountPro(account?: AccountPro | null): boolean {
  return !!account && (account.legacy || (account.personal &&
    (!account.validUntil || +new Date(account.validUntil) > Date.now())));
}

export function hasProFor(coverage: ProCoverage | null | undefined, context: ProContext = {}): boolean {
  if (!coverage) return false;
  let leagueId = context.leagueId;
  if (context.teamId) {
    const team = coverage.teams.find(team => team.id === context.teamId);
    if (!team || (leagueId && leagueId !== team.leagueId)) return false;
    leagueId = team.leagueId;
  }
  if (hasAccountPro(coverage.account)) return true;
  // The server supplies only currently active seats for approved members.
  return !!leagueId && coverage.seats.some(seat => seat.leagueId === leagueId);
}

export function hasUncoveredTeams(coverage: ProCoverage): boolean {
  if (coverage.personalVerificationUnavailable) return false;
  return coverage.teams.some(team => !hasProFor(coverage, { teamId: team.id }));
}

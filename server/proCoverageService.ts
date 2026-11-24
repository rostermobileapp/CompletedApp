import { hasAccountPro, NO_ACCOUNT_PRO, type AccountPro, type ProContext, type ProCoverage } from "../shared/proCoverage";

export type ProAccount = {
  id: string; role?: string | null; feeExempt?: boolean; isPrimaryCommissioner?: boolean;
  stripeSubscriptionId?: string | null; iapOriginalTransactionId?: string | null;
  updatedAt?: Date | string | null;
};
export type ProCoverageDependencies = {
  account: (userId: string) => Promise<ProAccount | undefined>;
  personal: (account: ProAccount) => Promise<AccountPro>;
  team: (teamId: string) => Promise<{ id: string; leagueId?: string | null } | undefined>;
  teams: (userId: string) => Promise<{ id: string; leagueId?: string | null }[]>;
  seats: (userId: string) => Promise<ProCoverage["seats"]>;
  seat: (userId: string, leagueId: string) => Promise<boolean>;
  /** Must validate a real child session, consent, registry and requested team. */
  childParent?: (sessionToken: string, teamId: string) => Promise<{ parentId: string; teamId: string; leagueId: string } | null>;
};

export function createProCoverageService(deps: ProCoverageDependencies) {
  const accountCoverage = async (userId: string) => {
    const account = await deps.account(userId);
    return account ? deps.personal(account) : null;
  };
  const hasProFor = async (userId: string, context: ProContext = {}): Promise<boolean> => {
    let leagueId = context.leagueId;
    if (context.teamId) {
      const team = await deps.team(context.teamId);
      if (!team || (leagueId && leagueId !== team.leagueId)) return false;
      leagueId = team.leagueId;
    }
    const account = await deps.account(userId);
    if (!account) return false;
    // A verified seat is an independent source. Never make its availability
    // depend on the parent's unrelated personal billing provider.
    let seatFailure: unknown;
    if (leagueId) {
      try {
        if (await deps.seat(userId, leagueId)) return true;
      } catch (error) {
        seatFailure = error;
      }
    }
    if (hasAccountPro(await deps.personal(account))) return true;
    if (seatFailure) throw seatFailure;
    return false;
  };
  return {
    accountCoverage,
    hasProFor,
    async snapshot(userId: string): Promise<ProCoverage | null> {
      const user = await deps.account(userId);
      if (!user) return null;
      const [teams, seats] = await Promise.all([deps.teams(userId), deps.seats(userId)]);
      try {
        return { userId, account: await deps.personal(user), teams, seats };
      } catch {
        // Keep independently verified seats usable in the UI too. Unknown
        // personal coverage stays locked and is explicitly reported, not Free.
        return { userId, account: NO_ACCOUNT_PRO, teams, seats, personalVerificationUnavailable: true };
      }
    },
    async hasProForChild(sessionToken: string, teamId: string) {
      if (!deps.childParent || !sessionToken || !teamId) return false;
      const proof = await deps.childParent(sessionToken, teamId);
      return !!proof && proof.teamId === teamId && !!proof.leagueId &&
        hasProFor(proof.parentId, { leagueId: proof.leagueId });
    },
  };
}

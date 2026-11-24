import { hasAccountPro, type AccountPro } from "./proCoverage";
type TrophyCaseEntitlement = {
  role?: string | null;
  isPrimaryCommissioner?: boolean | null;
  accountPro?: AccountPro | null;
};

const PAID_TROPHY_CASE_ROLES = new Set([
  "player_pro",
  "commissioner",
  "secondary_commissioner",
]);

export function hasPaidTrophyCaseAccess(
  viewer: TrophyCaseEntitlement | null | undefined,
): boolean {
  if (viewer?.accountPro !== undefined) return hasAccountPro(viewer.accountPro);
  return !!viewer && (
    PAID_TROPHY_CASE_ROLES.has(viewer.role ?? "")
    || viewer.isPrimaryCommissioner === true
  );
}
type TrophyCaseEntitlement = {
  role?: string | null;
  isPrimaryCommissioner?: boolean | null;
};

const PAID_TROPHY_CASE_ROLES = new Set([
  "player_pro",
  "commissioner",
  "secondary_commissioner",
]);

export function hasPaidTrophyCaseAccess(
  viewer: TrophyCaseEntitlement | null | undefined,
): boolean {
  return !!viewer && (
    PAID_TROPHY_CASE_ROLES.has(viewer.role ?? "")
    || viewer.isPrimaryCommissioner === true
  );
}
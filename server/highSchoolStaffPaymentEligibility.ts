/** Reuse the ordinary invoice creation policy, without running checkout,
 * subscription synchronization, providers, notifications or billing mutations. */
export async function existingStaffPaymentEligibility(authId: string, leagueId: string) {
  const { storage } = await import("./storage");
  const { canManageLeagueSpecific, canAccessLeaguePremiumFeatures } = await import("./permissionMiddleware");
  const [user, membership] = await Promise.all([storage.getUser(authId), storage.getUserLeagueMembership(authId, leagueId)]);
  if (!user || membership?.status !== "approved") return false;
  return await canManageLeagueSpecific(user as any, leagueId) || await canAccessLeaguePremiumFeatures(user as any, leagueId);
}

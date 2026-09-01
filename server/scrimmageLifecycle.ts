export type ScrimmageLifecycleStatus = 'open' | 'roster_confirmed' | 'cancelled';
export type ScrimmageJoinMode = 'approval' | 'first_come' | 'first_pay' | string;

export function resetsPendingRequestsOnFinalize(joinMode: ScrimmageJoinMode): boolean {
  return joinMode === 'approval' || joinMode === 'first_pay';
}

export function canAcceptFreshScrimmageRequest(
  status: ScrimmageLifecycleStatus | string,
  joinMode: ScrimmageJoinMode,
  approvedCount: number,
  maxPlayers: number,
): boolean {
  if (status === 'open') return true;

  return (
    status === 'roster_confirmed'
    && resetsPendingRequestsOnFinalize(joinMode)
    && approvedCount < maxPlayers
  );
}
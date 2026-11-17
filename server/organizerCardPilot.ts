/** The owner authorized real organizer-fee payments for these accounts only. */
export const ORGANIZER_CARD_PILOT_DISPLAY_IDS = ['U00001', 'U00002'] as const;

export function canUseOrganizerCardPilot(
  production: boolean,
  displayId: string | null | undefined,
): boolean {
  return !production || ORGANIZER_CARD_PILOT_DISPLAY_IDS.some(id => id === displayId);
}

/** This exception authorizes fee collection only, never subscription benefits. */
export function canCollectOrganizerCardPayments(account: {
  displayId: string | null;
  role: string;
  feeExempt: boolean;
}): boolean {
  if (account.displayId === 'U00001') return true;
  return !account.feeExempt &&
    ['player_pro', 'secondary_commissioner', 'commissioner'].includes(account.role);
}

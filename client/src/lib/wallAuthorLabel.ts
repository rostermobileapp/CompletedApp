/**
 * Presentation only: this label never determines a user's permissions.
 * Only the exact founder account gets the override.
 */
export function getWallAuthorLabel(
  displayId: string | null | undefined,
  teamId?: string | null,
): string {
  if (displayId === 'U00001') return 'Founder';
  return teamId ? 'Team Captain' : 'Commissioner';
}

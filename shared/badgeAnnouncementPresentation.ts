/**
 * Hide artwork in the delivery response, not the stored award. A free player
 * still receives the celebration and keeps the patch for a future upgrade.
 */
export function badgeAnnouncementPresentation<T extends { imagePath?: string | null }>(
  definition: T,
  payload: Record<string, unknown>,
  canRevealArtwork: boolean,
) {
  return {
    artworkLocked: !canRevealArtwork,
    definition: {
      ...definition,
      imagePath: canRevealArtwork ? definition.imagePath : null,
    },
    payload: {
      ...payload,
      imagePath: canRevealArtwork ? payload.imagePath ?? null : null,
    },
  };
}

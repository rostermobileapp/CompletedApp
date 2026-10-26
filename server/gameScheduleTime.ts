export function hasGameScheduleTimeChanged(
  before: { scheduledAt: string | Date },
  after: { scheduledAt: string | Date },
): boolean {
  const normalize = (value: string | Date) =>
    value instanceof Date ? value.toISOString() : value.trim().replace('T', ' ');

  return normalize(before.scheduledAt) !== normalize(after.scheduledAt);
}

export function hasGameVenueChanged(
  before: { venue: string | null },
  after: { venue: string | null },
): boolean {
  return (before.venue ?? '').trim() !== (after.venue ?? '').trim();
}

export function hasGameScheduleDetailsChanged(
  before: { scheduledAt: string | Date; venue: string | null },
  after: { scheduledAt: string | Date; venue: string | null },
): boolean {
  return hasGameScheduleTimeChanged(before, after) || hasGameVenueChanged(before, after);
}

export function buildGameScheduleChangeMessage(
  matchup: string,
  changes: {
    timeChanged: boolean;
    venueChanged: boolean;
    newScheduledTime?: string;
    newVenue?: string | null;
  },
): string {
  const venue = changes.newVenue?.trim() || 'TBD';
  if (changes.timeChanged && changes.venueChanged) {
    return `${matchup} is now scheduled for ${changes.newScheduledTime} at ${venue}.`;
  }
  if (changes.timeChanged) {
    return `${matchup} is now scheduled for ${changes.newScheduledTime}.`;
  }
  if (changes.venueChanged) {
    return `${matchup} venue is now ${venue}.`;
  }
  throw new Error('A game schedule message requires a time or venue change');
}

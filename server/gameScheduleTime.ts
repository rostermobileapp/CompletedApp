export function hasGameScheduleTimeChanged(
  before: { scheduledAt: string | Date },
  after: { scheduledAt: string | Date },
): boolean {
  const normalize = (value: string | Date) =>
    value instanceof Date ? value.toISOString() : value.trim().replace('T', ' ');

  return normalize(before.scheduledAt) !== normalize(after.scheduledAt);
}

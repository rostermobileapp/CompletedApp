/** Account eligibility only; this is not identity verification or child consent. */
export const FAMILY_MINIMUM_AGE = 21;
export const FAMILY_AGE_TIME_ZONE = "America/New_York";
export type FamilyAgeEligibility = {
  eligible: boolean;
  reason: "eligible" | "dob_required" | "dob_invalid" | "under_21";
};

const calendar = new Intl.DateTimeFormat("en-US", {
  timeZone: FAMILY_AGE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

/** Use one server-defined calendar, never a caller-supplied age or browser zone.
 * February 29 birthdays reach the threshold on March 1 in non-leap years. */
export function familyAgeEligibility(dateOfBirth: unknown, now = new Date()): FamilyAgeEligibility {
  if (dateOfBirth == null || dateOfBirth === "") return { eligible: false, reason: "dob_required" };
  if (typeof dateOfBirth !== "string" || !Number.isFinite(now.getTime()))
    return { eligible: false, reason: "dob_invalid" };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return { eligible: false, reason: "dob_invalid" };
  const [, y, m, d] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
    return { eligible: false, reason: "dob_invalid" };
  const today = Object.fromEntries(calendar.formatToParts(now).map(part => [part.type, part.value]));
  const currentYear = Number(today.year), currentMonth = Number(today.month), currentDay = Number(today.day);
  const age = currentYear - year - (currentMonth < month || (currentMonth === month && currentDay < day) ? 1 : 0);
  if (age < 0 || year > currentYear) return { eligible: false, reason: "dob_invalid" };
  return age >= FAMILY_MINIMUM_AGE
    ? { eligible: true, reason: "eligible" }
    : { eligible: false, reason: "under_21" };
}

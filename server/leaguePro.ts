/**
 * Helpers for the League-Wide Player Pro bulk-payment flow.
 *
 * The commissioner pre-pays N "seats" of Player Pro for a contiguous month
 * window (startMonth..endMonth, both inclusive). Pricing rules:
 *
 *   perPlayerEffectiveMonthlyCents = round(perPlayerMonthlyCents * (1 - DISCOUNT_PERCENT/100))
 *   individualTotalCents           = seats * months * perPlayerMonthlyCents
 *   discountedTotalCents           = seats * months * perPlayerEffectiveMonthlyCents
 *   savingsCents                   = individualTotalCents - discountedTotalCents
 *
 * Per-seat-monthly is rounded first so the bulk total exactly equals the
 * "$X.YY/player/month × seats × months" copy shown in the UI.
 *
 * Months are stored and compared as `YYYY-MM` strings so we never deal with
 * timezone drift. Seat assignments are scoped to the league (per-league
 * access only — never global).
 */

export const LEAGUE_PRO_DISCOUNT_PERCENT = 25;
// Fallback when Stripe price lookup fails. Matches the live $6.50/mo Player Pro price.
export const LEAGUE_PRO_DEFAULT_MONTHLY_CENTS = 650;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(ym: string): boolean {
  return MONTH_RE.test(ym);
}

/**
 * Inclusive count of months between two `YYYY-MM` strings.
 * Returns 0 if `end` is before `start`.
 */
export function monthsBetween(start: string, end: string): number {
  const s = MONTH_RE.exec(start);
  const e = MONTH_RE.exec(end);
  if (!s || !e) return 0;
  const sy = Number(s[1]);
  const sm = Number(s[2]);
  const ey = Number(e[1]);
  const em = Number(e[2]);
  const diff = (ey - sy) * 12 + (em - sm) + 1;
  return diff > 0 ? diff : 0;
}

/** Returns the current month as `YYYY-MM` in UTC (sufficient for seat-window checks). */
export function currentMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** True if `ym` falls within `[start, end]` (inclusive). All YYYY-MM. */
export function monthInRange(ym: string, start: string, end: string): boolean {
  return ym >= start && ym <= end;
}

export interface LeagueProPricing {
  seatCount: number;
  startMonth: string;
  endMonth: string;
  monthsCount: number;
  perPlayerMonthlyCents: number;
  individualTotalCents: number;
  discountedTotalCents: number;
  savingsCents: number;
  discountPercent: number;
  perPlayerEffectiveMonthlyCents: number;
}

export function computeLeagueProPricing(input: {
  seatCount: number;
  startMonth: string;
  endMonth: string;
  perPlayerMonthlyCents: number;
}): LeagueProPricing {
  const { seatCount, startMonth, endMonth, perPlayerMonthlyCents } = input;
  const monthsCount = monthsBetween(startMonth, endMonth);
  // Round per-seat-monthly first so the displayed "$X.YY/player/month × seats
  // × months" copy multiplies out to exactly the discounted total charged.
  const perPlayerEffectiveMonthlyCents = Math.round(
    perPlayerMonthlyCents * (1 - LEAGUE_PRO_DISCOUNT_PERCENT / 100)
  );
  const individualTotalCents = seatCount * monthsCount * perPlayerMonthlyCents;
  const discountedTotalCents = seatCount * monthsCount * perPlayerEffectiveMonthlyCents;
  const savingsCents = individualTotalCents - discountedTotalCents;
  return {
    seatCount,
    startMonth,
    endMonth,
    monthsCount,
    perPlayerMonthlyCents,
    individualTotalCents,
    discountedTotalCents,
    savingsCents,
    discountPercent: LEAGUE_PRO_DISCOUNT_PERCENT,
    perPlayerEffectiveMonthlyCents,
  };
}

export const TRIVIA_CATEGORIES = [
  "nhl_history",
  "stanley_cup",
  "players_legends",
  "records_stats",
  "teams_franchises",
  "hockey_culture",
  "movies_media",
  "nicknames_slang",
  "arenas_fans",
] as const;

export type TriviaCategory = typeof TRIVIA_CATEGORIES[number];
export type TriviaDifficulty = "easy" | "medium" | "hard";
export type TriviaTierName = "bronze" | "silver" | "gold" | "platinum" | "emerald" | "diamond" | "legend" | "god_mode";

export const TRIVIA_CATEGORY_LABELS: Record<TriviaCategory, string> = {
  nhl_history: "NHL History",
  stanley_cup: "Stanley Cup",
  players_legends: "Players & Legends",
  records_stats: "Records & Stats",
  teams_franchises: "Teams & Franchises",
  hockey_culture: "Hockey Culture",
  movies_media: "Movies & Media",
  nicknames_slang: "Nicknames & Slang",
  arenas_fans: "Arenas & Fans",
};

export const TRIVIA_TIER_NAMES: readonly TriviaTierName[] = [
  "bronze", "silver", "gold", "platinum", "emerald", "diamond", "legend", "god_mode",
];

export const TRIVIA_UPLOADED_ART_CATEGORIES: ReadonlySet<TriviaCategory> = new Set<TriviaCategory>([
  "nhl_history", "stanley_cup", "players_legends", "records_stats", "teams_franchises", "hockey_culture", "movies_media",
]);

/** Uploaded artwork replaces placeholders only for the specified categories. */
export function triviaPatchImagePath(category: TriviaCategory, tier: number): string {
  return TRIVIA_UPLOADED_ART_CATEGORIES.has(category)
    ? `/badges/trivia/${category}/tier-${tier}.png?v=20261005`
    : `/badges/trivia/${category}/tier-${tier}.svg`;
}

export const DEFAULT_TRIVIA_THRESHOLDS = [1, 5, 10, 25, 50, 100, 150, 200] as const;
export const TRIVIA_TEST_DISPLAY_IDS = ["U00001"] as const;
export const TRIVIA_TIME_ZONE = "America/New_York";

export type TriviaTierConfig = { tier: number; correctAnswersRequired: number };
export type TriviaStreaks = { current: number; best: number };

const EASTERN_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TRIVIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isTriviaCategory(value: unknown): value is TriviaCategory {
  return typeof value === "string" && (TRIVIA_CATEGORIES as readonly string[]).includes(value);
}

export function isTriviaDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function easternDateKey(now = new Date()): string {
  return EASTERN_DATE_FORMATTER.format(now);
}

export function shiftDateKey(dateKey: string, days: number): string {
  if (!isTriviaDateKey(dateKey)) throw new Error(`Invalid trivia date: ${dateKey}`);
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Rotating by calendar day, rather than weekday, ensures all nine categories
// are represented in a deterministic cycle.
export function categoryForTriviaDate(dateKey: string): TriviaCategory {
  if (!isTriviaDateKey(dateKey)) throw new Error(`Invalid trivia date: ${dateKey}`);
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00.000Z`) / 86_400_000);
  const epochOffset = Math.floor(Date.parse("2024-01-01T00:00:00.000Z") / 86_400_000);
  return TRIVIA_CATEGORIES[((dayNumber - epochOffset) % TRIVIA_CATEGORIES.length + TRIVIA_CATEGORIES.length) % TRIVIA_CATEGORIES.length];
}

export function validateTriviaTiers(tiers: readonly TriviaTierConfig[]): TriviaTierConfig[] {
  const normalized = [...tiers].sort((a, b) => a.tier - b.tier);
  if (normalized.length !== 8 || normalized.some((item, i) =>
    item.tier !== i + 1 || !Number.isInteger(item.correctAnswersRequired) || item.correctAnswersRequired <= 0 ||
    (i > 0 && item.correctAnswersRequired <= normalized[i - 1].correctAnswersRequired)
  )) {
    throw new Error("Trivia tier configuration must contain eight tiers with strictly increasing positive thresholds.");
  }
  return normalized;
}

export function triviaStreaks(
  correctDateKeys: readonly string[],
  today: string,
  todayAnsweredCorrect?: boolean,
): TriviaStreaks {
  if (!isTriviaDateKey(today)) throw new Error(`Invalid trivia date: ${today}`);
  const dates = Array.from(new Set(correctDateKeys.filter(isTriviaDateKey))).sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous && shiftDateKey(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  if (todayAnsweredCorrect === false) return { current: 0, best };
  const currentAnchor = dates.includes(today) ? today : shiftDateKey(today, -1);
  let current = 0;
  let cursor = currentAnchor;
  const dateSet = new Set(dates);
  while (dateSet.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { current, best };
}

export function isTriviaDefinition(definition: {
  slug?: string | null;
  triggerKey?: string | null;
  triggerConfig?: unknown;
} | null | undefined): boolean {
  if (!definition) return false;
  const config = definition.triggerConfig;
  return (definition.triggerKey?.startsWith("trivia:") ?? false)
    || (definition.slug?.startsWith("trivia_") ?? false)
    || (typeof config === "object" && config !== null && (config as Record<string, unknown>).trivia === true);
}

export function isTriviaUserEnabled(
  displayId: string | null | undefined,
  testMode = process.env.TRIVIA_TEST_MODE !== "false",
  allowlist = (process.env.TRIVIA_TEST_USER_IDS ?? TRIVIA_TEST_DISPLAY_IDS.join(","))
    .split(",").map((id) => id.trim()).filter(Boolean),
): boolean {
  return !testMode || (!!displayId && allowlist.includes(displayId));
}
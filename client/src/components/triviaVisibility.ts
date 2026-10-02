export type TriviaToday = {
  date: string;
  category: string;
  question: string;
  choices: string[];
  difficulty: string;
  answered: boolean;
  correct_index?: number;
  explanation?: string;
  chosen_index?: number;
  feedback?: {
    is_correct: boolean;
    correct_index: number;
    explanation: string;
    streak: number;
    category: string;
    correct_count: number;
    patch?: Record<string, unknown>;
  };
};

export const TRIVIA_DISMISSAL_KEY = "roster.trivia.dismissed";

/** An explicitly requested, read-only review; expires with the API's daily date. */
export function savedTriviaReviewKey(displayId: unknown, today: TriviaToday | null): string | null {
  if (displayId !== "U00001" || today?.date !== "2026-10-02" ||
      !today.answered || !today.feedback ||
      typeof today.feedback.is_correct !== "boolean" ||
      !Number.isInteger(today.feedback.correct_index) ||
      today.feedback.correct_index < 0 || today.feedback.correct_index >= today.choices.length ||
      !Number.isInteger(today.chosen_index) ||
      today.chosen_index === undefined || today.chosen_index < 0 || today.chosen_index >= today.choices.length) {
    return null;
  }
  return `roster.trivia.saved-review:${displayId}:${today.date}`;
}

export function triviaDismissalStorageKey(userId: string, date: string): string {
  return `${TRIVIA_DISMISSAL_KEY}:${encodeURIComponent(userId)}:${date}`;
}

export function readTriviaDismissal(
  storage: Pick<Storage, "getItem"> | null | undefined,
  userId: string,
  date: string,
  launchId: string,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(triviaDismissalStorageKey(userId, date)) === launchId;
  } catch {
    return false;
  }
}

export function writeTriviaDismissal(
  storage: Pick<Storage, "setItem"> | null | undefined,
  userId: string,
  date: string,
  launchId: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(triviaDismissalStorageKey(userId, date), launchId);
  } catch {
    // Private mode or unavailable storage: in-memory dismissal still applies.
  }
}

export function isSafeTriviaOpportunity(path: string): boolean {
  return path === "/" || path === "/app";
}

export function shouldOfferTrivia(input: {
  path: string;
  answered: boolean;
  dismissed: boolean;
  otherOverlayActive: boolean;
}): boolean {
  return isSafeTriviaOpportunity(input.path) && !input.answered && !input.dismissed && !input.otherOverlayActive;
}

export function triviaPlayDestination(path: string): string {
  return isSafeTriviaOpportunity(path) ? path : "/";
}

export function canStartManualTrivia(input: {
  path: string;
  answered: boolean;
  otherOverlayActive: boolean;
}): boolean {
  return isSafeTriviaOpportunity(input.path) && !input.answered && !input.otherOverlayActive;
}

export function shouldRetainTriviaPriority(input: {
  path: string;
  engaged: boolean;
  eligible: boolean;
  dismissed: boolean;
}): boolean {
  return input.engaged && isSafeTriviaOpportunity(input.path) && input.eligible && !input.dismissed;
}

export function retainQuestionPatch<T extends object>(
  questionPatch: T | undefined,
  feedbackPatch: Partial<T> | undefined,
): T | undefined {
  if (!questionPatch) return feedbackPatch as T | undefined;
  return { ...questionPatch, ...feedbackPatch };
}

const CATEGORY_LABELS: Record<string, string> = {
  "nhl-history": "NHL History",
  "stanley-cup": "Stanley Cup",
  "players-legends": "Players & Legends",
  "records-stats": "Records & Stats",
  "teams-franchises": "Teams & Franchises",
  "hockey-culture": "Hockey Culture",
  "movies-media": "Movies & Media",
  "nicknames-slang": "Nicknames & Slang",
  "arenas-fans": "Arenas & Fans",
};

export function normalizeTriviaCategory(value: string): string {
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return CATEGORY_LABELS[key] || value;
}

export function findTriviaCategory<T extends { category: string; name: string }>(
  categories: T[],
  requested: string,
): T | undefined {
  const normalized = normalizeTriviaCategory(requested);
  return categories.find((item) =>
    normalizeTriviaCategory(item.category) === normalized
    || normalizeTriviaCategory(item.name) === normalized,
  );
}

export function hasServerPatchAccess(isPaid: boolean, patch: unknown): boolean {
  return isPaid && patch !== null && patch !== undefined;
}

export function isValidTriviaQuestion(value: unknown): value is TriviaToday {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TriviaToday>;
  return typeof item.date === "string"
    && typeof item.category === "string"
    && typeof item.question === "string"
    && typeof item.difficulty === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
    && Array.isArray(item.choices)
    && item.choices.length === 4
    && item.choices.every((choice) => typeof choice === "string")
    && typeof item.answered === "boolean";
}
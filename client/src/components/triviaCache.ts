import { isValidTriviaQuestion, type TriviaToday } from "./triviaVisibility";

type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function cacheKey(userId: string) {
  return `roster.trivia.today:${encodeURIComponent(userId)}`;
}

/** Only the signed-in account's current Eastern day may be restored. */
export function readCachedTrivia(storage: CacheStorage | null, userId: string, date: string): TriviaToday | undefined {
  try {
    const item: unknown = JSON.parse(storage?.getItem(cacheKey(userId)) ?? "null");
    if (!isValidTriviaQuestion(item) || item.date !== date ||
        !Number.isInteger(item.correct_index) || item.correct_index! < 0 || item.correct_index! > 3 ||
        typeof item.explanation !== "string") return undefined;
    return item;
  } catch {
    return undefined;
  }
}

export function cacheTrivia(storage: CacheStorage | null, userId: string, today: TriviaToday): void {
  try { storage?.setItem(cacheKey(userId), JSON.stringify(today)); } catch {
    // Unavailable storage must not prevent playing the live question.
  }
}

export function clearCachedTrivia(storage: CacheStorage | null, userId: string): void {
  try { storage?.removeItem(cacheKey(userId)); } catch {}
}

export function isTriviaPushLaunch(search: string): boolean {
  return new URLSearchParams(search).get("trivia") === "1";
}
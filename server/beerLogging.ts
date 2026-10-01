import { isBeerLoggingWindowOpen } from "../shared/beerLoggingWindow";

export interface BeerLoggingGameWindow {
  scheduledAt: Date | string;
  timezone?: string | null;
  isScrimmage: boolean;
}

export async function incrementBeerCountIfWindowOpen<T>(
  game: BeerLoggingGameWindow,
  increment: () => Promise<T>,
  nowMs = Date.now(),
): Promise<{ allowed: true; result: T } | { allowed: false }> {
  if (game.isScrimmage || !isBeerLoggingWindowOpen(game.scheduledAt, game.timezone, nowMs)) {
    return { allowed: false };
  }

  return { allowed: true, result: await increment() };
}
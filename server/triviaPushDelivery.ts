import { fromZonedTime } from "date-fns-tz";
import { easternDateKey, isTriviaTestMode, TRIVIA_TEST_DISPLAY_IDS, type TriviaCategory } from "../shared/trivia";

export type TriviaPushRecipient = { id: string; displayId: string | null };
export type TriviaPushScope = string[] | null;
export type TriviaPushLease = { token: string; idempotencyKey: string };
export type TriviaPushStore = {
  list(date: string, scope: TriviaPushScope): Promise<TriviaPushRecipient[]>;
  claim(userId: string, date: string, scope: TriviaPushScope): Promise<TriviaPushLease | null>;
  eligible(userId: string, date: string, lease: TriviaPushLease, scope: TriviaPushScope): Promise<boolean>;
  finish(userId: string, date: string, lease: TriviaPushLease, accepted: boolean, error: string | null): Promise<void>;
};

/** Announce today's question at local noon, including during daylight saving. */
export function triviaPushDate(now: Date): string | null {
  if (!Number.isFinite(now.getTime())) return null;
  const date = easternDateKey(now);
  const noon = fromZonedTime(`${date}T12:00:00`, "America/New_York");
  return now.getTime() >= noon.getTime() ? date : null;
}

export function triviaPushNextDelay(now: Date): number {
  if (!Number.isFinite(now.getTime()) || triviaPushDate(now)) return 60_000;
  const noon = fromZonedTime(`${easternDateKey(now)}T12:00:00`, "America/New_York");
  return Math.max(25, Math.min(60_000, noon.getTime() - now.getTime()));
}

export function triviaPushScope(env: { TRIVIA_TEST_MODE?: string; TRIVIA_TEST_USER_IDS?: string }, now: Date = new Date()): TriviaPushScope {
  if (!isTriviaTestMode(env, now)) return null;
  const configured = (env.TRIVIA_TEST_USER_IDS ?? TRIVIA_TEST_DISPLAY_IDS.join(","))
    .split(",").map(id => id.trim()).filter(Boolean);
  // The initial automated-push rollout was explicitly approved for U00001 only.
  return configured.includes(TRIVIA_TEST_DISPLAY_IDS[0]) ? [TRIVIA_TEST_DISPLAY_IDS[0]] : [];
}

export async function runTriviaPushDelivery(deps: {
  now(): Date;
  scope: TriviaPushScope;
  store: TriviaPushStore;
  ensureQuestion(date: string): Promise<{ category: TriviaCategory }>;
  send(input: { userId: string; date: string; category: TriviaCategory; idempotencyKey: string }): Promise<boolean>;
  logError(message: string, error: unknown): void;
}) {
  const date = triviaPushDate(deps.now());
  const report = { date, accepted: 0, failed: 0, skipped: 0 };
  if (!date || deps.scope?.length === 0) return report;

  // Never announce an unavailable question. This uses the existing published
  // question/fallback path, not model generation in the web server.
  const question = await deps.ensureQuestion(date);
  const recipients = await deps.store.list(date, deps.scope);
  const processRecipient = async (recipient: TriviaPushRecipient) => {
    if (deps.scope && !deps.scope.includes(recipient.displayId ?? "")) {
      report.skipped++;
      return;
    }
    if (triviaPushDate(deps.now()) !== date) return;
    const lease = await deps.store.claim(recipient.id, date, deps.scope);
    if (!lease) { report.skipped++; return; }
    try {
      const eligible = await deps.store.eligible(recipient.id, date, lease, deps.scope);
      if (!eligible || triviaPushDate(deps.now()) !== date) {
        await deps.store.finish(recipient.id, date, lease, false, "Recipient or trivia date is no longer eligible.");
        report.skipped++;
        return;
      }
      const accepted = await deps.send({
        userId: recipient.id, date, category: question.category, idempotencyKey: lease.idempotencyKey,
      });
      await deps.store.finish(recipient.id, date, lease, accepted,
        accepted ? null : "OneSignal did not confirm acceptance; retry uses the same idempotency key.");
      if (accepted) report.accepted++;
      else report.failed++;
    } catch (error) {
      report.failed++;
      deps.logError(`[TriviaPush] Delivery failed for ${recipient.id} on ${date}`, error);
      await deps.store.finish(recipient.id, date, lease, false, "Delivery or save failed; acceptance may be uncertain.")
        .catch(saveError => deps.logError("[TriviaPush] Failed to release delivery lease", saveError));
    }
  };
  // Bound provider concurrency. Leases are acquired only when a worker is ready.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, recipients.length) }, async () => {
    while (cursor < recipients.length) {
      const recipient = recipients[cursor++];
      await processRecipient(recipient);
    }
  }));
  return report;
}
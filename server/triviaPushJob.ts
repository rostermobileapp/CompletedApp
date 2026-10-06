import { pool } from "./db";
import { ensureTodayQuestion } from "./trivia";
import { sendPushNotificationToUser } from "./oneSignalNotifications";
import { runTriviaPushDelivery, triviaPushDate, triviaPushNextDelay, triviaPushScope } from "./triviaPushDelivery";
import { createTriviaPushStore } from "./triviaPushStore";

let started = false;

export function startDailyTriviaPushJob(): void {
  if (started) return;
  // Preview and test processes must never race the real scheduled sender.
  if (process.env.NODE_ENV !== "production") {
    console.log("[TriviaPush] Automatic sender disabled outside production.");
    return;
  }
  started = true;
  console.log("[TriviaPush] Automatic sender started: noon America/New_York; restart catch-up enabled.");
  const store = createTriviaPushStore((text, values) => pool.query(text, values));
  const tick = async () => {
    try {
      if (triviaPushDate(new Date())) {
        if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY) {
          console.error("[TriviaPush] Cannot send: OneSignal configuration is missing.");
        } else {
          const report = await runTriviaPushDelivery({
            now: () => new Date(),
            scope: triviaPushScope({
              TRIVIA_TEST_MODE: process.env.TRIVIA_TEST_MODE,
              TRIVIA_TEST_USER_IDS: process.env.TRIVIA_TEST_USER_IDS,
            }),
            store,
            ensureQuestion: ensureTodayQuestion,
            send: ({ userId, date, idempotencyKey }) => sendPushNotificationToUser({
              userId, title: "Daily Hockey Trivia",
              message: "Today's question is live.  Tap to play!",
              data: { type: "daily_trivia", trivia_date: date },
              idempotencyKey, timeoutMs: 20_000,
            }),
            logError: (message, error) => console.error(message, error),
          });
          if (report.accepted || report.failed) console.log("[TriviaPush] Delivery pass:", JSON.stringify(report));
        }
      }
    } catch (error) {
      console.error("[TriviaPush] Delivery pass failed; will retry:", error);
    } finally {
      setTimeout(() => void tick(), triviaPushNextDelay(new Date())).unref();
    }
  };
  // Startup checks today's unsent deliveries, never replays previous days.
  setTimeout(() => void tick(), 1000).unref();
}
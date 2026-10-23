import { pool } from "./db";
import { deliverTeamAwardPushBatch } from "./teamAwardPushDelivery";

let running = false;
/** Persistent outbox, bounded retries, stable OneSignal key across process restarts. */
export async function deliverTeamAwardPushes() {
  if (running) return;
  running = true;
  try {
    await deliverTeamAwardPushBatch(pool, async push => {
      const { sendPushNotificationToUser } = await import("./oneSignalNotifications");
      return sendPushNotificationToUser(push);
    });
  } catch {
    // Never log recipient data, provider responses, credentials, or image data.
    console.error("[TeamAwards] Notification delivery failed; queued awards will be retried.");
  } finally { running = false; }
}
export function startTeamAwardPushJob() {
  const timer = setInterval(() => { void deliverTeamAwardPushes(); }, 30_000);
  timer.unref();
}

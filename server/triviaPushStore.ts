import { randomUUID } from "node:crypto";
import type { TriviaPushStore } from "./triviaPushDelivery";

type Query = (text: string, values: unknown[]) => Promise<{ rows: any[] }>;

// Shared by selection, atomic claim, and the last check before a provider call.
// A reminder is a daily announcement, not an unanswered-only nudge.
const ELIGIBLE_RECIPIENT = `
  u.deleted_at IS NULL
  AND coalesce(u.email, '') NOT ILIKE '%@placeholder.roster'
  AND p.push_enabled = true
  AND (nullif(p.onesignal_external_id, '') IS NOT NULL OR nullif(p.onesignal_player_id, '') IS NOT NULL)
  AND ($2::text[] IS NULL OR u.display_id = ANY($2::text[]))
`;

export function createTriviaPushStore(query: Query): TriviaPushStore {
  return {
    async list(date, scope) {
      const result = await query(`
        SELECT u.id, u.display_id FROM users u
        JOIN notification_preferences p ON p.user_id = u.id
        LEFT JOIN trivia_push_deliveries d ON d.user_id = u.id AND d.trivia_date = $1::date
        WHERE ${ELIGIBLE_RECIPIENT}
          AND d.sent_at IS NULL
          AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= now())
          AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
        ORDER BY u.id LIMIT 100
      `, [date, scope]);
      return result.rows.map(row => ({ id: String(row.id), displayId: row.display_id }));
    },
    async claim(userId, date, scope) {
      const token = randomUUID();
      const result = await query(`
        INSERT INTO trivia_push_deliveries AS d
          (user_id, trivia_date, lease_token, lease_expires_at, next_attempt_at, attempts)
        SELECT u.id, $1::date, $4::uuid, now() + interval '5 minutes', now() + interval '5 minutes', 1
        FROM users u JOIN notification_preferences p ON p.user_id = u.id
        WHERE u.id = $3 AND ${ELIGIBLE_RECIPIENT}
        ON CONFLICT (user_id, trivia_date) DO UPDATE SET
          lease_token = EXCLUDED.lease_token, lease_expires_at = EXCLUDED.lease_expires_at,
          next_attempt_at = EXCLUDED.next_attempt_at, attempts = d.attempts + 1
        WHERE d.sent_at IS NULL
          AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= now())
          AND d.next_attempt_at <= now()
        RETURNING idempotency_key
      `, [date, scope, userId, token]);
      return result.rows[0] ? { token, idempotencyKey: String(result.rows[0].idempotency_key) } : null;
    },
    async eligible(userId, date, lease, scope) {
      const result = await query(`
        SELECT 1 FROM users u JOIN notification_preferences p ON p.user_id = u.id
        JOIN trivia_push_deliveries d ON d.user_id = u.id AND d.trivia_date = $1::date
        WHERE u.id = $3 AND ${ELIGIBLE_RECIPIENT}
          AND d.lease_token = $4::uuid AND d.lease_expires_at > now() AND d.sent_at IS NULL
          AND $1::date = (now() AT TIME ZONE 'America/New_York')::date
          AND (now() AT TIME ZONE 'America/New_York')::time >= time '12:00'
      `, [date, scope, userId, lease.token]);
      return result.rows.length > 0;
    },
    async finish(userId, date, lease, accepted, error) {
      const result = await query(`
        UPDATE trivia_push_deliveries SET
          sent_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
          last_error = $5, lease_token = NULL, lease_expires_at = NULL,
          next_attempt_at = now() + interval '5 minutes'
        WHERE user_id = $1 AND trivia_date = $2::date AND lease_token = $3::uuid AND sent_at IS NULL
        RETURNING user_id
      `, [userId, date, lease.token, accepted, error]);
      if (!result.rows.length) throw new Error("Trivia push lease was replaced or already completed.");
    },
  };
}
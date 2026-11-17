import type { PoolClient } from "@neondatabase/serverless";
import { hasLeagueLocalDateTimeStarted } from "./dateUtils";

export type RefundScrimmage = {
  id: string;
  join_mode: string;
  status: string;
  date_time: string | Date;
  timezone: string | null;
  time_tbd: boolean;
};

export type CommittedInvoiceRefund = {
  paymentRequestId: string;
  organizerUserId: string;
  payerUserId: string;
  scrimmageId: string | null;
  removedRequest: boolean;
  releasedApprovedSpot: boolean;
};

// Called before recipient/payment locks, matching invoice creation and roster
// finalization. The linked scrimmage is derived from trusted database state.
export async function lockInvoiceRefundScrimmage(
  client: Pick<PoolClient, "query">,
  paymentRequestId: string,
  organizerUserId: string,
): Promise<RefundScrimmage | null> {
  const linked = await client.query<{ related_scrimmage_id: string | null }>(
    `SELECT related_scrimmage_id FROM public.payment_requests
     WHERE id=$1 AND creator_id=$2`,
    [paymentRequestId, organizerUserId],
  );
  const id = linked.rows[0]?.related_scrimmage_id;
  if (!id) return null;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scrimmage-payment:${id}`]);
  const locked = await client.query<RefundScrimmage>(
    `SELECT id,join_mode,status,date_time::text AS date_time,timezone,time_tbd
     FROM public.scrimmages WHERE id=$1 AND creator_id=$2 FOR UPDATE`,
    [id, organizerUserId],
  );
  return locked.rows[0] ?? null;
}

export async function releaseRefundedScrimmageRequest(
  client: Pick<PoolClient, "query">,
  scrimmage: RefundScrimmage | null,
  payerUserId: string,
  now = new Date(),
) {
  // Refunds must never erase historical attendance or affect other join modes.
  if (!scrimmage || scrimmage.join_mode !== "first_pay" ||
      scrimmage.status === "cancelled" ||
      (!scrimmage.time_tbd &&
       hasLeagueLocalDateTimeStarted(scrimmage.date_time, scrimmage.timezone, now))) {
    return { removedRequest: false, releasedApprovedSpot: false };
  }
  const removed = await client.query<{ status: string }>(
    `DELETE FROM public.scrimmage_requests
     WHERE scrimmage_id=$1 AND player_id=$2 AND status IN ('approved','pending','backup')
     RETURNING status`,
    [scrimmage.id, payerUserId],
  );
  return {
    removedRequest: removed.rows.length > 0,
    releasedApprovedSpot: removed.rows[0]?.status === "approved",
  };
}

type Queryable = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
};

export function organizerReportFilters(input: Record<string, unknown>) {
  const from = typeof input.from === "string" && input.from ? input.from : null;
  const to = typeof input.to === "string" && input.to ? input.to : null;
  const eventType = input.eventType ?? "all";
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if ((input.from != null && typeof input.from !== "string") || (from && !validDate(from))) {
    throw new Error("Invalid start date.");
  }
  if ((input.to != null && typeof input.to !== "string") || (to && !validDate(to))) {
    throw new Error("Invalid end date.");
  }
  if (from && to && from > to) throw new Error("Start date must not be after the end date.");
  if (!["all", "scrimmage", "league_fee", "message"].includes(eventType as string)) {
    throw new Error("Invalid event type.");
  }
  return { from, to, eventType: eventType as string };
}

export async function loadOrganizerPaymentReport(
  database: Queryable,
  filters: ReturnType<typeof organizerReportFilters>,
) {
  // One statement gives the summary and capped detail list the same snapshot.
  // Unknown accounting remains unknown rather than being invented from quotes.
  const result = await database.query(`
    WITH filtered AS (
      SELECT p.id, p.payment_request_id, pr.title,
        CASE WHEN pr.related_scrimmage_id IS NOT NULL THEN 'scrimmage'
             WHEN pr.related_conversation_id IS NOT NULL THEN 'message'
             ELSE 'league_fee' END AS event_type,
        p.organizer_user_id, organizer.display_id AS organizer_display_id,
        p.payer_user_id, payer.display_id AS payer_display_id,
        p.status, p.currency, p.base_amount_cents, p.service_fee_cents, p.total_amount_cents,
        p.stripe_processing_fee_cents, p.transfer_amount_cents, p.transfer_reversed_cents,
        p.refunded_amount_cents, p.application_fee_refunded_cents,
        p.refund_status, p.refunded_at, p.dispute_status, p.created_at,
        p.disputed_amount_cents, p.dispute_fee_cents, p.dispute_balance_net_cents,
        p.dispute_id IS NOT NULL AS has_dispute,
        p.status IN ('paid','refund_pending','refunded','disputed') AS captured
      FROM public.organizer_card_payments p
      JOIN public.payment_requests pr ON pr.id=p.payment_request_id
      LEFT JOIN public.users organizer ON organizer.id=p.organizer_user_id
      LEFT JOIN public.users payer ON payer.id=p.payer_user_id
      WHERE ($1::date IS NULL OR p.created_at >= ($1::date::timestamp AT TIME ZONE 'UTC'))
        AND ($2::date IS NULL OR p.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'UTC'))
        AND ($3 = 'all' OR CASE
          WHEN pr.related_scrimmage_id IS NOT NULL THEN 'scrimmage'
          WHEN pr.related_conversation_id IS NOT NULL THEN 'message'
          ELSE 'league_fee' END = $3)
    ), amounts AS (
      SELECT *,
        CASE WHEN captured THEN total_amount_cents ELSE 0 END AS captured_amount_cents,
        CASE WHEN captured THEN service_fee_cents - application_fee_refunded_cents ELSE 0 END AS retained_service_fee_cents,
        CASE WHEN captured THEN transfer_amount_cents - COALESCE(transfer_reversed_cents,0) ELSE 0 END AS net_transfer_cents,
        CASE WHEN captured THEN transfer_amount_cents - service_fee_cents
          + application_fee_refunded_cents - COALESCE(transfer_reversed_cents,0) ELSE 0 END AS organizer_proceeds_cents,
        CASE WHEN captured AND has_dispute AND dispute_balance_net_cents IS NULL THEN NULL
          WHEN captured THEN service_fee_cents - application_fee_refunded_cents
          - stripe_processing_fee_cents + COALESCE(dispute_balance_net_cents,0) ELSE 0 END AS platform_net_cents,
        NOT captured OR (
          transfer_amount_cents IS NOT NULL AND stripe_processing_fee_cents IS NOT NULL
          AND (NOT has_dispute OR (disputed_amount_cents IS NOT NULL
            AND dispute_fee_cents IS NOT NULL AND dispute_balance_net_cents IS NOT NULL))
        ) AS accounting_complete
      FROM filtered
    ), totals AS (
      SELECT COUNT(*)::int AS payments_count,
        COUNT(*) FILTER (WHERE NOT accounting_complete)::int AS unreconciled_count,
        COALESCE(SUM(captured_amount_cents),0)::text AS gross_volume_cents,
        COALESCE(SUM(service_fee_cents) FILTER (WHERE captured),0)::text AS service_fees_cents,
        COALESCE(SUM(application_fee_refunded_cents),0)::text AS application_fee_refunds_cents,
        COALESCE(SUM(retained_service_fee_cents),0)::text AS retained_service_fees_cents,
        CASE WHEN COUNT(*) FILTER (WHERE captured AND stripe_processing_fee_cents IS NULL)>0 THEN NULL
          ELSE COALESCE(SUM(stripe_processing_fee_cents) FILTER (WHERE captured),0)::text END AS processing_fees_cents,
        CASE WHEN COUNT(*) FILTER (WHERE captured AND transfer_amount_cents IS NULL)>0 THEN NULL
          ELSE COALESCE(SUM(transfer_amount_cents) FILTER (WHERE captured),0)::text END AS organizer_gross_transfers_cents,
        CASE WHEN COUNT(*) FILTER (WHERE captured AND transfer_amount_cents IS NULL)>0 THEN NULL
          ELSE COALESCE(SUM(net_transfer_cents),0)::text END AS organizer_transfers_cents,
        CASE WHEN COUNT(*) FILTER (WHERE captured AND transfer_amount_cents IS NULL)>0 THEN NULL
          ELSE COALESCE(SUM(organizer_proceeds_cents),0)::text END AS organizer_proceeds_cents,
        COALESCE(SUM(refunded_amount_cents),0)::text AS refunds_cents,
        COALESCE(SUM(transfer_reversed_cents),0)::text AS transfer_reversals_cents,
        COUNT(*) FILTER (WHERE has_dispute)::int AS disputes_count,
        COUNT(*) FILTER (WHERE has_dispute AND COALESCE(dispute_status,'') NOT IN ('won','lost','warning_closed'))::int AS active_disputes_count,
        CASE WHEN COUNT(*) FILTER (WHERE has_dispute AND disputed_amount_cents IS NULL)>0 THEN NULL
          ELSE COALESCE(SUM(disputed_amount_cents),0)::text END AS disputed_cents,
        CASE WHEN COUNT(*) FILTER (WHERE has_dispute AND dispute_fee_cents IS NULL)>0 THEN NULL
          ELSE COALESCE(SUM(dispute_fee_cents),0)::text END AS dispute_fees_cents,
        CASE WHEN COUNT(*) FILTER (WHERE has_dispute AND (dispute_balance_net_cents IS NULL OR dispute_fee_cents IS NULL))>0 THEN NULL
          ELSE COALESCE(SUM(GREATEST(0,-dispute_balance_net_cents-dispute_fee_cents)),0)::text END AS dispute_withheld_cents,
        CASE WHEN COUNT(*) FILTER (WHERE NOT accounting_complete)>0 THEN NULL
          ELSE COALESCE(SUM(platform_net_cents),0)::text END AS platform_net_cents
      FROM amounts
    )
    SELECT to_jsonb(totals) AS summary,
      COALESCE((SELECT jsonb_agg(detail ORDER BY detail.created_at DESC, detail.id DESC) FROM
        (SELECT * FROM amounts ORDER BY created_at DESC, id DESC LIMIT 5000) detail), '[]'::jsonb) AS payments
    FROM totals
  `, [filters.from, filters.to, filters.eventType]);
  return result.rows[0] as { summary: Record<string, any>; payments: Record<string, any>[] };
}

export function organizerReportCsv(payments: Record<string, any>[]) {
  const headers = [
    "id", "payment_request_id", "title", "event_type", "organizer_user_id", "organizer_display_id",
    "payer_user_id", "payer_display_id", "status", "currency", "base_amount_cents", "service_fee_cents",
    "total_amount_cents", "captured_amount_cents", "retained_service_fee_cents",
    "stripe_processing_fee_cents", "transfer_amount_cents", "transfer_reversed_cents",
    "net_transfer_cents", "organizer_proceeds_cents", "refunded_amount_cents",
    "application_fee_refunded_cents", "refund_status", "refunded_at", "dispute_status",
    "disputed_amount_cents", "dispute_fee_cents", "dispute_balance_net_cents",
    "platform_net_cents", "accounting_complete", "created_at",
  ];
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    // Keep negative money numeric, but neutralize user-authored spreadsheet formulas.
    if (!/^-?\d+(?:\.\d+)?$/.test(text) && /^[\s=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers.map(cell).join(","), ...payments.map(row =>
    headers.map(key => cell(row[key])).join(","))].join("\r\n");
}

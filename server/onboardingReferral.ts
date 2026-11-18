type ReferralPool = {
  connect(): Promise<{
    query(text: string, values?: any[]): Promise<{ rows: any[] }>;
    release(): void;
  }>;
};

export class ReferralSaveError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** All onboarding referral writes share the user row lock, across app servers. */
export async function saveOnboardingReferral(pool: ReferralPool, userId: string, input: {
  referralPartnerId?: unknown; referralSourceOther?: unknown; referralCode?: unknown; clearReferral?: unknown;
}) {
  const requested = input.referralPartnerId !== undefined || input.referralSourceOther !== undefined
    || input.referralCode !== undefined || input.clearReferral === true;
  if (!requested) return;
  if ((input.referralPartnerId != null && typeof input.referralPartnerId !== "string")
    || (input.referralCode != null && typeof input.referralCode !== "string")
    || (input.referralSourceOther != null && typeof input.referralSourceOther !== "string")
    || (input.clearReferral !== undefined && typeof input.clearReferral !== "boolean")) {
    throw new ReferralSaveError(400, "INVALID_REFERRAL", "Choose a valid referral option.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = (await client.query(
      "SELECT referral_partner_id,referral_code,role FROM users WHERE id=$1 FOR UPDATE", [userId],
    )).rows[0];
    if (!user) throw new ReferralSaveError(404, "USER_NOT_FOUND", "Account not found");
    // A legacy link is also authoritative; never silently replace it.
    const link = (await client.query(
      "SELECT referral_partner_id FROM referral_user_links WHERE user_id=$1 LIMIT 1", [userId],
    )).rows[0];
    const existing = user.referral_partner_id || link?.referral_partner_id;
    if (existing) {
      if (input.referralPartnerId === existing && !input.clearReferral && input.referralSourceOther === undefined) {
        await client.query("COMMIT"); // idempotent confirmation, not a new claim
        return;
      }
      throw new ReferralSaveError(409, "REFERRAL_LOCKED", "Your original referral partner is already saved and cannot be replaced.");
    }
    if (input.clearReferral === true || input.referralSourceOther !== undefined) {
      const other = input.clearReferral === true || input.referralSourceOther === null ? null : String(input.referralSourceOther).trim().slice(0, 200);
      await client.query("UPDATE users SET referral_partner_id=NULL,referral_code=NULL,referral_source_other=$2 WHERE id=$1", [userId, other]);
      await client.query("DELETE FROM referral_user_links WHERE user_id=$1", [userId]);
    } else if (input.referralPartnerId || input.referralCode) {
      const byId = !!input.referralPartnerId;
      const candidate = byId ? input.referralPartnerId : String(input.referralCode).trim().toUpperCase();
      if (typeof candidate !== "string" || candidate.length > 100) throw new ReferralSaveError(400, "INVALID_REFERRAL", "Choose an approved referral partner.");
      const partner = (await client.query(
        `SELECT id,referral_code FROM referral_partners WHERE ${byId ? "id" : "referral_code"}=$1 AND status='approved' FOR SHARE`,
        [candidate],
      )).rows[0];
      if (!partner) throw new ReferralSaveError(400, "INVALID_REFERRAL", "That referral partner is no longer available. Choose a partner or use the manual fallback.");
      await client.query("UPDATE users SET referral_partner_id=$2,referral_code=$3,referral_source_other=NULL WHERE id=$1",
        [userId, partner.id, partner.referral_code]);
      await client.query("DELETE FROM referral_user_links WHERE user_id=$1", [userId]);
      const paid = user.role === "commissioner" || user.role === "player_pro";
      await client.query(`INSERT INTO referral_user_links(user_id,referral_partner_id,is_paid,paid_tier,paid_at)
        VALUES($1,$2,$3,$4,CASE WHEN $3 THEN now() ELSE NULL END)`, [userId, partner.id, paid, paid ? user.role : null]);
      if (paid) await client.query(`INSERT INTO referral_conversions
        (partner_id,referral_code,user_id,conversion_type,tier,platform,gross_price_cents,status)
        VALUES($1,$2,$3,'claim',$4,'web',0,'active')`, [partner.id, partner.referral_code || "", userId, user.role]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

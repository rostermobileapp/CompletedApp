import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { PARENT_CODE_DIGITS, PARENT_CODE_SECONDS, PARENT_CODE_FAILURE_LIMIT, PARENT_CODE_PATTERN, PARENT_CODE_FAILURE_WINDOW_MINUTES } from "../shared/highSchoolParentCodePolicy";

export interface ParentSql {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  connect(): Promise<ParentTransaction>;
}
export interface ParentTransaction {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  release(): void;
}
export type ParentActor = { authId: string; sessionId: string };
export type ParentPurpose = "parent_action" | "password_change";
export type ParentCodeMailer = (mail: { to: string; code: string; purpose: ParentPurpose }) => Promise<void>;
export class ParentSecurityError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
export const parentDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function isParentSecurityDevelopment(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "development" && env.NONPRODUCTION_ISOLATED === "1"
    && env.PREVIEW_USE_LIVE_SECRETS !== "1";
}
export function validParentPassword(value: unknown): value is string {
  // Reject bcrypt truncation, including multibyte inputs. Never silently truncate.
  return typeof value === "string" && value.length >= 12 && Buffer.byteLength(value, "utf8") <= 72
    && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}
export const unavailableParentMailer: ParentCodeMailer = async () => {
  throw new ParentSecurityError("DEV_PARENT_EMAIL_TRANSPORT_UNCONFIGURED", 503);
};

/**
 * Instantiated by isolated DEV or a verified production installation. Live
 * enrollment activates only after email proof. No client-provided destination
 * or parent-authority flag is trusted.
 * The injected mailer is PRIVATE; never provide an HTTP code-retrieval endpoint.
 */
export class HighSchoolParentSecurity {
  constructor(private pool: ParentSql, private mail: ParentCodeMailer = unavailableParentMailer,
    private stagedEnrollment = false) {}

  private async transaction<T>(fn: (tx: ParentTransaction) => Promise<T>): Promise<T> {
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN");
      const result = await fn(tx);
      await tx.query("COMMIT");
      return result;
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally { tx.release(); }
  }
  async installed() {
    const result = await this.pool.query("SELECT to_regclass('hs_parent_security.version') AS installed");
    return Boolean(result.rows[0]?.installed);
  }
  async enrolled(authId: string) {
    // A missing install MUST stop the DEV integration, never silently skip it.
    const rows = await this.pool.query(`SELECT 1 FROM hs_parent_security.accounts WHERE auth_id=$1${this.stagedEnrollment ? " AND activated_at IS NOT NULL" : ""}`, [authId]);
    return rows.rows.length === 1;
  }
  private async active(actor: ParentActor, tx: Pick<ParentSql, "query"> = this.pool) {
    if (!isUuid(actor.authId) || !isUuid(actor.sessionId)) throw new ParentSecurityError("INVALID_SESSION", 401);
    const rows = await tx.query(`SELECT 1 FROM auth.sessions
      WHERE id=$1 AND user_id=$2 AND (not_after IS NULL OR not_after>now())`, [actor.sessionId, actor.authId]);
    if (rows.rows.length !== 1) throw new ParentSecurityError("INVALID_SESSION", 401);
  }
  private audit(tx: Pick<ParentSql, "query">, actor: ParentActor, event: string) {
    return tx.query("INSERT INTO hs_parent_security.audit(auth_id,session_id,event) VALUES ($1,$2,$3)",
      [actor.authId, actor.sessionId, event]);
  }
  private async checkGuessBudget(tx: ParentTransaction, actor: ParentActor) {
    // Call only with the account row locked. No session, purpose or challenge
    // filter: switching devices, resending or changing purpose cannot reset it.
    const rate = await tx.query(`SELECT
      count(*) FILTER (WHERE event='code_rejected')::int AS failures,
      count(*) FILTER (WHERE event IN ('code_rejected','code_verified')
        AND created_at>now()-interval '10 minutes')::int AS aggregate
      FROM hs_parent_security.audit
      WHERE auth_id=$1 AND created_at>now()-interval '${PARENT_CODE_FAILURE_WINDOW_MINUTES} minutes'`, [actor.authId]);
    if (rate.rows[0].failures >= PARENT_CODE_FAILURE_LIMIT || rate.rows[0].aggregate >= 25) {
      throw new ParentSecurityError("CODE_RATE_LIMIT", 429);
    }
  }
  async status(actor: ParentActor, grant?: string) {
    await this.active(actor);
    return { enrolled: await this.enrolled(actor.authId), verified: await this.authorized(actor, grant) };
  }
  async challenge(actor: ParentActor, purpose: ParentPurpose) {
    if (!["parent_action", "password_change"].includes(purpose)) throw new ParentSecurityError("INVALID_PURPOSE", 400);
    const id = randomUUID();
    const code = String(randomInt(0, 10 ** PARENT_CODE_DIGITS)).padStart(PARENT_CODE_DIGITS, "0");
    const destination = await this.transaction(async tx => {
      await this.active(actor, tx);
      // Account lock serializes rate limits across every device/server instance.
      const account = await tx.query(`SELECT parent_email FROM hs_parent_security.accounts WHERE auth_id=$1
        ${this.stagedEnrollment ? "AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=$1 AND u.email=parent_email AND u.email_confirmed_at IS NOT NULL)" : ""}
        FOR UPDATE`, [actor.authId]);
      if (account.rows.length !== 1) throw new ParentSecurityError("FAMILY_NOT_ENROLLED", 403);
      await this.checkGuessBudget(tx, actor);
      const limits = await tx.query(`SELECT
        count(*) FILTER (WHERE created_at>now()-interval '1 minute')::int AS recent,
        count(*)::int AS hourly FROM hs_parent_security.challenges
        WHERE auth_id=$1 AND created_at>now()-interval '1 hour'`, [actor.authId]);
      if (limits.rows[0].recent > 0 || limits.rows[0].hourly >= 5) throw new ParentSecurityError("CODE_RATE_LIMIT", 429);
      await tx.query(`UPDATE hs_parent_security.challenges SET consumed=true
        WHERE auth_id=$1 AND session_id=$2 AND purpose=$3 AND NOT consumed`, [actor.authId, actor.sessionId, purpose]);
      await tx.query(`INSERT INTO hs_parent_security.challenges
        (id,auth_id,session_id,purpose,code_digest,expires_at)
        VALUES ($1,$2,$3,$4,$5,now()+($6 * interval '1 second'))`,
      [id, actor.authId, actor.sessionId, purpose, parentDigest(`${id}:${code}`), PARENT_CODE_SECONDS]);
      await this.audit(tx, actor, "challenge_requested");
      return account.rows[0].parent_email as string;
    });
    try {
      await this.mail({ to: destination, code, purpose });
      await this.pool.query("UPDATE hs_parent_security.challenges SET delivered=true WHERE id=$1 AND NOT consumed", [id]);
    } catch {
      await this.pool.query("UPDATE hs_parent_security.challenges SET consumed=true WHERE id=$1", [id]);
      await this.audit(this.pool, actor, "challenge_delivery_failed");
      throw new ParentSecurityError("PARENT_EMAIL_DELIVERY_UNAVAILABLE", 503);
    }
    // Neither full address nor code is returned or logged.
    return { challengeId: id, expiresInSeconds: PARENT_CODE_SECONDS };
  }
  async verify(actor: ParentActor, id: unknown, code: unknown) {
    if (!isUuid(id) || typeof code !== "string" || !PARENT_CODE_PATTERN.test(code)) {
      throw new ParentSecurityError("INVALID_CODE", 400);
    }
    const token = randomBytes(32).toString("base64url");
    const outcome = await this.transaction(async tx => {
      await this.active(actor, tx);
      const account = await tx.query(`SELECT 1 FROM hs_parent_security.accounts WHERE auth_id=$1
        ${this.stagedEnrollment ? "AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=$1 AND u.email=parent_email AND u.email_confirmed_at IS NOT NULL)" : ""}
        FOR UPDATE`, [actor.authId]);
      if (account.rows.length !== 1) throw new ParentSecurityError("FAMILY_NOT_ENROLLED", 403);
      await this.checkGuessBudget(tx, actor);
      const rows = await tx.query(`UPDATE hs_parent_security.challenges SET attempts=attempts+1
        WHERE id=$1 AND auth_id=$2 AND session_id=$3
          AND delivered AND NOT consumed AND attempts<${PARENT_CODE_FAILURE_LIMIT} AND expires_at>now()
        RETURNING code_digest,purpose`, [id, actor.authId, actor.sessionId]);
      const expected = rows.rows[0]?.code_digest;
      // Return failure and commit: throwing here would roll back the attempt.
      if (!expected || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(parentDigest(`${id}:${code}`), "hex"))) {
        await this.audit(tx, actor, "code_rejected");
        return null;
      }
      await tx.query("UPDATE hs_parent_security.challenges SET consumed=true WHERE id=$1", [id]);
      const purpose = rows.rows[0].purpose as ParentPurpose;
      // Live enrollment becomes protective only after actual email possession
      // is proven. Failed delivery must never lock an ordinary adult out.
      if (this.stagedEnrollment && purpose === "parent_action") {
        await tx.query("UPDATE hs_parent_security.accounts SET activated_at=coalesce(activated_at,now()) WHERE auth_id=$1", [actor.authId]);
      }
      const seconds = purpose === "password_change" ? 120 : 600;
      await tx.query(`INSERT INTO hs_parent_security.grants(token_digest,auth_id,session_id,purpose,expires_at)
        VALUES ($1,$2,$3,$4,now()+($5 * interval '1 second'))`,
      [parentDigest(token), actor.authId, actor.sessionId, purpose, seconds]);
      await this.audit(tx, actor, "code_verified");
      return { purpose, expiresInSeconds: seconds };
    });
    if (!outcome) throw new ParentSecurityError("INVALID_OR_EXPIRED_CODE", 403);
    return { ...outcome, verificationToken: token };
  }
  async authorized(actor: ParentActor, token?: string, tx?: ParentTransaction) {
    const db=tx??this.pool;
    await this.active(actor,db);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const result = await db.query(`SELECT 1 FROM hs_parent_security.grants
      WHERE token_digest=$1 AND auth_id=$2 AND session_id=$3 AND purpose='parent_action'
         AND NOT consumed AND expires_at>now()${tx?" FOR SHARE":""}`, [parentDigest(token), actor.authId, actor.sessionId]);
    return result.rows.length === 1;
  }
  async revoke(actor: ParentActor) {
    await this.transaction(async tx => {
      await this.active(actor, tx);
      await tx.query("UPDATE hs_parent_security.grants SET consumed=true WHERE auth_id=$1 AND session_id=$2", [actor.authId, actor.sessionId]);
      await tx.query("UPDATE hs_parent_security.challenges SET consumed=true WHERE auth_id=$1 AND session_id=$2", [actor.authId, actor.sessionId]);
      await this.audit(tx, actor, "session_authority_revoked");
    });
  }
  async changePassword(actor: ParentActor, token: unknown, password: unknown) {
    if (!validParentPassword(password)) throw new ParentSecurityError("INVALID_PASSWORD", 400);
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ParentSecurityError("PASSWORD_VERIFICATION_REQUIRED", 403);
    await this.active(actor);
    // Reject fabricated capabilities before doing costly bcrypt work. Recheck
    // under the account lock below; this read is not the mutation permission.
    const preliminary = await this.pool.query(`SELECT 1 FROM hs_parent_security.grants
      WHERE token_digest=$1 AND auth_id=$2 AND session_id=$3 AND purpose='password_change'
        AND NOT consumed AND expires_at>now()`, [parentDigest(token), actor.authId, actor.sessionId]);
    if (preliminary.rows.length !== 1) throw new ParentSecurityError("PASSWORD_VERIFICATION_REQUIRED", 403);
    const hash = await bcrypt.hash(password, 12);
    const changed = await this.transaction(async tx => {
      await this.active(actor, tx);
      // Use the account lock first, including for concurrent password requests.
      const account = await tx.query("SELECT 1 FROM hs_parent_security.accounts WHERE auth_id=$1 FOR UPDATE", [actor.authId]);
      if (account.rows.length !== 1) return false;
      const approval = await tx.query(`UPDATE hs_parent_security.grants SET consumed=true
        WHERE token_digest=$1 AND auth_id=$2 AND session_id=$3 AND purpose='password_change'
          AND NOT consumed AND expires_at>now() RETURNING token_digest`,
      [parentDigest(token), actor.authId, actor.sessionId]);
      if (approval.rows.length !== 1) return false;
      const existing = await tx.query("SELECT encrypted_password FROM auth.users WHERE id=$1 FOR UPDATE", [actor.authId]);
      if (!existing.rows.length || await bcrypt.compare(password, existing.rows[0].encrypted_password)) {
        throw new ParentSecurityError("PASSWORD_MUST_DIFFER", 400);
      }
      await tx.query("INSERT INTO hs_parent_security.writes VALUES (txid_current(),$1,$2)", [actor.authId, hash]);
      const updated = await tx.query("UPDATE auth.users SET encrypted_password=$1,updated_at=now() WHERE id=$2 RETURNING id", [hash, actor.authId]);
      if (updated.rows.length !== 1) throw new ParentSecurityError("PASSWORD_UPDATE_FAILED", 503);
      await tx.query("DELETE FROM hs_parent_security.writes WHERE transaction_id=txid_current() AND auth_id=$1", [actor.authId]);
      await tx.query("UPDATE hs_parent_security.grants SET consumed=true WHERE auth_id=$1", [actor.authId]);
      await tx.query("UPDATE hs_parent_security.challenges SET consumed=true WHERE auth_id=$1", [actor.authId]);
      // Remove refresh tokens before sessions. Supabase schemas can differ in
      // whether those FKs cascade, so do not depend on a version-specific cascade.
      await tx.query("DELETE FROM auth.refresh_tokens WHERE user_id=$1", [actor.authId]);
      await tx.query("DELETE FROM auth.sessions WHERE user_id=$1", [actor.authId]);
      await this.audit(tx, actor, "password_changed_all_sessions_revoked");
      return true;
    });
    if (!changed) throw new ParentSecurityError("PASSWORD_VERIFICATION_REQUIRED", 403);
    return { changed: true, signInRequired: true };
  }
}

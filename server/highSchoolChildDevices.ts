import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  HS_SETUP_CODE_ALPHABET, HS_SETUP_CODE_MAX_FAILURES, HS_SETUP_CODE_PATTERN, HS_SETUP_CODE_SECONDS,
} from "../shared/highSchoolYouthOnboarding";
import { HS_CONSENT_VERSION, HS_MAX_FAMILY_PLAYERS } from "../shared/highSchoolOnboarding";
import {
  HighSchoolParentSecurity, parentDigest, type ParentSql, type ParentTransaction,
} from "./highSchoolParentSecurity";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";

const uuid = z.string().uuid();
const requestProof = z.object({
  requestId: uuid, requestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();
export function generateChildSetupCode() {
  return Array.from({ length: 6 }, () => HS_SETUP_CODE_ALPHABET[randomInt(HS_SETUP_CODE_ALPHABET.length)]).join("");
}
const secret = () => randomBytes(32).toString("base64url");
const equalDigest = (a: string, b: string) => {
  const left = Buffer.from(a, "hex"), right = Buffer.from(b, "hex");
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
};

/**
 * Separate child capabilities, never Supabase parent tokens.
 *
 * The application intentionally constructs this with activationAvailable=false.
 * Only a test harness may enable it, with operator-created synthetic fixtures.
 * Passing a UI flag, code or parent password cannot enable the missing foundation.
 */
export class HighSchoolChildDevices {
  constructor(
    private pool: ParentSql,
    private parent: HighSchoolParentSecurity,
    private activationAvailable = false,
  ) {}
  private ready() {
    if (!this.activationAvailable) throw new OnboardingError("CHILD_ACTIVATION_PENDING", 503);
  }
  private async tx<T>(fn: (tx: ParentTransaction) => Promise<T>) {
    const tx = await this.pool.connect();
    try { await tx.query("BEGIN"); const value = await fn(tx); await tx.query("COMMIT"); return value; }
    catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); }
  }
  private fixture(actor: OnboardingActor) {
    if (!actor.fixture || !actor.emailVerified || !actor.email.endsWith("@example.com")) {
      throw new OnboardingError("DEV_FIXTURE_REQUIRED", 403);
    }
  }
  private async authority(actor: OnboardingActor, grant?: string, tx?: ParentTransaction) {
    this.fixture(actor);
    if (!await this.parent.authorized(actor, grant, tx)) throw new OnboardingError("PARENT_VERIFICATION_REQUIRED", 403);
  }
  private async child(db: Pick<ParentSql, "query">, id: string, parentId?: string) {
    // All identifiers are canonical server-owned records; intake is not access.
    const row = (await db.query(`SELECT c.*,r.team_id FROM hs_onboarding.children c
      JOIN hs_onboarding.player_requests r ON r.id=c.player_request_id AND r.auth_id=c.parent_auth_id
      WHERE c.id=$1 AND c.enabled=true AND c.revoked_at IS NULL AND r.status='approved'
      AND r.consent_version=$2 AND r.consented_at IS NOT NULL
      AND($3::uuid IS NULL OR c.parent_auth_id=$3::uuid)`, [id, HS_CONSENT_VERSION, parentId ?? null])).rows[0];
    if (!row) throw new OnboardingError("CHILD_ACCESS_UNAVAILABLE", 403);
    return row;
  }
  async children(actor: OnboardingActor, grant?: string) {
    await this.authority(actor, grant);
    const rows = (await this.pool.query(`SELECT coalesce(c.id,r.player_key) AS id,r.player_key AS "playerKey",
      r.details->>'firstName' AS "firstName",r.details->>'lastName' AS "lastName",
      ($2::boolean AND coalesce(c.enabled,false) AND r.status='approved'
        AND r.consent_version=$3 AND r.consented_at IS NOT NULL) AS enabled,t.name AS "teamName"
      FROM hs_onboarding.player_requests r JOIN hs_onboarding.teams t ON t.id=r.team_id
      LEFT JOIN hs_onboarding.children c ON c.player_request_id=r.id AND c.parent_auth_id=r.auth_id AND c.revoked_at IS NULL
      WHERE r.auth_id=$1 ORDER BY r.consented_at,r.id LIMIT 4`, [actor.authId,this.activationAvailable,HS_CONSENT_VERSION])).rows;
    // Deliberately do not claim that a consented intake has been activated.
    return { children: rows, activationAvailable: this.activationAvailable };
  }
  async createCode(actor: OnboardingActor, input: unknown, grant?: string) {
    await this.authority(actor, grant); this.ready();
    const { childId } = z.object({ childId: uuid }).strict().parse(input);
    const code = generateChildSetupCode(), challengeId = randomUUID();
    return this.tx(async tx => {
      // Same parent registry lock serializes issue/approve/revoke operations.
      await tx.query("SELECT auth_id FROM hs_parent_security.accounts WHERE auth_id=$1 FOR UPDATE", [actor.authId]);
      await this.authority(actor, grant, tx);
      await this.child(tx, childId, actor.authId);
      const recent = (await tx.query(`SELECT count(*)::int AS total FROM hs_onboarding.device_codes
        WHERE parent_auth_id=$1 AND created_at>now()-interval '1 hour'`, [actor.authId])).rows[0]?.total ?? 0;
      if (recent >= 20) throw new OnboardingError("CODE_RATE_LIMIT", 429);
      // Reissue invalidates pending pairing on every device, including approved
      // but not redeemed requests. Already issued sessions have a revoke action.
      await tx.query(`UPDATE hs_onboarding.device_codes SET consumed_at=coalesce(consumed_at,now())
        WHERE child_id=$1 AND consumed_at IS NULL`, [childId]);
      await tx.query(`UPDATE hs_onboarding.device_requests SET status='denied'
        WHERE child_id=$1 AND status IN('waiting','approved')`, [childId]);
      const row = (await tx.query(`INSERT INTO hs_onboarding.device_codes
        (id,child_id,parent_auth_id,code_digest,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')
        RETURNING expires_at AS "expiresAt"`, [challengeId, childId, actor.authId, parentDigest(code)])).rows[0];
      return { code, challengeId, expiresAt: row.expiresAt, expiresInSeconds: HS_SETUP_CODE_SECONDS };
    });
  }
  async start(input: unknown, source: string) {
    this.ready();
    const data = z.object({
      code: z.string().max(20),
      deviceLabel: z.string().trim().min(1).max(80).default("Player's phone"),
      challengeId: uuid.optional(),
    }).strict().parse(input);
    const code = data.code.trim().toUpperCase();
    // Request body cannot choose its throttle identity. Caller supplies peer data.
    const sourceDigest = parentDigest(`child-pairing:${source}`);
    const outcome = await this.tx(async tx => {
      await tx.query(`INSERT INTO hs_onboarding.device_attempts(source_digest) VALUES($1) ON CONFLICT DO NOTHING`, [sourceDigest]);
      const rate = (await tx.query(`SELECT failures,window_started_at>now()-interval '10 minutes' AS recent
        FROM hs_onboarding.device_attempts WHERE source_digest=$1 FOR UPDATE`, [sourceDigest])).rows[0];
      if (rate.recent && rate.failures >= HS_SETUP_CODE_MAX_FAILURES) return { error: "CODE_RATE_LIMIT", status: 429 };
      if (!rate.recent) await tx.query("UPDATE hs_onboarding.device_attempts SET failures=0,window_started_at=now() WHERE source_digest=$1", [sourceDigest]);
      const locator = data.challengeId ?? parentDigest(code);
      const condition = data.challengeId ? "id=$1::uuid" : "code_digest=$1";
      const candidate = (await tx.query(`SELECT parent_auth_id FROM hs_onboarding.device_codes WHERE ${condition}`, [locator])).rows[0];
      if (candidate) {
        // Consistent parent -> code/request/session lock order across issue,
        // approval, redemption and revocation prevents a session slipping past revoke.
        await tx.query("SELECT auth_id FROM hs_parent_security.accounts WHERE auth_id=$1 FOR UPDATE", [candidate.parent_auth_id]);
      }
      const challenge = (await tx.query(`SELECT *,expires_at>now() AS unexpired FROM hs_onboarding.device_codes
        WHERE ${condition} FOR UPDATE`, [locator])).rows[0];
      if (!HS_SETUP_CODE_PATTERN.test(code) || !challenge || !challenge.unexpired || challenge.consumed_at ||
          challenge.failures >= HS_SETUP_CODE_MAX_FAILURES || !equalDigest(challenge.code_digest, parentDigest(code))) {
        await tx.query("UPDATE hs_onboarding.device_attempts SET failures=failures+1 WHERE source_digest=$1", [sourceDigest]);
        if (challenge && !challenge.consumed_at && challenge.failures < HS_SETUP_CODE_MAX_FAILURES) {
          await tx.query("UPDATE hs_onboarding.device_codes SET failures=failures+1 WHERE id=$1", [challenge.id]);
        }
        // Return the error AFTER commit so a failed guess cannot roll back itself.
        return { error: "INVALID_OR_EXPIRED_CODE", status: 400 };
      }
      await this.child(tx, challenge.child_id, challenge.parent_auth_id);
      const requestId = randomUUID(), requestToken = secret();
      await tx.query("UPDATE hs_onboarding.device_codes SET consumed_at=now() WHERE id=$1", [challenge.id]);
      await tx.query(`INSERT INTO hs_onboarding.device_requests
        (id,code_id,child_id,parent_auth_id,token_digest,device_label,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [requestId, challenge.id, challenge.child_id, challenge.parent_auth_id, parentDigest(requestToken), data.deviceLabel, challenge.expires_at]);
      return { requestId, requestToken, status: "waiting", expiresAt: challenge.expires_at };
    });
    if ("error" in outcome) throw new OnboardingError(String(outcome.error), Number(outcome.status));
    return outcome;
  }
  async requests(actor: OnboardingActor, grant?: string) {
    await this.authority(actor, grant);
    if (!this.activationAvailable) return { requests: [], activationAvailable: false };
    const requests = (await this.pool.query(`SELECT r.id,r.child_id AS "childId",c.first_name AS "firstName",
      r.device_label AS "deviceLabel",r.expires_at AS "expiresAt" FROM hs_onboarding.device_requests r
      JOIN hs_onboarding.children c ON c.id=r.child_id
      WHERE r.parent_auth_id=$1 AND r.status='waiting' AND r.expires_at>now()
      AND c.enabled=true AND c.revoked_at IS NULL ORDER BY r.created_at LIMIT 20`, [actor.authId])).rows;
    return { requests, activationAvailable: true };
  }
  async decision(actor: OnboardingActor, id: string, input: unknown, grant?: string) {
    await this.authority(actor, grant); this.ready(); uuid.parse(id);
    const { approve } = z.object({ approve: z.boolean() }).strict().parse(input);
    return this.tx(async tx => {
      await tx.query("SELECT auth_id FROM hs_parent_security.accounts WHERE auth_id=$1 FOR UPDATE", [actor.authId]);
      await this.authority(actor, grant, tx);
      const request = (await tx.query(`SELECT *,expires_at>now() AS unexpired FROM hs_onboarding.device_requests
        WHERE id=$1 AND parent_auth_id=$2 FOR UPDATE`, [id, actor.authId])).rows[0];
      if (!request || request.status !== "waiting" || !request.unexpired) throw new OnboardingError("INVALID_DEVICE_REQUEST", 409);
      await this.child(tx, request.child_id, actor.authId);
      await tx.query("UPDATE hs_onboarding.device_requests SET status=$2,approved_session_id=$3 WHERE id=$1",
        [id, approve ? "approved" : "denied", actor.sessionId]);
      return { status: approve ? "approved" : "denied" };
    });
  }
  async poll(input: unknown) {
    this.ready();
    const data = requestProof.parse(input);
    return this.tx(async tx => {
      const candidate = (await tx.query(`SELECT parent_auth_id FROM hs_onboarding.device_requests
        WHERE id=$1 AND token_digest=$2`, [data.requestId, parentDigest(data.requestToken)])).rows[0];
      if (!candidate) throw new OnboardingError("INVALID_DEVICE_REQUEST", 403);
      await tx.query("SELECT auth_id FROM hs_parent_security.accounts WHERE auth_id=$1 FOR UPDATE", [candidate.parent_auth_id]);
      const request = (await tx.query(`SELECT *,expires_at>now() AS unexpired FROM hs_onboarding.device_requests
        WHERE id=$1 AND token_digest=$2 FOR UPDATE`, [data.requestId, parentDigest(data.requestToken)])).rows[0];
      if (!request) throw new OnboardingError("INVALID_DEVICE_REQUEST", 403);
      if (!request.unexpired) return { status: "expired" };
      if (request.status === "redeemed") throw new OnboardingError("DEVICE_REQUEST_ALREADY_USED", 409);
      if (request.status !== "approved") return { status: request.status };
      await this.child(tx, request.child_id, request.parent_auth_id);
      const approved = (await tx.query(`SELECT 1 FROM auth.sessions WHERE id=$1 AND user_id=$2
        AND(not_after IS NULL OR not_after>now())`, [request.approved_session_id, request.parent_auth_id])).rows.length;
      if (!approved) throw new OnboardingError("PARENT_SESSION_ENDED", 403);
      const sessionToken = `hs_child_${secret()}`;
      await tx.query(`INSERT INTO hs_onboarding.child_sessions
        (token_digest,child_id,request_id,parent_auth_id,approved_session_id,expires_at)
        VALUES($1,$2,$3,$4,$5,now()+interval '12 hours')`,
      [parentDigest(sessionToken), request.child_id, request.id, request.parent_auth_id, request.approved_session_id]);
      await tx.query("UPDATE hs_onboarding.device_requests SET status='redeemed' WHERE id=$1", [request.id]);
      return { status: "approved", sessionToken };
    });
  }
  private async session(token: unknown, db: Pick<ParentSql, "query"> = this.pool) {
    this.ready();
    if (typeof token !== "string" || !/^hs_child_[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new OnboardingError("INVALID_CHILD_SESSION", 401);
    }
    const row = (await db.query(`SELECT s.* FROM hs_onboarding.child_sessions s
      JOIN auth.sessions a ON a.id=s.approved_session_id AND a.user_id=s.parent_auth_id
      WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
      AND(a.not_after IS NULL OR a.not_after>now())`, [parentDigest(token)])).rows[0];
    if (!row) throw new OnboardingError("INVALID_CHILD_SESSION", 401);
    const child = await this.child(db, row.child_id, row.parent_auth_id);
    return { ...row, child };
  }
  private chatScope = `((c.kind='family' AND c.parent_auth_id=$2 AND c.team_id IS NULL)
    OR(c.kind='team' AND c.team_id=$3 AND c.parent_auth_id IS NULL))`;
  /** Coverage only; does not grant chat/payment/guardian capabilities or activate a child. */
  async verifiedProParent(token: unknown, teamId: string) {
    const session = await this.session(token);
    if (session.child.team_id !== teamId) return null;
    const result = await this.pool.query(`SELECT p.league_id,
      (SELECT count(DISTINCT r.player_key)::int FROM hs_onboarding.player_requests r
       WHERE r.auth_id=$2) AS family_players
      FROM hs_onboarding.teams t JOIN hs_onboarding.programs p ON p.id=t.program_id
      WHERE t.id=$1 AND p.status='approved'`, [teamId, session.parent_auth_id]);
    const row = result.rows[0];
    if (!row || row.family_players > HS_MAX_FAMILY_PLAYERS) return null;
    return { parentId: session.parent_auth_id as string, teamId, leagueId: row.league_id as string };
  }
  async ownSession(token: unknown) {
    const session = await this.session(token);
    const schedule = (await this.pool.query(`SELECT id,title,starts_at AS "startsAt",location
      FROM hs_onboarding.child_events WHERE child_id=$1 ORDER BY starts_at LIMIT 100`, [session.child_id])).rows;
    const chats = (await this.pool.query(`SELECT c.id,c.name,c.kind FROM hs_onboarding.child_chats c
      JOIN hs_onboarding.child_chat_members m ON m.chat_id=c.id WHERE m.child_id=$1
      AND ${this.chatScope} ORDER BY c.name`, [session.child_id, session.parent_auth_id, session.child.team_id])).rows;
    return { child: { id: session.child_id, firstName: session.child.first_name, lastName: session.child.last_name }, schedule, chats };
  }
  async messages(token: unknown, chatId: string) {
    uuid.parse(chatId);
    const session = await this.session(token);
    const allowed = (await this.pool.query(`SELECT c.id FROM hs_onboarding.child_chats c
      JOIN hs_onboarding.child_chat_members m ON m.chat_id=c.id
      WHERE m.child_id=$1 AND c.id=$4 AND ${this.chatScope}`,
    [session.child_id, session.parent_auth_id, session.child.team_id, chatId])).rows.length;
    if (!allowed) throw new OnboardingError("CHILD_CHAT_FORBIDDEN", 403);
    // No participant IDs, parent contacts, attachments, signed URLs or DM routes.
    return { messages: (await this.pool.query(`SELECT m.id,m.body,m.created_at AS "createdAt",
      CASE WHEN m.child_id=$2 THEN 'You' ELSE 'Teammate' END AS sender
      FROM hs_onboarding.child_messages m WHERE m.chat_id=$1
      ORDER BY m.created_at DESC,m.id DESC LIMIT 100`, [chatId, session.child_id])).rows.reverse() };
  }
  async sendMessage(token: unknown, chatId: string, input: unknown) {
    uuid.parse(chatId);
    const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).strict().parse(input);
    return this.tx(async tx => {
      const beforeLock = await this.session(token, tx);
      await tx.query("SELECT auth_id FROM hs_parent_security.accounts WHERE auth_id=$1 FOR UPDATE", [beforeLock.parent_auth_id]);
      const session = await this.session(token, tx);
      const inserted = await tx.query(`INSERT INTO hs_onboarding.child_messages(id,chat_id,child_id,body)
        SELECT $5,c.id,$1,$6 FROM hs_onboarding.child_chats c
        JOIN hs_onboarding.child_chat_members m ON m.chat_id=c.id
        WHERE m.child_id=$1 AND c.id=$4 AND ${this.chatScope} RETURNING id`,
      [session.child_id, session.parent_auth_id, session.child.team_id, chatId, randomUUID(), body]);
      if (!inserted.rows.length) throw new OnboardingError("CHILD_CHAT_FORBIDDEN", 403);
      return { saved: true, id: inserted.rows[0].id };
    });
  }
  async revoke(actor: OnboardingActor, childId: string, grant?: string) {
    await this.authority(actor, grant); uuid.parse(childId);
    return this.tx(async tx => {
      await tx.query("SELECT auth_id FROM hs_parent_security.accounts WHERE auth_id=$1 FOR UPDATE", [actor.authId]);
      await this.authority(actor, grant, tx);
      await this.child(tx, childId, actor.authId);
      await tx.query("UPDATE hs_onboarding.child_sessions SET revoked_at=now() WHERE child_id=$1", [childId]);
      await tx.query("UPDATE hs_onboarding.device_codes SET consumed_at=coalesce(consumed_at,now()) WHERE child_id=$1", [childId]);
      await tx.query("UPDATE hs_onboarding.device_requests SET status='denied' WHERE child_id=$1 AND status IN('waiting','approved')", [childId]);
      return { revoked: true };
    });
  }
}

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { OnboardingActor } from "./highSchoolOnboarding";
import type { ParentTransaction } from "./highSchoolParentSecurity";
import { eventInput } from "../shared/highSchoolStaff";
import { StaffBase, staffFail, uuid, type StaffScope } from "./highSchoolStaffBase";

const versionInput = z.object({ version: z.number().int().positive() }).strict();
export class HighSchoolStaffEvents extends StaffBase {
  private async event(db: ParentTransaction, scope: StaffScope, id: string) {
    uuid.parse(id);
    const event = (await db.query("SELECT * FROM hs_onboarding.staff_events WHERE id=$1 AND team_id=$2 AND deleted_at IS NULL FOR UPDATE", [id, scope.teamId])).rows[0];
    if (!event) staffFail("EVENT_NOT_FOUND", 404);
    return event;
  }
  private editable(event: any, version: number) {
    if (event.status !== "scheduled") staffFail("FINAL_EVENT_LOCKED", 409);
    if (event.version !== version) staffFail("EVENT_CHANGED_REFRESH_REQUIRED", 409);
  }
  private async notification(db: ParentTransaction, scope: StaffScope, id: string, version: number, action: string) {
    await db.query(`INSERT INTO hs_onboarding.staff_dispatch(id,event_id,team_id,event_version,action)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_id,event_version) DO NOTHING`, [randomUUID(), id, scope.teamId, version, action]);
  }
  /** Durable outbox plus immediate injectable DEV dispatch. Stable IDs are the
   * transport's idempotency key; no OneSignal, email or billing code is imported. */
  async retryDispatch(actor: OnboardingActor, teamId: string) {
    return this.withScope(actor, teamId, async (db) => {
      const pending = (await db.query(`SELECT * FROM hs_onboarding.staff_dispatch
        WHERE team_id=$1 AND delivered_at IS NULL ORDER BY created_at,id LIMIT 200 FOR UPDATE`, [teamId])).rows;
      let delivered = 0;
      for (const row of pending) {
        await db.query("UPDATE hs_onboarding.staff_dispatch SET attempts=attempts+1 WHERE id=$1", [row.id]);
        try {
          await this.dispatch({ id: row.id, eventId: row.event_id, teamId, version: row.event_version, action: row.action });
          await db.query("UPDATE hs_onboarding.staff_dispatch SET delivered_at=now() WHERE id=$1", [row.id]); delivered++;
        } catch { /* Persist failed attempts. The authorized retry keeps the same id. */ }
      }
      return { saved: true, delivered, pending: pending.length - delivered, delivery: "development_only" };
    });
  }
  private async afterChange(actor: OnboardingActor, teamId: string, result: { saved: boolean; id?: string; count?: number }) {
    try { return { ...result, notification: await this.retryDispatch(actor, teamId) }; }
    catch { return { ...result, notification: { pending: true, delivery: "development_only" } }; }
  }
  async create(actor: OnboardingActor, teamId: string, input: unknown) {
    const data = eventInput.parse(input);
    const result = await this.withScope(actor, teamId, async (db, scope) => {
      const id = randomUUID();
      await db.query(`INSERT INTO hs_onboarding.staff_events(id,team_id,title,opponent,starts_at,rink,address)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, teamId, data.title, data.opponent, data.startsAt, data.rink, data.address]);
      await this.notification(db, scope, id, 1, "created"); await this.audit(db, actor, scope, "schedule_created", id);
      return { saved: true, id };
    });
    return this.afterChange(actor, teamId, result);
  }
  async update(actor: OnboardingActor, teamId: string, id: string, input: unknown) {
    const { version, ...data } = eventInput.extend({ version: z.number().int().positive() }).strict().parse(input);
    const result = await this.withScope(actor, teamId, async (db, scope) => {
      const event = await this.event(db, scope, id); this.editable(event, version);
      await db.query(`UPDATE hs_onboarding.staff_events SET title=$2,opponent=$3,starts_at=$4,rink=$5,address=$6,version=version+1 WHERE id=$1`,
        [id, data.title, data.opponent, data.startsAt, data.rink, data.address]);
      await this.notification(db, scope, id, version + 1, "updated"); await this.audit(db, actor, scope, "schedule_updated", id);
      return { saved: true };
    });
    return this.afterChange(actor, teamId, result);
  }
  async remove(actor: OnboardingActor, teamId: string, id: string, input: unknown) {
    const { version } = versionInput.parse(input);
    const result = await this.withScope(actor, teamId, async (db, scope) => {
      this.editable(await this.event(db, scope, id), version);
      await db.query("UPDATE hs_onboarding.staff_events SET deleted_at=now(),version=version+1 WHERE id=$1", [id]);
      await this.notification(db, scope, id, version + 1, "deleted"); await this.audit(db, actor, scope, "schedule_deleted", id);
      return { saved: true };
    });
    return this.afterChange(actor, teamId, result);
  }
  async import(actor: OnboardingActor, teamId: string, input: unknown) {
    const { rows } = z.object({ rows: z.array(eventInput).min(1).max(200) }).strict().parse(input);
    const result = await this.withScope(actor, teamId, async (db, scope) => {
      let count = 0;
      for (const data of rows) {
        // Stable identity makes an unchanged re-import safe; edited games are
        // not overwritten by a stale file. Imports never fetch external URLs.
        const hash = createHash("md5").update(JSON.stringify([teamId, data.title, new Date(data.startsAt).toISOString(), data.opponent, data.rink, data.address])).digest("hex");
        const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
        const inserted = await db.query(`INSERT INTO hs_onboarding.staff_events(id,team_id,title,opponent,starts_at,rink,address)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id`,
        [id, teamId, data.title, data.opponent, data.startsAt, data.rink, data.address]);
        if (inserted.rows.length) { count++; await this.notification(db, scope, id, 1, "created"); }
      }
      await this.audit(db, actor, scope, "schedule_imported"); return { saved: true, count };
    });
    return this.afterChange(actor, teamId, result);
  }
  async lineup(actor: OnboardingActor, teamId: string, id: string) {
    return this.withScope(actor, teamId, async (db, scope) => {
      await this.event(db, scope, id);
      const players = await this.players(db, scope, true);
      const saved = (await db.query("SELECT child_id,state FROM hs_onboarding.staff_lineup WHERE event_id=$1", [id])).rows;
      const entries = saved.flatMap(row => {
        const player = players.find(p => p.id === row.child_id);
        return player ? [{ playerId: player.id, name: `${player.firstName} ${player.lastName}`, teamName: player.teamName,
          state: row.state, callup: player.teamId !== teamId }] : [];
      });
      return { entries };
    });
  }
  async saveLineup(actor: OnboardingActor, teamId: string, id: string, input: unknown) {
    const { entries } = z.object({ entries: z.array(z.object({ playerId: uuid, state: z.enum(["dress", "scratch"]) }).strict()).max(100) }).strict().parse(input);
    if (new Set(entries.map(e => e.playerId)).size !== entries.length) staffFail("DUPLICATE_LINEUP_PLAYER");
    return this.withScope(actor, teamId, async (db, scope) => {
      const event = await this.event(db, scope, id);
      if (event.status !== "scheduled") staffFail("FINAL_EVENT_LOCKED", 409);
      const players = await this.players(db, scope, true);
      for (const entry of entries) {
        const player = players.find(p => p.id === entry.playerId);
        if (!player || !player.guardianLinked || !player.consented) staffFail("LINEUP_REQUIRES_APPROVED_PLAYER_GUARDIAN_AND_CONSENT", 403);
      }
      await db.query("DELETE FROM hs_onboarding.staff_lineup WHERE event_id=$1", [id]);
      for (const entry of entries) await db.query(`INSERT INTO hs_onboarding.staff_lineup(event_id,child_id,state,updated_by)
        VALUES($1,$2,$3,$4)`, [id, entry.playerId, entry.state, actor.authId]);
      await this.audit(db, actor, scope, "lineup_saved", id); return { saved: true };
    });
  }
  async report(actor: OnboardingActor, teamId: string, id: string, input: unknown) {
    const { version, homeScore, awayScore } = versionInput.extend({
      homeScore: z.number().int().min(0).max(99), awayScore: z.number().int().min(0).max(99),
    }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      this.editable(await this.event(db, scope, id), version);
      const updated = await db.query(`UPDATE hs_onboarding.staff_events SET status='final',home_score=$2,away_score=$3,
        reported_by=$4,version=version+1 WHERE id=$1 AND starts_at<=now()-interval '2 hours' RETURNING id`,
      [id, homeScore, awayScore, actor.authId]);
      if (!updated.rows.length) staffFail("FINAL_REPORT_AVAILABLE_TWO_HOURS_AFTER_START", 409);
      await this.audit(db, actor, scope, "final_report_saved", id);
      return { saved: true };
    });
  }
}

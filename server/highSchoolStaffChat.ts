import { randomUUID } from "node:crypto";
import { z } from "zod";
import { StaffBase, staffFail, uuid, type StaffScope } from "./highSchoolStaffBase";
import type { ParentTransaction } from "./highSchoolParentSecurity";
import type { OnboardingActor } from "./highSchoolOnboarding";

export class HighSchoolStaffChat extends StaffBase {
  private async room(db: ParentTransaction, scope: StaffScope, id: string) {
    if (this.leagueAdministration) staffFail("LEAGUE_ADMIN_PLAYER_CHAT_FORBIDDEN", 403);
    uuid.parse(id);
    const room = (await db.query(`SELECT id,kind FROM hs_onboarding.child_chats WHERE id=$1 AND team_id=$2
      AND parent_auth_id IS NULL AND kind IN('team','parents','coaches')`, [id, scope.teamId])).rows[0];
    if (!room) staffFail("CHAT_ROOM_FORBIDDEN", 403);
    return room;
  }
  async messages(actor: OnboardingActor, teamId: string, roomId: string) {
    return this.withScope(actor, teamId, async (db, scope) => {
      await this.room(db, scope, roomId);
      const messages = (await db.query(`SELECT m.id,m.body,m.created_at AS "createdAt",
        CASE WHEN m.author_auth_id IS NOT NULL THEN 'staff' ELSE 'child' END AS "authorType",
        CASE WHEN m.author_auth_id IS NOT NULL THEN coalesce(nullif(trim(concat(u.first_name,' ',u.last_name)),''),'Staff member')
          ELSE coalesce(c.first_name,'Teammate') END AS sender
        FROM hs_onboarding.child_messages m LEFT JOIN public.users u ON u.id=m.author_auth_id::text
        LEFT JOIN hs_onboarding.children c ON c.id=m.child_id
        WHERE m.chat_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 100`, [roomId])).rows.reverse();
      return { messages };
    });
  }
  async send(actor: OnboardingActor, teamId: string, roomId: string, input: unknown) {
    const { body, requestId } = z.object({ body: z.string().trim().min(1).max(1000), requestId: uuid }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      await this.room(db, scope, roomId);
      const prior = (await db.query("SELECT id,chat_id,body FROM hs_onboarding.child_messages WHERE author_auth_id=$1 AND request_id=$2", [actor.authId, requestId])).rows[0];
      if (prior) {
        if (prior.chat_id !== roomId || prior.body !== body) staffFail("MESSAGE_RETRY_CONFLICT", 409);
        return { saved: true, id: prior.id };
      }
      const id = randomUUID();
      await db.query(`INSERT INTO hs_onboarding.child_messages(id,chat_id,author_auth_id,body,request_id) VALUES($1,$2,$3,$4,$5)`,
        [id, roomId, actor.authId, body, requestId]);
      // No notification/email provider, fallback, socket or recipient API.
      return { saved: true, id };
    });
  }
  async reportMessage(actor: OnboardingActor, teamId: string, id: string, input: unknown) {
    uuid.parse(id);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      const message = (await db.query(`SELECT m.id FROM hs_onboarding.child_messages m
        JOIN hs_onboarding.child_chats c ON c.id=m.chat_id WHERE m.id=$1 AND c.team_id=$2 AND c.kind='team'
        AND c.parent_auth_id IS NULL`, [id, teamId])).rows[0];
      if (!message) staffFail("REPORT_MESSAGE_FORBIDDEN", 403);
      await db.query(`INSERT INTO hs_onboarding.message_reports(id,message_id,reported_by,reason) VALUES($1,$2,$3,$4)
        ON CONFLICT(message_id,reported_by) DO NOTHING`, [randomUUID(), id, actor.authId, reason]);
      await this.audit(db, actor, scope, "team_message_reported", id);
      return { saved: true };
    });
  }
  async resolve(actor: OnboardingActor, teamId: string, id: string) {
    uuid.parse(id);
    return this.withScope(actor, teamId, async (db, scope) => {
      this.ad(scope);
      const row = await db.query(`UPDATE hs_onboarding.message_reports r SET status='resolved',resolved_by=$2
        FROM hs_onboarding.child_messages m JOIN hs_onboarding.child_chats room ON room.id=m.chat_id
        JOIN public.teams t ON t.id=room.team_id::text
        WHERE r.id=$1 AND r.message_id=m.id AND room.kind='team' AND room.parent_auth_id IS NULL
        AND t.program_type='high_school' AND t.program_id=$3 RETURNING r.id`, [id, actor.authId, scope.programId]);
      if (!row.rows.length) staffFail("REPORT_FORBIDDEN", 403);
      await this.audit(db, actor, scope, "team_message_report_resolved", id);
      return { saved: true };
    });
  }
}

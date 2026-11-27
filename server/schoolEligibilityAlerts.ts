import { randomUUID } from "node:crypto";
import type { ParentSql, ParentTransaction } from "./highSchoolParentSecurity";
import type { OnboardingActor } from "./highSchoolOnboarding";
import { StaffBase, staffFail, uuid } from "./highSchoolStaffBase";
import { PRODUCTION_ONBOARDING_TESTERS } from "./productionOnboardingTests";

export const eligibilityAlertPreview = {
  title: "Playing eligibility updated",
  message: "A league playing-status decision changed. Review your team’s eligibility before setting the lineup.",
} as const;
export type EligibilityAlertPush = (alert: {
  id: string; recipientId: string; title: string; message: string;
}) => Promise<void>;

// Reject missing/invalid dates rather than interpreting an approved role as
// evidence of adulthood. Match the application's New York calendar boundary.
export function adultCoach(dob: unknown, now = new Date()) {
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const date = new Date(`${dob}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dob) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return Number(today.slice(0, 4)) - Number(dob.slice(0, 4))
    - (today.slice(5) < dob.slice(5) ? 1 : 0) >= 18;
}

async function requireAlerts(db: Pick<ParentTransaction, "query">) {
  if (!(await db.query("SELECT to_regclass('hs_onboarding.eligibility_alerts') AS installed")).rows[0]?.installed)
    staffFail("ELIGIBILITY_ALERT_UPDATE_REQUIRED", 503);
}

/** Canonical adult coaches on this exact team, never program-wide ADs, parents,
 * pending requests or the legacy captain flag. Used at enqueue AND delivery. */
async function coaches(db: ParentTransaction, teamId: string, live: boolean) {
  const rows = (await db.query(`SELECT DISTINCT u.id,u.date_of_birth
    FROM public.team_memberships m JOIN public.users u ON u.id=m.user_id
    JOIN auth.users a ON a.id::text=u.id
    JOIN public.teams t ON t.id=m.team_id
    JOIN hs_onboarding.teams source ON source.id::text=t.id AND source.program_id=t.program_id
    JOIN hs_onboarding.programs p ON p.id=source.program_id
    WHERE m.team_id=$1 AND m.status='approved' AND m.child_profile_id IS NULL
      AND m.role IN('head_coach','assistant_coach') AND u.deleted_at IS NULL
      AND a.email_confirmed_at IS NOT NULL AND a.deleted_at IS NULL
      AND t.program_type='high_school' AND p.status='approved'
      AND (($2::boolean AND u.display_id=ANY($3::text[]))
        OR (NOT $2::boolean AND lower(a.email) LIKE '%@example.com'
          AND a.raw_app_meta_data->>'synthetic_high_school_onboarding_dev'='true'))`,
  [teamId, live, [...PRODUCTION_ONBOARDING_TESTERS]])).rows;
  return rows.filter(row => adultCoach(row.date_of_birth));
}

export async function queueEligibilityAlerts(db: ParentTransaction, auditId: string, teamIds: string[], live: boolean) {
  await requireAlerts(db);
  for (const teamId of Array.from(new Set(teamIds)).sort()) {
    for (const coach of await coaches(db, teamId, live)) {
      await db.query(`INSERT INTO hs_onboarding.eligibility_alerts(id,audit_id,team_id,recipient_id)
        VALUES($1,$2,$3,$4) ON CONFLICT(audit_id,team_id,recipient_id) DO NOTHING`,
      [randomUUID(), auditId, teamId, coach.id]);
    }
  }
}

export class SchoolEligibilityAlerts extends StaffBase {
  // No push/email provider imports. The production composition intentionally
  // supplies no transport; future approved delivery must honor id as its
  // provider idempotency key, including after a lost response or DB rollback.
  constructor(pool: ParentSql, live = false, private push?: EligibilityAlertPush) {
    super(pool, undefined, undefined, live);
  }
  private async authorized<T>(actor: OnboardingActor, teamId: string,
    work: (db: ParentTransaction) => Promise<T>) {
    return this.withScope(actor, teamId, async (db, scope) => {
      await requireAlerts(db);
      if (!["head_coach", "assistant_coach"].includes(scope.role)
        || !(await coaches(db, teamId, this.live)).some(row => row.id === actor.authId))
        staffFail("COACH_ALERTS_FORBIDDEN", 403);
      return work(db);
    });
  }
  async inbox(actor: OnboardingActor, teamId: string) {
    return this.authorized(actor, teamId, async db => ({
      alerts: (await db.query(`SELECT id FROM hs_onboarding.eligibility_alerts
        WHERE team_id=$1 AND recipient_id=$2 AND read_at IS NULL AND cancelled_at IS NULL
        ORDER BY created_at,id LIMIT 100`, [teamId, actor.authId])).rows
        .map(row => ({ id: row.id as string, ...eligibilityAlertPreview })),
    }));
  }
  async acknowledge(actor: OnboardingActor, teamId: string, id: string) {
    uuid.parse(id);
    return this.authorized(actor, teamId, async db => {
      await db.query(`UPDATE hs_onboarding.eligibility_alerts SET read_at=coalesce(read_at,now())
        WHERE id=$1 AND team_id=$2 AND recipient_id=$3 AND cancelled_at IS NULL`, [id, teamId, actor.authId]);
      return { saved: true };
    });
  }
  async retryPush(actor: OnboardingActor, teamId: string) {
    // Program lock serializes against canonical staff revocations. Each row's
    // authority is rechecked immediately before the external side effect.
    return this.withScope(actor, teamId, async db => {
      await requireAlerts(db);
      if (!this.push) return { delivery: "disabled", delivered: 0 };
      const pending = (await db.query(`SELECT id,recipient_id FROM hs_onboarding.eligibility_alerts
        WHERE team_id=$1 AND push_delivered_at IS NULL AND cancelled_at IS NULL
        ORDER BY created_at,id LIMIT 100 FOR UPDATE`, [teamId])).rows;
      let delivered = 0;
      for (const row of pending) {
        if (!(await coaches(db, teamId, this.live)).some(coach => coach.id === row.recipient_id)) {
          await db.query("UPDATE hs_onboarding.eligibility_alerts SET cancelled_at=now() WHERE id=$1", [row.id]);
          continue;
        }
        await db.query("UPDATE hs_onboarding.eligibility_alerts SET attempts=attempts+1 WHERE id=$1", [row.id]);
        try {
          await this.push({ id: row.id, recipientId: row.recipient_id, ...eligibilityAlertPreview });
          await db.query("UPDATE hs_onboarding.eligibility_alerts SET push_delivered_at=now() WHERE id=$1", [row.id]);
          delivered++;
        } catch { /* Stable recipient-specific ID is reused on the next retry. */ }
      }
      return { delivery: "configured", delivered };
    });
  }
}

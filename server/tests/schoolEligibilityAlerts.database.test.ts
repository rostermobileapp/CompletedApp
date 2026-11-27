import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import express from "express";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { SchoolPlayerEligibilityService } from "../schoolPlayerEligibility";
import { adultCoach, eligibilityAlertPreview, SchoolEligibilityAlerts } from "../schoolEligibilityAlerts";
import { registerHighSchoolStaffRoutes } from "../highSchoolStaffHttp";
import { OnboardingError } from "../highSchoolOnboarding";

test("adult coach dates are strict and use the New York day", () => {
  const now = new Date("2026-11-27T02:00:00Z"); // Still November 26 in New York.
  assert.equal(adultCoach("2008-11-26", now), true);
  for (const dob of ["2008-11-27", "2015-01-01", "1980-02-30", "", null, "unknown"])
    assert.equal(adultCoach(dob, now), false);
});

test("eligibility alerts use isolated SQL, scoped delivery and durable retry IDs", async t => {
  const f = await createStaffFixture();
  const { pool, ids, actors: a, staff, events, chat } = f;
  const service = new SchoolPlayerEligibilityService(pool);
  const inbox = new SchoolEligibilityAlerts(pool);
  const input = (restricted: boolean, version: number, reason = restricted ? "Private league review" : "") => ({ restricted, version, reason });
  const count = async () => (await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.eligibility_alerts")).rows[0].n;
  const deny = (work: Promise<unknown>, code: string) => assert.rejects(work, (e: any) => e.code === code);
  let server: ReturnType<express.Express["listen"]> | undefined;
  try {
    await pool.query("INSERT INTO public.leagues(id,name,league_type,commissioner_id) VALUES($1,'Fixture','high_school',$2)", [ids.league,a.league.authId]);
    await pool.query("UPDATE public.team_memberships SET role='head_coach' WHERE user_id=$1", [a.outsider.authId]);
    await pool.query("INSERT INTO public.team_memberships(user_id,team_id,role,status) VALUES($1,$2,'head_coach','approved')",
      [a.applicant.authId, ids.jv]);
    await pool.query("UPDATE public.team_memberships SET status='approved' WHERE user_id=$1", [a.revoked.authId]);
    await pool.query("UPDATE public.users SET date_of_birth='2015-01-01' WHERE id=$1", [a.revoked.authId]);
    // Installation is repeatable and never sends messages.
    await pool.query(await readFile("migrations/0062_school_eligibility_alerts.sql", "utf8"));

    await t.test("restriction queues only current adult coaches of the affected team", async () => {
      await service.setLeague(a.league, ids.league, ids.varsity, ids.child1, input(true, 0));
      assert.equal(await count(), 2);
      const recipients = (await pool.query("SELECT recipient_id FROM hs_onboarding.eligibility_alerts")).rows.map(r => r.recipient_id).sort();
      assert.deepEqual(recipients, [a.head.authId, a.assistant.authId].sort());
      const received = await inbox.inbox(a.head, ids.varsity);
      assert.deepEqual(received.alerts.map(({ id, ...preview }) => preview), [eligibilityAlertPreview]);
      assert.doesNotMatch(JSON.stringify(received), /Private league review|child1|Synthetic|child_id|restricted/);
      await deny(inbox.inbox(a.outsider, ids.varsity), "STAFF_TEAM_FORBIDDEN");
      await deny(inbox.inbox(a.head, ids.foreign), "STAFF_TEAM_FORBIDDEN");
      await deny(inbox.inbox(a.applicant, ids.varsity), "STAFF_TEAM_FORBIDDEN");
      await deny(inbox.inbox(a.revoked, ids.varsity), "COACH_ALERTS_FORBIDDEN");
      for (const actor of [a.manager, a.ad]) await deny(inbox.inbox(actor, ids.varsity), "COACH_ALERTS_FORBIDDEN");
      await deny(inbox.inbox(a.parent, ids.varsity), "STAFF_TEAM_FORBIDDEN");
      await deny(inbox.inbox(a.pending, ids.varsity), "STAFF_TEAM_FORBIDDEN");
      await deny(service.setLeague(a.league, ids.league, ids.foreign, ids.child1, input(false, 1)), "PLAYER_TEAM_FORBIDDEN");
      await deny(service.setLeague(a.league, ids.league, ids.varsity, ids.child2, input(false, 1)), "PLAYER_TEAM_FORBIDDEN");
      assert.equal(await count(), 2);
    });

    await t.test("reason edits, optimistic retries and team decisions do not create league alerts; clear does", async () => {
      await service.setLeague(a.league, ids.league, ids.varsity, ids.child1, input(true, 1, "Changed private reason"));
      await deny(service.setLeague(a.league, ids.league, ids.varsity, ids.child1, input(true, 1)), "ELIGIBILITY_CHANGED_REFRESH_REQUIRED");
      await service.setTeam(a.head, ids.varsity, ids.child1, input(true, 0));
      await service.setTeam(a.head, ids.varsity, ids.child1, input(false, 1));
      assert.equal(await count(), 2);
      await service.setLeague(a.league, ids.league, ids.varsity, ids.child1, input(false, 2));
      assert.equal(await count(), 4);
      assert.equal((await inbox.inbox(a.head, ids.varsity)).alerts.length, 2);
    });

    await t.test("no push transport means no delivery and pending rows are preserved", async () => {
      assert.deepEqual(await inbox.retryPush(a.head, ids.varsity), { delivery: "disabled", delivered: 0 });
      assert.equal((await pool.query("SELECT sum(attempts)::int AS n FROM hs_onboarding.eligibility_alerts")).rows[0].n, 0);
    });

    await t.test("lost provider replies reuse the same IDs; concurrent retries do not duplicate delivery", async () => {
      const attempts: string[] = [], accepted = new Set<string>();
      let fail = true;
      const transport = new SchoolEligibilityAlerts(pool, false, async alert => {
        assert.deepEqual(Object.keys(alert).sort(), ["id", "message", "recipientId", "title"]);
        assert.equal(alert.title, eligibilityAlertPreview.title);
        assert.equal(alert.message, eligibilityAlertPreview.message);
        attempts.push(alert.id); accepted.add(alert.id);
        if (fail) throw Error("Simulated lost provider response");
      });
      assert.equal((await transport.retryPush(a.head, ids.varsity)).delivered, 0);
      assert.equal(attempts.length, 4);
      fail = false;
      const results = await Promise.all([transport.retryPush(a.head, ids.varsity), transport.retryPush(a.head, ids.varsity)]);
      assert.equal(results.reduce((n, r) => n + r.delivered, 0), 4);
      assert.equal(accepted.size, 4);
      assert.equal(attempts.length, 8);
      for (const id of accepted) assert.equal(attempts.filter(value => value === id).length, 2);
      assert.equal((await transport.retryPush(a.head, ids.varsity)).delivered, 0);
    });

    await t.test("revoked coaches lose unread alerts and are cancelled before push delivery", async () => {
      await service.setLeague(a.league, ids.league, ids.varsity, ids.child1, input(true, 3));
      const assistantMembership = (await pool.query("SELECT id FROM public.team_memberships WHERE user_id=$1 AND team_id=$2", [a.assistant.authId, ids.varsity])).rows[0].id;
      await staff.revoke(a.head, ids.varsity, assistantMembership);
      await deny(inbox.inbox(a.assistant, ids.varsity), "STAFF_TEAM_FORBIDDEN");
      const delivered: string[] = [];
      const transport = new SchoolEligibilityAlerts(pool, false, async alert => { delivered.push(alert.recipientId); });
      await transport.retryPush(a.head, ids.varsity);
      assert.deepEqual(delivered, [a.head.authId]);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.eligibility_alerts WHERE cancelled_at IS NOT NULL")).rows[0].n, 1);
      await deny(transport.retryPush(a.assistant, ids.varsity), "STAFF_TEAM_FORBIDDEN");
    });

    await t.test("age, deletion and selected-account rollout are revalidated at delivery", async () => {
      const live = new SchoolEligibilityAlerts(pool, true);
      await deny(live.inbox(a.head, ids.varsity), "COACH_ALERTS_FORBIDDEN");
      await pool.query("UPDATE public.users SET display_id='U00250' WHERE id=$1", [a.head.authId]);
      assert.ok((await live.inbox(a.head, ids.varsity)).alerts.length);
      for (const date of [null, "2015-01-01", "invalid"]) {
        await pool.query("UPDATE public.users SET date_of_birth=$2 WHERE id=$1", [a.head.authId, date]);
        await deny(live.inbox(a.head, ids.varsity), "COACH_ALERTS_FORBIDDEN");
      }
      await pool.query("UPDATE public.users SET date_of_birth='1980-01-01',deleted_at=now() WHERE id=$1", [a.head.authId]);
      await deny(live.inbox(a.head, ids.varsity), "COACH_ALERTS_FORBIDDEN");
      await pool.query("UPDATE public.users SET deleted_at=NULL WHERE id=$1", [a.head.authId]);
      await pool.query("UPDATE auth.users SET deleted_at=now() WHERE id=$1", [a.head.authId]);
      await deny(live.inbox(a.head, ids.varsity), "COACH_ALERTS_FORBIDDEN");
      await pool.query("UPDATE auth.users SET deleted_at=NULL WHERE id=$1", [a.head.authId]);
    });

    await t.test("actual HTTP delivery is private, scoped, and acknowledgements are idempotent", async () => {
      const app = express(); app.use(express.json());
      registerHighSchoolStaffRoutes(app, staff, events, chat, {} as any, async req => {
        const actor = a[String(req.get("authorization") ?? "")];
        if (!actor) throw new OnboardingError("INVALID_SESSION", 401);
        return actor;
      }, true, inbox);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>(resolve => server!.once("listening", resolve));
      const origin = `http://127.0.0.1:${(server.address() as any).port}`;
      const url = `${origin}/api/high-school/staff/teams/${ids.varsity}/eligibility-alerts`;
      const response = await fetch(url, { headers: { authorization: "head" } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const { alerts } = await response.json() as { alerts: { id: string }[] };
      assert.equal((await fetch(url, { headers: { authorization: "assistant" } })).status, 403);
      assert.equal((await fetch(url, { headers: { authorization: "outsider" } })).status, 403);
      assert.equal((await fetch(url)).status, 401);
      const id = alerts[0].id;
      // A foreign-team ACK cannot consume the recipient's real inbox item.
      assert.equal((await fetch(url.replace(ids.varsity, ids.foreign) + `/${id}/read`, {
        method: "POST", headers: { authorization: "head" },
      })).status, 403);
      assert.equal((await inbox.inbox(a.head, ids.varsity)).alerts.length, alerts.length);
      // Another coach's ID cannot consume the head coach's item.
      await pool.query("UPDATE public.team_memberships SET status='approved' WHERE user_id=$1 AND team_id=$2", [a.assistant.authId, ids.varsity]);
      await inbox.acknowledge(a.assistant, ids.varsity, id);
      assert.equal((await inbox.inbox(a.head, ids.varsity)).alerts.length, alerts.length);
      for (let n = 0; n < 2; n++) {
        assert.equal((await fetch(`${url}/${id}/read`, { method: "POST", headers: { authorization: "head" } })).status, 200);
      }
      assert.equal((await inbox.inbox(a.head, ids.varsity)).alerts.length, alerts.length - 1);
    });

    await t.test("queue failure rolls back the restriction, audit and alert changes together", async () => {
      const before = await count();
      await pool.query("ALTER TABLE hs_onboarding.eligibility_alerts RENAME TO alerts_not_installed");
      await deny(service.setLeague(a.league, ids.league, ids.varsity, ids.child1, input(false, 4)), "ELIGIBILITY_ALERT_UPDATE_REQUIRED");
      await pool.query("ALTER TABLE hs_onboarding.alerts_not_installed RENAME TO eligibility_alerts");
      const [row] = (await pool.query("SELECT restricted,version FROM hs_onboarding.league_player_eligibility WHERE child_id=$1", [ids.child1])).rows;
      assert.equal(row.restricted, true); assert.equal(row.version, 4);
      assert.equal(await count(), before);
    });
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await f.close();
  }
});

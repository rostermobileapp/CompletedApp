import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createProCoverageService } from "../proCoverageService";
import { resolvePersonalPro } from "../personalProCoverage";
import { hasAccountPro, hasProFor, hasUncoveredTeams, NO_ACCOUNT_PRO, type ProCoverage } from "../../shared/proCoverage";
import { proConversationContext } from "../../shared/proConversation";
import { HighSchoolChildDevices } from "../highSchoolChildDevices";

const paid = { personal: true, legacy: false, source: "apple" as const };
function fixture() {
  const unavailable = new Set<string>();
  const personalReads: string[] = [];
  const accounts = new Map([
    ["personal", paid], ["school-parent", NO_ACCOUNT_PRO], ["adult-parent", NO_ACCOUNT_PRO],
    ["multiple", NO_ACCOUNT_PRO], ["free", NO_ACCOUNT_PRO],
    ["manual", { personal: false, legacy: true, source: "legacy_grant" as const }],
  ]);
  const teams = [{ id: "school", leagueId: "HS" }, { id: "adult", leagueId: "ADULT" }, { id: "other", leagueId: "OTHER" }];
  const membership = new Set(["school-parent:HS", "adult-parent:ADULT", "multiple:HS", "multiple:ADULT"]);
  const grants = [
    { user: "school-parent", leagueId: "HS", startMonth: "2026-11", endMonth: "2027-02", status: "paid" },
    { user: "adult-parent", leagueId: "ADULT", startMonth: "2026-10", endMonth: "2026-11", status: "paid" },
    ...["HS", "ADULT"].map(leagueId => ({ user: "multiple", leagueId, startMonth: "2026-11", endMonth: "2026-11", status: "paid" })),
  ];
  let month = "2026-11";
  const active = (id: string) => grants.filter(g => g.user === id && membership.has(`${id}:${g.leagueId}`) &&
    g.status === "paid" && g.startMonth <= month && g.endMonth >= month);
  const sessions = new Map([
    ["child-one", { parentId: "school-parent", teamId: "school", leagueId: "HS" }],
    ["child-two", { parentId: "school-parent", teamId: "school", leagueId: "HS" }],
    ["personal-child", { parentId: "personal", teamId: "other", leagueId: "OTHER" }],
  ]);
  const service = createProCoverageService({
    account: async id => accounts.has(id) ? { id, role: "free_tier" } : undefined,
    personal: async account => {
      personalReads.push(account.id);
      if (unavailable.has(account.id)) throw new Error("Personal verification unavailable");
      return accounts.get(account.id)!;
    },
    team: async id => teams.find(t => t.id === id), teams: async () => teams,
    seats: async id => active(id),
    seat: async (id, leagueId) => active(id).some(g => g.leagueId === leagueId),
    childParent: async token => sessions.get(token) ?? null,
  });
  return { service, accounts, grants, membership, teams, sessions, unavailable, personalReads, month: (value: string) => { month = value; } };
}

test("personal subscribers cover approved adult/HS contexts, not management authority", async () => {
  const { service } = fixture();
  for (const teamId of ["adult", "school", "other"]) assert.equal(await service.hasProFor("personal", { teamId }), true);
  assert.equal(await service.hasProFor("missing", { teamId: "school" }), false);
  assert.equal(await service.hasProFor("personal", { teamId: "missing" }), false);
  assert.equal(await service.hasProFor("personal", { teamId: "school", leagueId: "ADULT" }), false);
});
test("school/adult seats stay in their league and never unlock account extras", async () => {
  const { service } = fixture();
  for (const [user, teamId, expected] of [
    ["school-parent", "school", true], ["school-parent", "adult", false],
    ["adult-parent", "adult", true], ["adult-parent", "school", false],
    ["multiple", "adult", true], ["multiple", "school", true], ["multiple", "other", false],
  ] as const) assert.equal(await service.hasProFor(user, { teamId }), expected);
  for (const user of ["school-parent", "adult-parent", "multiple", "free"]) {
    assert.equal(await service.hasProFor(user), false);
    assert.equal(hasAccountPro((await service.snapshot(user))!.account), false);
  }
});
test("an unrelated personal-provider outage cannot block a verified league seat or its snapshot", async () => {
  const f = fixture();
  f.unavailable.add("school-parent");
  assert.equal(await f.service.hasProFor("school-parent",{teamId:"school"}),true);
  assert.equal(await f.service.hasProForChild("child-one","school"),true);
  assert.deepEqual(f.personalReads,[],"independent seats must not wait for personal billing");
  await assert.rejects(f.service.hasProFor("school-parent",{teamId:"adult"}),/Personal verification unavailable/);
  await assert.rejects(f.service.hasProFor("school-parent"),/Personal verification unavailable/);
  const snapshot=(await f.service.snapshot("school-parent"))!;
  assert.equal(snapshot.personalVerificationUnavailable,true);
  assert.deepEqual(snapshot.account,NO_ACCOUNT_PRO);
  assert.equal(hasProFor(snapshot,{teamId:"school"}),true);
  assert.equal(hasProFor(snapshot,{teamId:"adult"}),false);
  assert.equal(hasUncoveredTeams(snapshot),false,"unknown personal status must not be sold as a confirmed Free plan");
  f.membership.delete("school-parent:HS");
  await assert.rejects(f.service.hasProFor("school-parent",{teamId:"school"}),/Personal verification unavailable/);
});
test("inclusive windows, overlapping grants, future/expired/unpaid and removed memberships", async () => {
  const f = fixture();
  assert.equal(await f.service.hasProFor("adult-parent", { teamId: "adult" }), true);
  f.month("2026-12");
  assert.equal(await f.service.hasProFor("adult-parent", { teamId: "adult" }), false);
  f.month("2026-10");
  assert.equal(await f.service.hasProFor("school-parent", { teamId: "school" }), false);
  f.month("2027-02");
  assert.equal(await f.service.hasProFor("school-parent", { teamId: "school" }), true);
  f.month("2027-03");
  assert.equal(await f.service.hasProFor("school-parent", { teamId: "school" }), false);
  f.month("2026-11");
  for (const status of ["pending", "cancelled"]) {
    f.grants[0].status = status;
    assert.equal(await f.service.hasProFor("school-parent", { teamId: "school" }), false);
  }
  f.grants[0].status = "paid";
  f.membership.delete("school-parent:HS");
  assert.equal(await f.service.hasProFor("school-parent", { teamId: "school" }), false);
  assert.deepEqual((await f.service.snapshot("school-parent"))!.seats, []);
});
test("child coverage uses the verified session's parent and team, with no identity fallback", async () => {
  const { service, sessions } = fixture();
  for (const token of ["child-one", "child-two"]) {
    assert.equal(await service.hasProForChild(token, "school"), true);
    assert.equal(await service.hasProForChild(token, "adult"), false);
  }
  assert.equal(await service.hasProForChild("personal-child", "other"), true);
  assert.equal(await service.hasProForChild("school-parent", "school"), false);
  sessions.delete("child-one");
  assert.equal(await service.hasProForChild("child-one", "school"), false);
});
test("guarded registry proves the parent/team, rejects over-limit families, and never activates real children", async () => {
  const calls: string[] = [];
  let family = 2;
  let consent = true;
  const pool: any = {
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes("to_regclass('hs_onboarding.independent_child_version')")) return { rows: [{ ready: null }] };
      if (sql.includes("FROM hs_onboarding.child_sessions")) return { rows: [{ child_id: "child", parent_auth_id: "verified-parent" }] };
      if (sql.includes("FROM hs_onboarding.children")) return { rows: consent ? [{ id: "child", team_id: "school" }] : [] };
      if (sql.includes("SELECT p.league_id")) return { rows: [{ league_id: "HS", family_players: family }] };
      throw new Error("Unexpected query");
    },
  };
  const token = `hs_child_${"A".repeat(43)}`;
  const disabled = new HighSchoolChildDevices(pool, {} as any);
  await assert.rejects(disabled.verifiedProParent(token,"school"), (e: any) => e.code === "CHILD_ACTIVATION_PENDING");
  assert.equal(calls.length,0);
  const synthetic = new HighSchoolChildDevices(pool, {} as any, true);
  assert.deepEqual(await synthetic.verifiedProParent(token,"school"), { parentId: "verified-parent", teamId: "school", leagueId: "HS" });
  assert.equal(await synthetic.verifiedProParent(token,"adult"),null);
  family=3;
  assert.equal(await synthetic.verifiedProParent(token,"school"),null);
  consent=false;
  await assert.rejects(synthetic.verifiedProParent(token,"school"), (e: any) => e.code === "CHILD_ACCESS_UNAVAILABLE");
  assert.ok(calls.some(sql=>sql.includes("JOIN auth.sessions")&&sql.includes("s.revoked_at IS NULL")));
  assert.ok(calls.some(sql=>sql.includes("r.consent_version")&&sql.includes("r.status='approved'")));
  assert.ok(calls.every(sql=>!/\b(UPDATE|DELETE|INSERT)\b/.test(sql)));
});
test("UI and server use actual resources despite a different dashboard selection; moves invalidate scope", async () => {
  const { service, teams } = fixture();
  const snapshot = (await service.snapshot("school-parent"))!;
  for (const team of teams) assert.equal(hasProFor(snapshot, { teamId: team.id }), await service.hasProFor("school-parent", { teamId: team.id }));
  assert.equal(hasProFor(snapshot, { teamId: "adult", leagueId: "HS" }), false);
  assert.equal(hasUncoveredTeams(snapshot), true);
  assert.equal(hasUncoveredTeams((await service.snapshot("personal"))!), false);
  teams[0].leagueId = "OTHER";
  assert.equal(await service.hasProFor("school-parent", { teamId: "school" }), false);
  const allCovered = (await service.snapshot("multiple"))!;
  allCovered.teams = allCovered.teams.filter(t => t.id === "adult");
  assert.equal(hasUncoveredTeams(allCovered), false);
});
test("purchase evidence respects expiry/refunds/cancel-at-period-end and explicitly preserves manual grants", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");
  const future = "2026-12-24T12:00:00Z", past = "2026-10-24T12:00:00Z";
  const user = { id: "account", role: "player_pro" };
  assert.deepEqual(resolvePersonalPro(user, {}, undefined, now), { personal: false, legacy: true, source: "legacy_grant" });
  assert.deepEqual(resolvePersonalPro({...user,iapOriginalTransactionId:"legacy-unlinked"}, {}, undefined, now),
    { personal: false, legacy: true, source: "legacy_grant" });
  assert.equal(hasAccountPro(resolvePersonalPro({...user,role:"free_tier",iapOriginalTransactionId:"legacy-unlinked"}, {}, undefined, now)),false);
  for (const source of ["apple", "google"] as const) {
    assert.equal(resolvePersonalPro(user, { [source]: { expires: future, product: "player_pro_monthly" } }, undefined, now).personal, true);
    assert.equal(hasAccountPro(resolvePersonalPro(user, { [source]: { expires: past, product: "player_pro_monthly" } }, undefined, now)), false);
  }
  assert.equal(hasAccountPro(resolvePersonalPro(user, { apple: { expires: future, product: "commissioner_yearly", revoked: true } }, undefined, now)), false);
  const stripe = { ...user, stripeSubscriptionId: "sub_fixture" };
  assert.equal(resolvePersonalPro(stripe, {}, { active: true, validUntil: future }, now).personal, true);
  assert.equal(resolvePersonalPro(stripe, {}, { active: true, validUntil: past }, now).personal, false);
  assert.equal(resolvePersonalPro(stripe, {}, { active: false, validUntil: future }, now).personal, false);
  assert.equal(resolvePersonalPro({ ...user, isPrimaryCommissioner: true }, {}, undefined, now).source, "operational");
  assert.equal(resolvePersonalPro({ ...user, role: "secondary_commissioner" }, { apple: { expires: past } }, undefined, now).legacy, true);
});
test("actual historical ownership-backfill rows are not managed expiry evidence, including Apple IDs backfilled as Google", () => {
  // This is the stored shape created by initGoogleIapClaimsDb: only token_hash,
  // user_id and claimed_at are set; the added product/expiry columns stay NULL.
  const backfilledRow={
    token_hash:"f".repeat(64),user_id:"historical-account",claimed_at:"2026-01-01T00:00:00Z",
    product_id:null,expires_at:null,
  };
  const now=Date.parse("2026-11-24T12:00:00Z");
  const google={product:backfilledRow.product_id,expires:backfilledRow.expires_at};
  for(const role of ["player_pro","commissioner","free_tier"]){
    const account={id:backfilledRow.user_id,role,iapOriginalTransactionId:"historical-apple-transaction"};
    const preserved=resolvePersonalPro(account,{google},undefined,now);
    assert.equal(preserved.personal,false);
    assert.equal(preserved.legacy,role!=="free_tier");
    assert.equal(hasAccountPro(resolvePersonalPro(account,{
      google:{product:"player_pro_monthly",expires:"2026-01-01T00:00:00Z"},
    },undefined,now)),false);
    assert.equal(hasAccountPro(resolvePersonalPro(account,{
      google,apple:{product:"com.rosterapp.player_pro_monthly",expires:null,revoked:true},
    },undefined,now)),false);
    assert.equal(hasAccountPro(resolvePersonalPro(account,{
      google,apple:{product:"com.rosterapp.player_pro_monthly",expires:"2026-01-01T00:00:00Z"},
    },undefined,now)),false);
  }
});
test("a league display tag cannot make a direct message or arbitrary group league-covered", () => {
  for (const type of ["direct", "custom_group"]) assert.deepEqual(proConversationContext({ type, leagueId: "HS", teamId: "school" }), {});
  assert.deepEqual(proConversationContext({ type: "team_group", teamId: "school", leagueId: "ADULT" }), { teamId: "school" });
  assert.deepEqual(proConversationContext({ type: "captain_only", leagueId: "HS" }), { leagueId: "HS" });
});
test("direct API requests reject unrelated/mixed resources regardless of selected-league body hints", async () => {
  const { service } = fixture();
  const app = express(); app.use(express.json());
  // Isolated fixture authentication, not an app bypass or live provider call.
  app.use((req: any, res, next) => {
    const id = req.get("x-fixture-session");
    if (!["personal", "school-parent", "adult-parent", "multiple"].includes(id ?? "")) return res.sendStatus(401);
    req.actor = id; next();
  });
  app.get("/account", async (req: any, res) => res.sendStatus(await service.hasProFor(req.actor) ? 200 : 403));
  app.post("/resources", async (req: any, res) => {
    const decisions = await Promise.all(req.body.teamIds.map((teamId: string) => service.hasProFor(req.actor, { teamId })));
    res.sendStatus(decisions.every(Boolean) ? 200 : 403);
  });
  const server = app.listen(0); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const [user, teamIds, status] of [
      ["school-parent", ["school"], 200], ["school-parent", ["adult"], 403],
      ["school-parent", ["school", "adult"], 403], ["multiple", ["school", "adult"], 200],
      ["multiple", ["school", "other"], 403], ["personal", ["school", "adult", "other"], 200],
    ] as const) {
      const res = await fetch(`${url}/resources`, { method: "POST", headers: { "content-type": "application/json", "x-fixture-session": user },
        body: JSON.stringify({ teamIds, selectedLeagueId: "HS", parentId: "personal" }) });
      assert.equal(res.status, status);
    }
    assert.equal((await fetch(`${url}/account`, { headers: { "x-fixture-session": "school-parent" } })).status, 403);
    assert.equal((await fetch(`${url}/account`, { headers: { "x-fixture-session": "personal" } })).status, 200);
    assert.equal((await fetch(`${url}/account`)).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

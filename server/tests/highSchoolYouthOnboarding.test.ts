import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { HS_CONSENT_VERSION, HS_MAX_FAMILY_PLAYERS, hsChoosePath, hsParentPlayersMatchSaved, hsSaveDraft } from "../../shared/highSchoolOnboarding";
import {
  HS_SETUP_CODE_PATTERN, hsHockeyType, hsJourneyInput, hsLeagueDraftInput, validateHsLeagueDraft,
} from "../../shared/highSchoolYouthOnboarding";
import { HighSchoolYouthOnboarding } from "../highSchoolYouthOnboarding";
import { HighSchoolChildDevices, generateChildSetupCode } from "../highSchoolChildDevices";
import { parentDigest, type ParentSql } from "../highSchoolParentSecurity";
import { requestChildSession } from "../../client/src/lib/highSchoolChildSession";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = { authId: id(1), sessionId: id(2), fixture: true, emailVerified: true, email: "fixture@example.com" };
const approvedParent = { async authorized() { return true; }, async enrolled() { return true; } } as any;
const unapprovedParent = { async authorized() { return false; }, async enrolled() { return true; } } as any;
function fakePool(query: (sql: string, args: any[]) => any[]) {
  const calls: string[] = [];
  const db = {
    async query(sql: string, args: any[] = []) { calls.push(sql); return { rows: query(sql, args) }; },
    async connect() { return { query: db.query.bind(db), release() { calls.push("RELEASE"); } }; },
  } satisfies ParentSql;
  return { db, calls };
}

test("hockey type and HS role selection use explicit allowlists, not permission claims", () => {
  assert.equal(hsChoosePath.parse({ path: "league_admin" }).path, "league_admin");
  assert.equal(hsChoosePath.parse({ path: "parent" }).adultConfirmed, undefined);
  assert.throws(() => hsChoosePath.parse({ path: "commissioner" }));
  assert.throws(() => hsHockeyType.parse({ hockeyType: "adult", approved: true }));
  assert.throws(() => hsHockeyType.parse({ hockeyType: "youth_any_age" }));
});
test("saved player comparison ignores database JSON key order but preserves consent and identity checks", () => {
  const player = { id:id(8),firstName:"Example",lastName:"Player",gradYear:2028,position:"F",jerseyNumber:"",
    consent:true,consentVersion:HS_CONSENT_VERSION,photoConsent:false,publicNameConsent:false };
  const reordered = Object.fromEntries(Object.entries(player).reverse());
  assert.equal(hsParentPlayersMatchSaved([player],[reordered]),true);
  assert.equal(hsParentPlayersMatchSaved([{...player,firstName:" Example "}],[reordered]),true);
  for(const changed of [{consent:false},{photoConsent:true},{id:id(9)},{gradYear:2029}]){
    assert.equal(hsParentPlayersMatchSaved([{...player,...changed}],[reordered]),false);
  }
  assert.equal(hsParentPlayersMatchSaved([player],[]),false);
});
test("family setup accepts two players and rejects a third without discarding anyone", () => {
  assert.equal(HS_MAX_FAMILY_PLAYERS,2);
  const players=Array.from({length:3},(_,index)=>({
    id:id(index+30),firstName:"Example",lastName:"Player",gradYear:2028,position:"F",
    jerseyNumber:"",consent:true,consentVersion:HS_CONSENT_VERSION,
    photoConsent:false,publicNameConsent:false,
  }));
  const draft={kind:"parent",revision:0,guardianConfirmed:true,players:players.slice(0,2)};
  assert.equal(hsSaveDraft.safeParse(draft).success,true);
  assert.equal(hsSaveDraft.safeParse({...draft,players}).success,false);
  assert.equal(hsParentPlayersMatchSaved(players.slice(0,2),players.slice(0,2)),true);
  assert.equal(hsParentPlayersMatchSaved(players,players),false);
  assert.equal(players.length,3,"validation must not truncate existing family drafts");
});
test("child setup codes exclude lookalikes and have exactly six characters", () => {
  for (let i = 0; i < 1000; i++) {
    const code = generateChildSetupCode();
    assert.match(code, HS_SETUP_CODE_PATTERN);
    assert.equal(code.length, 6);
    assert.doesNotMatch(code, /[01OI]/);
  }
});
test("HS profile input cannot submit player fields, child identity or entitlements", () => {
  const profile = { firstName: "Example", lastName: "Guardian", timezone: "America/New_York" };
  assert.ok(hsJourneyInput.safeParse({ revision: 0, screen: "profile", profile }).success);
  for (const extra of [{ playerType: "Skater" }, { childId: id(3) }, { role: "commissioner" }]) {
    assert.equal(hsJourneyInput.safeParse({ revision: 0, screen: "profile", profile: { ...profile, ...extra } }).success, false);
  }
  assert.equal(hsJourneyInput.safeParse({ revision: 0, screen: "referral", referralPartnerId: "partner", referralSourceOther: "other" }).success, false);
});

const schools = [
  { id: id(3), name: "Example School", town: "Example Town", teams: [{ id: id(4), name: "Varsity" }] },
  { id: id(5), name: "Other School", town: "Other Town", teams: [{ id: id(6), name: "Varsity" }] },
];
const league = { details: { name: "Example League", state: "MA", season: "2026–27" }, schools };
test("HS league drafts do not accept adult options, prices or activation flags", () => {
  for (const bad of [{ sportType: "adult" }, { price: 99 }, { activated: true }, { role: "commissioner" }]) {
    assert.equal(hsLeagueDraftInput.safeParse({ revision: 0, stage: "details", ...league, ...bad }).success, false);
  }
});
test("league draft schedule validates team ownership, calendar dates and duplicates", () => {
  const game = { homeTeamId: id(4), awayTeamId: id(6), date: "2026-12-01", time: "18:30", rink: "Example Ice" };
  const validated = hsLeagueDraftInput.parse({ revision: 0, stage: "schedule", schedule: [game] });
  assert.equal(validateHsLeagueDraft(league, validated).schedule.length, 1);
  for (const invalid of [{ ...game, homeTeamId: id(99) }, { ...game, awayTeamId: id(4) }, { ...game, date: "2026-02-30" }]) {
    assert.throws(() => validateHsLeagueDraft(league, { revision: 0, stage: "schedule", schedule: [invalid] }));
  }
  assert.throws(() => validateHsLeagueDraft(league, { revision: 0, stage: "schedule", schedule: [game, game] }));
});
test("school and invitation scope cannot cross into another team's school", () => {
  assert.throws(() => validateHsLeagueDraft(league, {
    revision: 0, stage: "schools", schools: [schools[0], schools[0]],
  }), /DUPLICATE/);
  assert.throws(() => validateHsLeagueDraft(league, {
    revision: 0, stage: "invitations", invitations: [{ email: "example@example.com", role: "head_coach", schoolId: id(3), teamId: id(6) }],
  }), /INVALID_INVITATION_SCOPE/);
  assert.throws(() => validateHsLeagueDraft({}, { revision: 0, stage: "plan" }), /LEAGUE_DETAILS_REQUIRED/);
});
test("ordinary accounts may select Adult, but HS writes require verified synthetic fixtures", async () => {
  const { db } = fakePool(sql => sql.includes("FROM auth.sessions") ? [{}] : []);
  const service = new HighSchoolYouthOnboarding(db, approvedParent, {} as any);
  const adult = { ...actor, fixture: false };
  assert.deepEqual(await service.hockeyType(adult, { hockeyType: "adult" }), { saved: true, hockeyType: "adult" });
  await assert.rejects(service.hockeyType(adult, { hockeyType: "high_school_youth" }), (e: any) => e.code === "DEV_FIXTURE_REQUIRED");
});
test("hockey type cannot switch a locked adult path into school authority", async () => {
  const { db } = fakePool(sql => sql.includes("FROM auth.sessions") ? [{}] : sql.includes("SELECT path FROM") ? [{ path: "player" }] : []);
  const service = new HighSchoolYouthOnboarding(db, approvedParent, {} as any);
  await assert.rejects(service.hockeyType(actor, { hockeyType: "high_school_youth" }), (e: any) => e.code === "PATH_ALREADY_SELECTED");
});
test("parent journey data remains redacted without parent authority", async () => {
  const { db, calls } = fakePool(sql => sql.includes("to_regclass") ? [{ installed: true }] : [{ hockey_type: "high_school_youth", journey: { profile: { firstName: "Not exposed" } } }]);
  const service = new HighSchoolYouthOnboarding(db, unapprovedParent, {
    async state() { return { path: "parent", status: "parent_verification_required" }; },
  } as any);
  const state = await service.state(actor);
  assert.equal(state.journey, undefined);
  assert.equal(state.leagueDraft, undefined);
  assert.equal(calls.some(sql => sql.includes("league_drafts")), false);
});
test("parent authority and optimistic revision are checked before updating journeys", async () => {
  const { db, calls } = fakePool(sql => sql.includes("FROM auth.sessions") ? [{}] :
    sql.includes("FROM hs_onboarding.flows") ? [{ path: "parent", revision: 2 }] : []);
  const service = new HighSchoolYouthOnboarding(db, unapprovedParent, {} as any);
  await assert.rejects(service.journey(actor, { revision: 1, screen: "parent_players" }), (e: any) => e.code === "DRAFT_CONFLICT");
  await assert.rejects(service.journey(actor, { revision: 2, screen: "parent_players" }), (e: any) => e.code === "PARENT_VERIFICATION_REQUIRED");
  assert.equal(calls.some(sql => sql.includes("INSERT INTO hs_onboarding.contexts")), false);
});
test("confirmed referral cannot be replaced and role journeys cannot cross paths", async () => {
  const { db } = fakePool(sql => sql.includes("FROM auth.sessions") ? [{}] :
    sql.includes("FROM hs_onboarding.flows") ? [{ path: "staff", revision: 0 }] :
      sql.includes("SELECT journey") ? [{ journey: { referralPartnerId: "original" } }] : []);
  const service = new HighSchoolYouthOnboarding(db, approvedParent, {} as any);
  await assert.rejects(service.journey(actor, { revision: 0, screen: "referral", referralPartnerId: "replacement" }), (e: any) => e.code === "REFERRAL_LOCKED");
  await assert.rejects(service.journey(actor, { revision: 0, screen: "parent_code" }), (e: any) => e.code === "WRONG_ONBOARDING_PATH");
});
test("a confirmed non-partner referral is equally immutable", async () => {
  const { db } = fakePool(sql => sql.includes("FROM auth.sessions") ? [{}] :
    sql.includes("FROM hs_onboarding.flows") ? [{ path: "staff", revision: 0 }] :
      sql.includes("SELECT journey") ? [{ journey: { referralSourceOther: "Family or friend" } }] : []);
  const service = new HighSchoolYouthOnboarding(db, approvedParent, {} as any);
  await assert.rejects(service.journey(actor, { revision: 0, screen: "referral", referralSourceOther: "Online search" }), (e: any) => e.code === "REFERRAL_LOCKED");
  await assert.rejects(service.journey(actor, { revision: 0, screen: "referral", referralPartnerId: "partner" }), (e: any) => e.code === "REFERRAL_LOCKED");
});
test("staff progress cannot reference an inaccessible school or a different school's team", async () => {
  const { db } = fakePool(sql => sql.includes("FROM auth.sessions") ? [{}] :
    sql.includes("FROM hs_onboarding.flows") ? [{ path: "staff", revision: 0 }] :
      sql.includes("SELECT journey") ? [{ journey: {} }] : []);
  const service = new HighSchoolYouthOnboarding(db, approvedParent, {} as any);
  await assert.rejects(service.journey(actor, { revision: 0, screen: "staff_team", programId: id(88) }), (e: any) => e.code === "UNKNOWN_SCHOOL");
  await assert.rejects(service.journey(actor, { revision: 0, screen: "staff_team", teamId: id(89) }), (e: any) => e.code === "WRONG_SCHOOL_TEAM");
});
test("parent and league-admin journeys cannot acquire staff fields", async () => {
  for (const path of ["parent", "league_admin"]) {
    const { db } = fakePool(sql => sql.includes("FROM auth.sessions") ? [{}] :
      sql.includes("FROM hs_onboarding.flows") ? [{ path, revision: 0 }] : []);
    const service = new HighSchoolYouthOnboarding(db, approvedParent, {} as any);
    await assert.rejects(service.journey(actor, { revision: 0, screen: "profile", staffRole: "head_coach" }), (e: any) => e.code === "WRONG_ONBOARDING_PATH");
  }
});
test("the child transport cannot send tokens to parent routes or third-party URLs", async () => {
  const token = `hs_child_${"a".repeat(43)}`;
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.cache, "no-store");
    assert.deepEqual(options?.headers, { Authorization: `Bearer ${token}` });
    return new Response(JSON.stringify({ child: { firstName: "Example" } }), { status: 200 });
  };
  try {
    for (const url of ["/api/user", "/api/high-school/onboarding/children", "https://example.com/session", "/api/high-school/child-device/session?forward=anything"]) {
      await assert.rejects(requestChildSession(token, "GET", url), /outside the approved player session/);
    }
    await assert.rejects(requestChildSession("parent-token", "GET", "/api/high-school/child-device/session"));
    assert.equal(calls, 0);
    await requestChildSession(token, "GET", "/api/high-school/child-device/session");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
test("the application child-activation default fails closed without touching any database", async () => {
  const { db, calls } = fakePool(() => { throw new Error("must not query"); });
  const service = new HighSchoolChildDevices(db, approvedParent);
  await assert.rejects(service.start({ code: "K7P2QX" }, "synthetic-peer"), (e: any) => e.code === "CHILD_ACTIVATION_PENDING");
  await assert.rejects(service.poll({}), (e: any) => e.code === "CHILD_ACTIVATION_PENDING");
  await assert.rejects(service.ownSession("anything"), (e: any) => e.code === "CHILD_ACTIVATION_PENDING");
  assert.equal(calls.length, 0);
});
test("a shared parent password without parent verification cannot issue or approve codes", async () => {
  const { db } = fakePool(() => []);
  const service = new HighSchoolChildDevices(db, unapprovedParent, true);
  await assert.rejects(service.createCode(actor, { childId: id(3) }), (e: any) => e.code === "PARENT_VERIFICATION_REQUIRED");
  await assert.rejects(service.decision(actor, id(4), { approve: true }), (e: any) => e.code === "PARENT_VERIFICATION_REQUIRED");
});
test("device management preserves activation and production rollout gates", async () => {
  const { db, calls } = fakePool(() => []);
  const disabled = new HighSchoolChildDevices(db, approvedParent);
  assert.deepEqual(await disabled.sessions(actor), { sessions: [], activationAvailable: false });
  assert.equal(calls.length, 0);
  const production = new HighSchoolChildDevices(db, approvedParent, true, { production: true });
  await assert.rejects(production.sessions({ ...actor, productionTest: true }),
    (e: any) => e.code === "ONBOARDING_TEST_ACCESS_DENIED");
  await assert.rejects(production.revokeSession({ ...actor, productionTest: true }, id(3), id(4)),
    (e: any) => e.code === "ONBOARDING_TEST_ACCESS_DENIED");
  const enabled = new HighSchoolChildDevices(db, approvedParent, true);
  for (const who of [{ ...actor, emailVerified: false }, { ...actor, fixture: false }]) {
    await assert.rejects(enabled.sessions(who), (e: any) => e.code === "DEV_FIXTURE_REQUIRED");
    await assert.rejects(enabled.revokeSession(who, id(3), id(4)), (e: any) => e.code === "DEV_FIXTURE_REQUIRED");
  }
  await assert.rejects(enabled.revokeSession(actor, "not-a-child-id", id(4)));
  await assert.rejects(enabled.revokeSession(actor, id(3), "not-a-device-id"));
  assert.equal(calls.some(sql => sql.startsWith("UPDATE")), false);
});
test("single-device revocation rechecks parent authority under the registry lock", async () => {
  let checks = 0;
  const parent = { authorized: async () => ++checks === 1 } as any;
  const { db, calls } = fakePool(() => []);
  const service = new HighSchoolChildDevices(db, parent, true);
  await assert.rejects(service.revokeSession(actor, id(3), id(4)),
    (e: any) => e.code === "PARENT_VERIFICATION_REQUIRED");
  assert.equal(checks, 2);
  assert.ok(calls.some(sql => sql.includes("FOR UPDATE")));
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(calls.some(sql => sql.startsWith("UPDATE")), false);
});
test("wrong pairing guesses are committed and increment both source and located code budgets", async () => {
  const { db, calls } = fakePool(sql => {
    if (sql.includes("window_started_at>")) return [{ failures: 0, recent: true }];
    if (sql.startsWith("SELECT parent_auth_id FROM hs_onboarding.device_codes")) return [{ parent_auth_id: actor.authId }];
    if (sql.includes("FROM hs_onboarding.device_codes") && sql.includes("FOR UPDATE")) return [{
      id: id(3), code_digest: parentDigest("K7P2QX"), failures: 0, unexpired: true,
    }];
    return [];
  });
  const service = new HighSchoolChildDevices(db, approvedParent, true);
  await assert.rejects(service.start({ code: "K7P2QA", challengeId: id(3) }, "peer"), (e: any) => e.code === "INVALID_OR_EXPIRED_CODE");
  assert.ok(calls.some(sql => sql.includes("device_codes SET failures=failures+1")));
  assert.ok(calls.includes("COMMIT"));
  assert.equal(calls.includes("ROLLBACK"), false);
});
test("five failed guesses block even a correct code for that source", async () => {
  const { db, calls } = fakePool(sql => sql.includes("window_started_at>") ? [{ failures: 5, recent: true }] : []);
  const service = new HighSchoolChildDevices(db, approvedParent, true);
  await assert.rejects(service.start({ code: "K7P2QX" }, "peer"), (e: any) => e.code === "CODE_RATE_LIMIT");
  assert.equal(calls.some(sql => sql.startsWith("INSERT INTO hs_onboarding.device_requests")), false);
});
for (const condition of ["expired", "consumed", "locked"] as const) {
  test(`${condition} pairing codes never create a request or a child session`, async () => {
    const { db, calls } = fakePool(sql => {
      if (sql.includes("window_started_at>")) return [{ failures: 0, recent: true }];
      if (sql.startsWith("SELECT parent_auth_id")) return [{ parent_auth_id: actor.authId }];
      if (sql.includes("FROM hs_onboarding.device_codes") && sql.includes("FOR UPDATE")) return [{
        id: id(3), code_digest: parentDigest("K7P2QX"), failures: condition === "locked" ? 5 : 0,
        unexpired: condition !== "expired", consumed_at: condition === "consumed" ? new Date() : null,
      }];
      return [];
    });
    const service = new HighSchoolChildDevices(db, approvedParent, true);
    await assert.rejects(service.start({ code: "K7P2QX" }, "peer"), (e: any) => e.code === "INVALID_OR_EXPIRED_CODE");
    assert.equal(calls.some(sql => sql.startsWith("INSERT INTO hs_onboarding.device_requests") || sql.includes("INSERT INTO hs_onboarding.child_sessions")), false);
  });
}
test("a valid code consumes itself but grants only a waiting request", async () => {
  const { db, calls } = fakePool(sql => {
    if (sql.includes("window_started_at>")) return [{ failures: 0, recent: true }];
    if (sql.startsWith("SELECT parent_auth_id")) return [{ parent_auth_id: actor.authId }];
    if (sql.includes("FROM hs_onboarding.device_codes") && sql.includes("FOR UPDATE")) return [{
      id: id(3), child_id: id(4), parent_auth_id: actor.authId, code_digest: parentDigest("K7P2QX"),
      failures: 0, unexpired: true, expires_at: new Date(Date.now() + 600000),
    }];
    if (sql.includes("FROM hs_onboarding.children")) return [{ id: id(4), enabled: true }];
    return [];
  });
  const service = new HighSchoolChildDevices(db, approvedParent, true);
  const result = await service.start({ code: "K7P2QX" }, "peer");
  assert.equal(result.status, "waiting");
  assert.equal("sessionToken" in result, false);
  assert.equal(calls.some(sql => sql.includes("INSERT INTO hs_onboarding.child_sessions")), false);
  assert.ok(calls.some(sql => sql.includes("UPDATE hs_onboarding.device_codes SET consumed_at=now()")));
});
test("waiting and denied requests cannot receive a child token", async () => {
  for (const status of ["waiting", "denied"]) {
    const { db, calls } = fakePool(sql => sql.startsWith("SELECT parent_auth_id") ? [{ parent_auth_id: actor.authId }] :
      sql.includes("FROM hs_onboarding.device_requests") ? [{ status, unexpired: true }] : []);
    const service = new HighSchoolChildDevices(db, approvedParent, true);
    assert.deepEqual(await service.poll({ requestId: id(3), requestToken: "a".repeat(43) }), { status });
    assert.equal(calls.some(sql => sql.includes("INSERT INTO hs_onboarding.child_sessions")), false);
  }
});
test("an already redeemed request cannot mint another session", async () => {
  const { db } = fakePool(sql => sql.startsWith("SELECT parent_auth_id") ? [{ parent_auth_id: actor.authId }] :
    sql.includes("FROM hs_onboarding.device_requests") ? [{ status: "redeemed", unexpired: true }] : []);
  const service = new HighSchoolChildDevices(db, approvedParent, true);
  await assert.rejects(service.poll({ requestId: id(3), requestToken: "a".repeat(43) }), (e: any) => e.code === "DEVICE_REQUEST_ALREADY_USED");
});
test("all schema tables stay private and no migration is added to production", () => {
  const sql = readFileSync("scripts/dev-only/high-school-youth-onboarding.sql", "utf8");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA hs_onboarding/);
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
  const auth = readFileSync("server/supabaseAuth.ts", "utf8");
  assert.match(auth, /new HighSchoolChildDevices\(pool, parent, false\)/);
  const logs = readFileSync("server/index.ts", "utf8");
  assert.ok(logs.includes("!path.startsWith('/api/high-school/child-device/')"));
});

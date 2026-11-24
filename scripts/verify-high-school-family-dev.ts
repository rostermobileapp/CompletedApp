/** Owned synthetic existing-adult acceptance. Actual isolated DEV Auth/SQL/app;
 * the email transport alone is captured privately. Never enables real delivery. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import express from "express";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { WebSocket } from "ws";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";
import { HighSchoolParentSecurity, parentDigest } from "../server/highSchoolParentSecurity";
import { parentActorFromVerifiedToken, registerParentVerificationRoutes } from "../server/highSchoolParentHttp";

const out = "generated-artifacts/high-school-family";
const app = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const marker = `family-${randomBytes(7).toString("hex")}`;
const ids = Object.fromEntries(["adultLeague", "season", "adultTeam", "opponent", "game", "stat", "hsLeague", "program", "varsity", "jv"].map(k => [k, randomUUID()]));
const accounts: string[] = [], sessions: Record<string, any> = {};
const checks: string[] = [], errors: string[] = [];
const report = { scope: "Owned synthetic existing adults; actual isolated DEV Auth, app HTTP and phone/desktop browser; captured verification email only",
  realFamilies: false, productionChanged: false, realEmailSent: false, childActivationEnabled: false, checks, errors, cleanup: false };
let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"] | undefined;
let browser: Browser | undefined, mailServer: ReturnType<express.Express["listen"]> | undefined;
let base = "", admin = "", anon = "", stage = "preflight", capturedCode = "", proof = "";
const check = (name: string) => checks.push(name);
async function auth(path: string, method: string, body?: unknown, token?: string) {
  const key = path.startsWith("admin/") ? admin : anon;
  const response = await fetch(`${base}/auth/v1/${path}`, { method, signal: AbortSignal.timeout(30_000), redirect: "error",
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); return { status: response.status, body: value };
}
async function api(path: string, method = "GET", body?: unknown, grant = proof, who = "parent") {
  const response = await fetch(`${app}${path}`, { method, signal: AbortSignal.timeout(35_000),
    headers: { Authorization: `Bearer ${sessions[who].access_token}`, "Content-Type": "application/json",
      ...(grant ? { "x-parent-verification": grant } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function socketAuth(grant: string, who = "parent") {
  const ws = new WebSocket(app.replace(/^http/, "ws") + "/ws");
  return await new Promise<{ ws: WebSocket; accepted: boolean }>((resolve, reject) => {
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("socket_auth_timeout")); }, 20_000);
    ws.on("error", () => { clearTimeout(timer); reject(new Error("socket_connection_failed")); });
    ws.on("open", () => ws.send(JSON.stringify({ type: "authenticate", accessToken: sessions[who].access_token, parentGrant: grant })));
    ws.on("message", data => {
      const message = JSON.parse(data.toString());
      if (["authenticated", "authentication_error"].includes(message.type)) {
        clearTimeout(timer); resolve({ ws, accepted: message.type === "authenticated" });
      }
    });
    ws.on("close", () => { clearTimeout(timer); resolve({ ws, accepted: false }); });
  });
}
async function contextFor(who: string, width: number, teamId = ids.adultTeam): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(({ key, session, team }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem("dashboardSelectedType", "team"); localStorage.setItem("dashboardSelectedId", team);
  }, { key: `sb-${new URL(base).hostname.split(".")[0]}-auth-token`, session: sessions[who], team: teamId });
  return context;
}
async function unlock(page: Page) {
  // Advance only the already-used synthetic challenge's resend age to avoid a
  // one-minute test sleep. Do not change the server clock or any real account.
  await pool!.query("UPDATE hs_parent_security.challenges SET created_at=now()-interval '2 minutes' WHERE auth_id=$1", [accounts[0]]);
  capturedCode = "";
  await page.getByRole("button", { name: "Email a verification code", exact: true }).click();
  await page.getByLabel("Four-digit email code", { exact: true }).waitFor();
  assert.match(capturedCode, /^\d{4}$/);
  await page.getByLabel("Four-digit email code", { exact: true }).fill(capturedCode);
  await page.getByRole("button", { name: "Verify email code", exact: true }).click();
  await page.getByRole("heading", { name: /your family|family setup/i }).first().waitFor({ timeout: 45_000 });
  proof = await page.evaluate(async () => {
    const module = await import("/src/lib/queryClient.ts");
    return (await module.getAuthHeaders())["x-parent-verification"] ?? "";
  });
  assert.match(proof, /^[A-Za-z0-9_-]{43}$/);
}
try {
  await mkdir(out, { recursive: true });
  const connection = await parentDevelopmentConnection(); pool = connection.pool;
  base = connection.origin; admin = connection.env.DEV_SUPABASE_SERVICE_ROLE_KEY!; anon = connection.env.DEV_SUPABASE_ANON_KEY!;
  assert.ok((await pool.query("SELECT to_regclass('hs_onboarding.family_version') AS installed")).rows[0].installed);
  const password = `FamilyFixture1!${randomBytes(20).toString("hex")}`;
  stage = "owned-auth-and-existing-adult-data";
  for (const who of ["parent", "head", "assistant"]) {
    const email = `${marker}-${who}@example.com`;
    const created = await auth("admin/users", "POST", { email, password, email_confirm: true,
      app_metadata: { synthetic_high_school_onboarding_dev: true, synthetic_high_school_onboarding_cleanup: marker },
      user_metadata: { first_name: who === "parent" ? "Adult" : "Coach", last_name: "Fixture" } });
    assert.equal(created.status, 200, "owned_account_creation_failed");
    accounts.push(created.body.id);
    const signed = await auth("token?grant_type=password", "POST", { email, password });
    assert.equal(signed.status, 200); sessions[who] = signed.body;
    await pool.query(`INSERT INTO public.users(id,email,first_name,last_name,onboarding_completed,date_of_birth)
      VALUES($1,$2,$3,'Fixture',true,'1990-01-01')`, [created.body.id, email, who === "parent" ? "Adult" : "Coach"]);
    await pool.query(`INSERT INTO hs_onboarding.flows(auth_id,path,block_legacy,revision,draft,status)
      VALUES($1,$2,$3,7,$4,$5)`, [created.body.id, who === "parent" ? "player" : "staff", who !== "parent",
      { originalJourney: "must remain unchanged" }, who === "parent" ? "draft" : "coverage_pending"]);
    await pool.query("INSERT INTO hs_onboarding.contexts(auth_id,hockey_type,journey) VALUES($1,$2,$3)", [created.body.id,
      who === "parent" ? "adult" : "high_school_youth", { originalJourney: who }]);
  }
  await pool.query(`INSERT INTO public.leagues(id,name,unique_league_id,sport,commissioner_id)
    VALUES($1,'Synthetic adult family acceptance',$2,'hockey',$3)`, [ids.adultLeague, `L${Math.floor(10000 + Math.random() * 89999)}`, accounts[1]]);
  await pool.query("INSERT INTO public.seasons(id,name,league_id,is_active) VALUES($1,'Synthetic existing season',$2,true)", [ids.season, ids.adultLeague]);
  for (const team of ["adultTeam", "opponent"]) await pool.query(`INSERT INTO public.teams(id,name,league_id,season_id)
    VALUES($1,$2,$3,$4)`, [ids[team], team === "adultTeam" ? "Adult Hockey Fixtures" : "Synthetic Opponent", ids.adultLeague, ids.season]);
  // Both canonical membership sources start consistent: the ordinary jersey
  // API updates each, and the test restores that legitimate write afterward.
  await pool.query(`INSERT INTO public.league_memberships(id,user_id,league_id,status,assigned_team_id,jersey_number)
    VALUES($1,$2,$3,'approved',$4,17)`, [randomUUID(), accounts[0], ids.adultLeague, ids.adultTeam]);
  await pool.query(`INSERT INTO public.team_memberships(id,user_id,team_id,status,role,jersey_number)
    VALUES($1,$2,$3,'approved','player',17)`, [randomUUID(), accounts[0], ids.adultTeam]);
  await pool.query(`INSERT INTO public.games(id,league_id,season_id,home_team_id,away_team_id,scheduled_at,home_score,away_score,is_completed)
    VALUES($1,$2,$3,$4,$5,now()-interval '7 days',3,1,true)`, [ids.game, ids.adultLeague, ids.season, ids.adultTeam, ids.opponent]);
  await pool.query(`INSERT INTO public.player_stats(id,user_id,league_id,season_id,games_played,goals,assists)
    VALUES($1,$2,$3,$4,2,3,4)`, [ids.stat, accounts[0], ids.adultLeague, ids.season]);
  await pool.query("INSERT INTO hs_onboarding.leagues VALUES($1,'Synthetic HS family acceptance')", [ids.hsLeague]);
  await pool.query(`INSERT INTO hs_onboarding.programs(id,league_id,name,town,status,requested_by)
    VALUES($1,$2,'Family Acceptance School','Synthetic DEV','approved',$3)`, [ids.program, ids.hsLeague, accounts[1]]);
  for (const team of ["varsity", "jv"]) {
    await pool.query(`INSERT INTO hs_onboarding.teams(id,program_id,name,code_digest) VALUES($1,$2,$3,$4)`,
      [ids[team], ids.program, team === "varsity" ? "Family Varsity" : "Family JV", parentDigest(team === "varsity" ? marker.toUpperCase() : `${marker}-JV`)]);
    await pool.query("INSERT INTO public.teams(id,name,program_type,program_id) VALUES($1,$2,'high_school',$3)",
      [ids[team], team === "varsity" ? "Family Varsity" : "Family JV", ids.program]);
  }
  for (const [index, role] of [[1, "head_coach"], [2, "assistant_coach"]] as const) {
    await pool.query(`INSERT INTO public.team_memberships(id,user_id,team_id,status,role)
      VALUES($1,$2,$3,'approved',$4)`, [randomUUID(), accounts[index], ids.varsity, role]);
    await pool.query(`INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,team_id,role,status)
      VALUES($1,$2,$3,$4,$5,'approved')`, [randomUUID(), accounts[index], ids.program, ids.varsity, role]);
  }
  const createInvitation = async (firstName: string) => {
    const stagedId = randomUUID(), token = randomBytes(32).toString("base64url");
    await pool!.query(`INSERT INTO hs_onboarding.staged_players(id,team_id,source_key,first_name,last_name,grad_year,position,jersey_number)
      VALUES($1,$2,$3,$4,'Synthetic',2030,'F','8')`, [stagedId, ids.varsity, `${marker}-${firstName}`, firstName]);
    await pool!.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staged_ids,created_by)
      VALUES($1,$2,'parent',$3,$4::uuid[],$5)`, [parentDigest(token), ids.varsity, `${marker}-parent@example.com`, [stagedId], accounts[1]]);
    return token;
  };
  const snapshot = async () => ({
    user: (await pool!.query("SELECT id,email,role,onboarding_completed FROM public.users WHERE id=$1", [accounts[0]])).rows[0],
    flow: (await pool!.query("SELECT * FROM hs_onboarding.flows WHERE auth_id=$1", [accounts[0]])).rows[0],
    context: (await pool!.query("SELECT * FROM hs_onboarding.contexts WHERE auth_id=$1", [accounts[0]])).rows[0],
    stats: (await pool!.query("SELECT * FROM public.player_stats WHERE id=$1", [ids.stat])).rows[0],
    membership: (await pool!.query("SELECT user_id,team_id,status,role,jersey_number FROM public.team_memberships WHERE user_id=$1 AND team_id=$2", [accounts[0], ids.adultTeam])).rows[0],
    league: (await pool!.query("SELECT * FROM public.league_memberships WHERE user_id=$1 AND league_id=$2", [accounts[0], ids.adultLeague])).rows[0],
  });
  const before = await snapshot();
  assert.equal((await api("/api/user", "GET", undefined, "")).status, 200);
  check("existing_adult_league_team_game_stats_and_free_account_preexisted_family");

  // Real route factory and real session validation, with only a private
  // captured mail transport substituted. There is no code-returning endpoint.
  const sink = new HighSchoolParentSecurity(pool, async mail => { capturedCode = mail.code; });
  const mailApp = express(); mailApp.use(express.json());
  registerParentVerificationRoutes(mailApp, sink, async req => {
    const token = req.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const result = await auth("user", "GET", undefined, token);
    assert.equal(result.status, 200);
    return parentActorFromVerifiedToken(token, result.body.id, `${base}/auth/v1`);
  });
  mailServer = mailApp.listen(0, "127.0.0.1"); await new Promise<void>(resolve => mailServer!.once("listening", resolve));
  const mailOrigin = `http://127.0.0.1:${(mailServer.address() as any).port}`;
  browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const parentContext = await contextFor("parent", 390);
  // Proxy challenge delivery to the actual captured-mail route. Verification
  // and all other requests still hit the unmodified running app.
  const captureMail = async (context: BrowserContext) => context.route("**/api/high-school/parent-verification/challenge", async route => {
    const response = await fetch(mailOrigin + "/api/high-school/parent-verification/challenge", {
      method: "POST", headers: { Authorization: route.request().headers()["authorization"], "Content-Type": "application/json" },
      body: route.request().postData() });
    await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
  });
  await captureMail(parentContext);
  const page = await parentContext.newPage();
  const pageErrors: string[] = [], hidden: string[] = [];
  let restrictedSurface = false;
  page.on("pageerror", error => pageErrors.push(error.name));
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (restrictedSurface && /^\/api\/.*(?:trivia|patches|achievements|beer|win-chance|predictions|badges)/i.test(path)) {
      hidden.push(`${stage}:${path}:${new URL(page.url()).pathname}`);
    }
  });
  stage = "actual-phone-profile-and-family-entry";
  await page.goto(`${app}/profile`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("profile-family").waitFor({ timeout: 60_000 });
  await page.getByTestId("profile-family").getByRole("button", { name: "Add a child", exact: true }).click();
  await page.getByRole("button", { name: /start family setup/i }).waitFor({ timeout: 30_000 });
  restrictedSurface = true;
  await page.getByRole("button", { name: /start family setup/i }).click();
  await page.getByRole("heading", { name: "Verify you're the parent" }).waitFor({ timeout: 30_000 });
  await unlock(page);
  check("actual_profile_family_entry_and_captured_email_unlock_phone");
  stage = "draft-save-and-resume";
  await page.getByRole("button", { name: "Add a child", exact: true }).click();
  await page.getByLabel("First name", { exact: true }).fill("Casey");
  await page.getByLabel("Last name", { exact: true }).fill("Synthetic");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Draft saved.", { exact: false }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Verify you're the parent" }).waitFor({ timeout: 30_000 });
  await unlock(page);
  assert.equal(await page.getByLabel("First name", { exact: true }).inputValue(), "Casey");
  check("child_draft_persisted_through_reload_and_required_new_parent_verification");
  const firstInvitation = await createInvitation("Casey");
  await page.getByRole("button", { name: "Invitation", exact: true }).click();
  await page.getByLabel("Bare invitation token", { exact: true }).fill(firstInvitation);
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Match invitation", exact: true }).click();
  await page.getByRole("button", { name: "Discard invitation draft", exact: true }).waitFor();
  await page.getByLabel(/I am this player.s parent or legal guardian/).check();
  await page.getByLabel(/I am the authorized adult guardian/).check();
  await page.getByRole("button", { name: "Save child consent", exact: true }).click();
  await page.getByText("Child privacy choices saved.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Request team access", exact: true }).click();
  await page.getByText("Waiting for team approval", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New child draft", exact: true }).waitFor();
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children WHERE parent_auth_id=$1", [accounts[0]])).rows[0].n, 0);
  await page.screenshot({ path: `${out}/family-phone-pending.jpg`, fullPage: true });
  check("invitation_consent_pending_request_and_second_child_entry_no_child_created_yet");
  stage = "verified-adult-reads-writes-and-socket";
  assert.equal((await api("/api/user")).status, 200);
  assert.equal((await api(`/api/user/teams/${ids.adultTeam}/jersey-number`, "PATCH", { jerseyNumber: 18 })).status, 200);
  assert.equal((await api(`/api/user/teams/${ids.adultTeam}/jersey-number`, "PATCH", { jerseyNumber: 17 })).status, 200);
  const socket = await socketAuth(proof); assert.equal(socket.accepted, true); socket.ws.close();
  const fresh = await auth("token?grant_type=password", "POST", { email: `${marker}-parent@example.com`, password });
  assert.equal(fresh.status, 200); sessions.fresh = fresh.body;
  assert.equal((await api("/api/user", "GET", undefined, "", "fresh")).status, 403);
  assert.equal((await api("/api/user", "GET", undefined, proof, "fresh")).status, 403);
  const deniedSocket = await socketAuth(proof, "fresh"); assert.equal(deniedSocket.accepted, false); deniedSocket.ws.close();
  const guardedPassword = await auth("user", "PUT", { password: `DeniedFixture1!${randomBytes(20).toString("hex")}` }, fresh.body.access_token);
  assert.ok(guardedPassword.status >= 400);
  assert.equal((await auth("token?grant_type=password", "POST", { email: `${marker}-parent@example.com`, password })).status, 200);
  check("verified_adult_http_writes_and_live_auth_preserved_shared_password_and_wrong_session_denied");
  stage = "actual-head-coach-roster-approval";
  const headContext = await contextFor("head", 390, ids.varsity);
  const headPage = await headContext.newPage();
  await headPage.goto(`${app}/high-school/roster`, { waitUntil: "domcontentloaded" });
  const requestCard = headPage.locator(".family-staff-card").filter({ hasText: "Casey Synthetic" });
  await requestCard.waitFor({ timeout: 45_000 });
  await requestCard.getByRole("button", { name: "Approve", exact: true }).click();
  await requestCard.waitFor({ state: "detached", timeout: 20_000 });
  await headPage.reload(); await headPage.getByText("Casey Synthetic", { exact: true }).first().waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Refresh family setup status", exact: true }).click();
  await page.getByText("Approved", { exact: true }).waitFor();
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children WHERE parent_auth_id=$1 AND enabled", [accounts[0]])).rows[0].n, 0);
  await page.getByText("Approved", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/family-phone-approved.jpg`, fullPage: true });
  check("signed_in_head_coach_approval_persisted_canonical_parent_and_child_device_disabled");
  stage = "actual-adult-parent-switching";
  await page.getByRole("button", { name: "View team", exact: true }).click();
  await page.getByTestId("skin-role-label").waitFor({ timeout: 30_000 });
  assert.match(await page.getByTestId("skin-role-label").innerText(), /Parent/, "parent_skin_not_selected");
  await page.getByTestId("skin-tab-family").click();
  await page.getByText("Approved", { exact: true }).waitFor({ timeout: 25_000 });
  assert.equal(hidden.length, 0, `excluded_adult_requests: ${hidden.join(",")}`);
  restrictedSurface = false;
  await page.getByRole("button", { name: "Back to my account", exact: true }).first().click();
  await page.getByTestId("profile-family").waitFor({ timeout: 45_000 });
  const after = await snapshot();
  assert.deepEqual(Object.keys(before).filter(key => !isDeepStrictEqual((before as any)[key], (after as any)[key])), [], "adult_record_groups_changed");
  check("real_adult_parent_family_switches_preserved_playing_data_and_no_hidden_adult_requests_in_hs");
  stage = "desktop-resume-and-authority-loss";
  const desktop = await contextFor("parent", 1365);
  await captureMail(desktop);
  const desktopPage = await desktop.newPage();
  const desktopHidden: string[] = [];
  desktopPage.on("pageerror", error => pageErrors.push(error.name));
  desktopPage.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/.*(?:trivia|patches|achievements|beer|win-chance|predictions|badges)/i.test(path)) desktopHidden.push(path);
  });
  await desktopPage.goto(`${app}/high-school/family`, { waitUntil: "domcontentloaded" });
  await desktopPage.getByRole("heading", { name: "Verify you're the parent" }).waitFor({ timeout: 35_000 });
  await unlock(desktopPage);
  await desktopPage.getByText("Approved", { exact: true }).waitFor();
  assert.equal(await desktopPage.locator("body").evaluate(el => el.scrollWidth > window.innerWidth + 2), false);
  await desktopPage.screenshot({ path: `${out}/family-desktop-approved.jpg`, fullPage: true });
  check("actual_desktop_family_resume_and_layout");
  stage = "invitation-second-child-and-revoked-draft-recovery";
  await desktopPage.getByRole("button", { name: "New child draft", exact: true }).click();
  await desktopPage.getByRole("button", { name: "Add a child", exact: true }).waitFor();
  const revokedInvitation = await createInvitation("Jordan");
  await desktopPage.getByRole("button", { name: "Invitation", exact: true }).click();
  await desktopPage.getByLabel("Bare invitation token", { exact: true }).fill(revokedInvitation);
  await desktopPage.getByRole("button", { name: "Match invitation", exact: true }).click();
  await desktopPage.getByRole("button", { name: "Discard invitation draft", exact: true }).waitFor();
  await pool.query("UPDATE public.team_memberships SET status='pending' WHERE user_id=$1 AND team_id=$2 AND role='head_coach'", [accounts[1], ids.varsity]);
  await desktopPage.getByLabel(/I am this player.s parent or legal guardian/).check();
  await desktopPage.getByLabel(/I am the authorized adult guardian/).check();
  await desktopPage.getByRole("button", { name: "Save child consent", exact: true }).click();
  await desktopPage.getByText(/That invitation token is not valid/).waitFor();
  desktopPage.once("dialog", dialog => void dialog.accept());
  await desktopPage.getByRole("button", { name: "Discard invitation draft", exact: true }).click();
  await desktopPage.getByText(/Unsubmitted drafts discarded/).waitFor();
  assert.equal(await desktopPage.getByLabel("Bare invitation token", { exact: true }).count(), 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.staged_players WHERE team_id=$1 AND first_name='Jordan'", [ids.varsity])).rows[0].n, 1);
  await pool.query("UPDATE public.team_memberships SET status='approved' WHERE user_id=$1 AND team_id=$2 AND role='head_coach'", [accounts[1], ids.varsity]);
  await desktopPage.getByRole("button", { name: "Add a child", exact: true }).click();
  await desktopPage.getByLabel("First name", { exact: true }).fill("Taylor");
  await desktopPage.getByLabel("Last name", { exact: true }).fill("Synthetic");
  await desktopPage.getByRole("button", { name: "Save draft", exact: true }).click();
  await desktopPage.getByText("Draft saved.", { exact: false }).waitFor();
  await desktopPage.getByLabel(/I am this player.s parent or legal guardian/).check();
  await desktopPage.getByLabel(/I am the authorized adult guardian/).check();
  await desktopPage.getByRole("button", { name: "Save child consent", exact: true }).click();
  await desktopPage.getByText("Child privacy choices saved.", { exact: false }).waitFor();
  await desktopPage.getByLabel("Team code", { exact: true }).fill(marker.toUpperCase());
  await desktopPage.getByRole("button", { name: "Request team access", exact: true }).click();
  await desktopPage.getByText("Waiting for team approval", { exact: true }).waitFor();
  assert.equal((await api("/api/high-school/family/state")).body.requests.length, 2);
  assert.equal(await desktopPage.getByRole("button", { name: "New child draft", exact: true }).count(), 0);
  assert.deepEqual(desktopHidden, []);
  check("submitted_invitation_second_child_revoked_draft_discard_then_team_code_preserved_first_request");
  await pool.query("UPDATE hs_parent_security.grants SET expires_at=now()-interval '1 second' WHERE token_digest=$1", [parentDigest(proof)]);
  await desktopPage.getByRole("button", { name: "Refresh family setup status", exact: true }).click();
  await desktopPage.getByRole("heading", { name: "Verify you're the parent" }).waitFor({ timeout: 30_000 });
  assert.equal(await desktopPage.getByText("Casey Synthetic", { exact: true }).count(), 0);
  assert.equal(await desktopPage.getByText("Taylor Synthetic", { exact: true }).count(), 0);
  assert.equal((await api("/api/user")).status, 403);
  check("expired_parent_authority_cleared_child_names_and_never_fell_back_to_adult_access");
  assert.deepEqual(pageErrors, []);
  await headContext.close(); await desktop.close(); await parentContext.close();
  report.cleanup = false;
} catch (error) {
  // No provider error bodies, credentials, tokens, personal data or URLs.
  errors.push(`${stage}: ${error instanceof Error ? error.name : "failed"}`);
  if (error instanceof Error && /^(excluded_adult_requests|adult_record_groups_changed|parent_skin_not_selected)/.test(error.message))
    errors.push(error.message.slice(0, 2000));
  if (error instanceof Error && /^(locator|page|browser|expect|socket|owned)_|Timeout|timed out/.test(error.message))
    errors.push(error.message.replace(/https?:\/\/[^\s]+/g, "[address]").slice(0, 350));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (mailServer) await new Promise<void>(resolve => mailServer!.close(() => resolve()));
  if (pool) {
    try {
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("DELETE FROM hs_onboarding.child_messages WHERE chat_id IN(SELECT id FROM hs_onboarding.child_chats WHERE team_id=ANY($1::uuid[]))", [[ids.varsity, ids.jv]]);
        await db.query("DELETE FROM hs_onboarding.child_chat_members WHERE child_id IN(SELECT id FROM hs_onboarding.children WHERE parent_auth_id=ANY($1::uuid[]))", [accounts]);
        await db.query("DELETE FROM hs_onboarding.child_chats WHERE team_id=ANY($1::uuid[]) OR parent_auth_id=ANY($2::uuid[])", [[ids.varsity, ids.jv], accounts]);
        await db.query("DELETE FROM hs_onboarding.staff_audit WHERE program_id=$1", [ids.program]);
        await db.query("DELETE FROM hs_onboarding.staff_requests WHERE auth_id=ANY($1::uuid[])", [accounts]);
        await db.query("DELETE FROM hs_onboarding.team_settings WHERE team_id=ANY($1::uuid[])", [[ids.varsity, ids.jv]]);
        await db.query("DELETE FROM public.team_memberships WHERE user_id=ANY($1::varchar[]) OR team_id=ANY($2::varchar[])", [accounts, [ids.varsity, ids.jv, ids.adultTeam, ids.opponent]]);
        await db.query("DELETE FROM hs_onboarding.children WHERE parent_auth_id=ANY($1::uuid[])", [accounts]);
        await db.query("DELETE FROM hs_onboarding.player_requests WHERE auth_id=ANY($1::uuid[])", [accounts]);
        await db.query("DELETE FROM hs_onboarding.invitations WHERE team_id=ANY($1::uuid[])", [[ids.varsity, ids.jv]]);
        await db.query("DELETE FROM hs_onboarding.staged_players WHERE team_id=ANY($1::uuid[])", [[ids.varsity, ids.jv]]);
        await db.query("DELETE FROM hs_onboarding.family_flows WHERE auth_id=ANY($1::uuid[])", [accounts]);
        for (const table of ["grants", "challenges", "audit"]) await db.query(`DELETE FROM hs_parent_security.${table} WHERE auth_id=ANY($1::uuid[])`, [accounts]);
        await db.query("DELETE FROM hs_parent_security.accounts WHERE auth_id=ANY($1::uuid[])", [accounts]);
        await db.query("DELETE FROM hs_onboarding.contexts WHERE auth_id=ANY($1::uuid[])", [accounts]);
        await db.query("DELETE FROM hs_onboarding.flows WHERE auth_id=ANY($1::uuid[])", [accounts]);
        await db.query("DELETE FROM public.player_stats WHERE id=$1", [ids.stat]);
        await db.query("DELETE FROM public.games WHERE id=$1", [ids.game]);
        await db.query("DELETE FROM public.league_memberships WHERE user_id=ANY($1::varchar[])", [accounts]);
        await db.query("DELETE FROM public.teams WHERE id=ANY($1::varchar[])", [[ids.varsity, ids.jv, ids.adultTeam, ids.opponent]]);
        await db.query("DELETE FROM public.seasons WHERE id=$1", [ids.season]);
        await db.query("DELETE FROM public.leagues WHERE id=$1", [ids.adultLeague]);
        await db.query("DELETE FROM hs_onboarding.teams WHERE id=ANY($1::uuid[])", [[ids.varsity, ids.jv]]);
        await db.query("DELETE FROM hs_onboarding.programs WHERE id=$1", [ids.program]);
        await db.query("DELETE FROM hs_onboarding.leagues WHERE id=$1", [ids.hsLeague]);
        await db.query("DELETE FROM public.users WHERE id=ANY($1::varchar[])", [accounts]);
        await db.query("COMMIT");
      } catch { await db.query("ROLLBACK"); throw new Error("synthetic_cleanup_failed"); }
      finally { db.release(); }
      for (const id of accounts) assert.ok((await auth(`admin/users/${id}`, "DELETE")).status < 300);
      report.cleanup = true;
    } catch { errors.push("owned_synthetic_fixture_cleanup_failed"); process.exitCode = 1; }
    await pool.end();
  }
  await writeFile(`${out}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

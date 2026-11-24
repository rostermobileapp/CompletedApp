/** Actual isolated DEV Auth + HTTP + signed-in browser checks using disposable
 * owned example.com staff fixtures. No children, delivery, charges or production. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser } from "playwright-core";
import { parentDevelopmentConnection } from "./lib/high-school-parent-dev";

const out = "generated-artifacts/high-school-staff";
const report = { scope: "Actual isolated DEV Auth, SQL, HTTP and signed-in browser; synthetic staff only; not native or real-family acceptance",
  checks: [] as string[], errors: [] as string[], childActivationEnabled: false, cleanup: false };
let pool: Awaited<ReturnType<typeof parentDevelopmentConnection>>["pool"] | undefined, browser: Browser | undefined;
let base = "", admin = "", anon = "", stage = "connect";
const accounts: string[] = [], sessions: Record<string, any> = {};
const marker = `staff-${randomBytes(7).toString("hex")}`;
const league = randomUUID(), program = randomUUID(), varsity = randomUUID(), jv = randomUUID();
const pendingRequest = randomUUID();
const appOrigin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const check = (label: string) => { report.checks.push(label); };
async function auth(path: string, method: string, body?: unknown) {
  const key = path.startsWith("admin/") ? admin : anon;
  const response = await fetch(`${base}/auth/v1/${path}`, { method, redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  assert.ok(response.ok, `Synthetic DEV Auth request failed: ${response.status}`); return value;
}
async function api(role: string, path = "", method = "GET", body?: unknown, team = varsity) {
  const response = await fetch(`${appOrigin}/api/high-school/staff/teams/${team}${path}`, {
    method, signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${sessions[role].access_token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
try {
  await mkdir(out, { recursive: true });
  const connection = await parentDevelopmentConnection(); pool = connection.pool;
  base = connection.origin; admin = connection.env.DEV_SUPABASE_SERVICE_ROLE_KEY!; anon = connection.env.DEV_SUPABASE_ANON_KEY!;
  assert.ok((await pool.query("SELECT to_regclass('hs_onboarding.staff_version') AS installed")).rows[0].installed);
  const password = `StaffFixture1!${randomBytes(22).toString("hex")}`;
  stage = "owned-synthetic-accounts";
  for (const role of ["head_coach", "assistant_coach", "team_manager", "athletic_director", "pending"]) {
    const email = `${marker}-${role}@example.com`;
    const user = await auth("admin/users", "POST", { email, password, email_confirm: true,
      app_metadata: { synthetic_high_school_onboarding_dev: true, synthetic_high_school_onboarding_cleanup: marker },
      user_metadata: { first_name: role === "athletic_director" ? "Program" : "Coach", last_name: "Fixture" } });
    accounts.push(user.id);
    sessions[role] = await auth("token?grant_type=password", "POST", { email, password });
    await pool.query(`INSERT INTO public.users(id,email,first_name,last_name,onboarding_completed)
      VALUES($1,$2,$3,'Fixture',true) ON CONFLICT(id) DO NOTHING`, [user.id, email, role === "athletic_director" ? "Program" : "Coach"]);
    await pool.query("INSERT INTO hs_onboarding.flows(auth_id,path,block_legacy,status) VALUES($1,'staff',true,'coverage_pending')", [user.id]);
  }
  await pool.query("INSERT INTO hs_onboarding.leagues VALUES($1,'Staff acceptance fixture')", [league]);
  await pool.query(`INSERT INTO hs_onboarding.programs(id,league_id,name,town,status,requested_by)
    VALUES($1,$2,'Northfield Hockey','Synthetic DEV School','approved',$3)`, [program, league, accounts[3]]);
  for (const [id, name] of [[varsity, "Northfield Varsity"], [jv, "Northfield JV"]]) {
    await pool.query("INSERT INTO hs_onboarding.teams(id,program_id,name,code_digest) VALUES($1,$2,$3,$4)", [id, program, name, randomBytes(32).toString("hex")]);
    await pool.query("INSERT INTO public.teams(id,name,program_type,program_id) VALUES($1,$2,'high_school',$3)", [id, name, program]);
  }
  for (const [index, role] of Array.from(["head_coach", "assistant_coach", "team_manager", "athletic_director", "pending"].entries())) {
    const authId = accounts[index];
    await pool.query(`INSERT INTO public.team_memberships(id,user_id,team_id,role,status,is_captain)
      VALUES($1,$2,$3,$4,$5,false)`, [randomUUID(), authId, varsity, role === "pending" ? "head_coach" : role, role === "pending" ? "pending" : "approved"]);
    if (role === "athletic_director") await pool.query(`INSERT INTO public.team_memberships(id,user_id,team_id,role,status,is_captain)
      VALUES($1,$2,$3,$4,'approved',false)`, [randomUUID(), authId, jv, role]);
  }
  await pool.query(`INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,team_id,role,status)
    VALUES($1,$2,$3,$4,'assistant_coach','pending')`, [pendingRequest, accounts[4], program, varsity]);
  stage = "authenticated-http";
  for (const role of ["head_coach", "assistant_coach", "team_manager", "athletic_director"]) {
    const result = await api(role); assert.equal(result.status, 200, `Staff HTTP ${role}: ${result.body.code}`);
    assert.equal(result.body.role, role); check(`real_auth_${role}_canonical_workspace`);
  }
  assert.equal((await api("pending")).status, 403); check("real_auth_pending_membership_denied");
  assert.equal((await api("head_coach", "", "GET", undefined, jv)).status, 403); check("real_auth_foreign_team_denied");
  assert.equal((await api("athletic_director", "", "GET", undefined, jv)).status, 200); check("real_auth_ad_program_access");
  const event = await api("head_coach", "/events", "POST", { title: "Varsity practice", opponent: "",
    startsAt: new Date(Date.now() + 86400000).toISOString(), rink: "Northfield Ice Arena", address: "100 Example Way" });
  assert.equal(event.status, 200); check("real_http_schedule_persisted");
  stage = "signed-in-browser";
  browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const role of ["head_coach", "assistant_coach", "team_manager", "athletic_director"]) {
    for (const width of [390, 1365]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const storageKey = `sb-${new URL(base).hostname.split(".")[0]}-auth-token`;
    await context.addInitScript(({ key, session, teamId }) => {
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem("dashboardSelectedType", "team"); localStorage.setItem("dashboardSelectedId", teamId);
    }, { key: storageKey, session: sessions[role], teamId: varsity });
    const page = await context.newPage();
    const hiddenRequests: string[] = [], pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.name));
    page.on("request", request => { const path = new URL(request.url()).pathname;
      if (/^\/api\/.*(?:trivia|patches|achievements|beer|win-chance|predictions)/i.test(path)) hiddenRequests.push(path); });
    await page.goto(appOrigin + "/high-school/home", { waitUntil: "domcontentloaded" });
    await page.getByTestId("skin-role-label").waitFor({ timeout: 45_000 });
    await page.getByText("Varsity practice", { exact: true }).first().waitFor({ timeout: 30_000 });
    for (const tab of ["schedule", "roster", "chat", "more", "home"]) {
      await page.getByTestId(`skin-tab-${tab}`).click();
      await page.locator(".tss-staff").waitFor();
      await page.locator(".staff-skeleton").first().waitFor({ state: "hidden", timeout: 20_000 });
      assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > window.innerWidth + 2), false, `${role}/${tab} horizontal overflow`);
      check(`signed_in_${role}_${width}_${tab}`);
      if (tab === "more") {
        assert.equal(await page.getByRole("heading", { name: "Staff approvals", exact: true }).count(),
          ["head_coach", "athletic_director"].includes(role) ? 1 : 0);
        check(`${role}_${width}_approval_panel_matches_management_capability`);
      }
    }
    if (role === "head_coach" && width === 390) {
      await page.screenshot({ path: `${out}/coach-phone.jpg`, fullPage: true });
      await page.getByTestId("skin-tab-chat").click();
      await page.getByLabel("Message", { exact: true }).fill("See everyone at practice. Synthetic DEV staff check.");
      await page.getByRole("button", { name: /^send/i }).click();
      await page.getByText("See everyone at practice. Synthetic DEV staff check.", { exact: true }).waitFor();
      await page.reload(); await page.getByText("See everyone at practice. Synthetic DEV staff check.", { exact: true }).waitFor();
      check("real_browser_chat_survived_reload");
      await page.screenshot({ path: `${out}/staff-chat-phone.jpg`, fullPage: true });
      stage = "browser-roster-import";
      await page.getByTestId("skin-tab-roster").click();
      await page.getByRole("button", { name: "Import roster", exact: true }).first().click();
      await page.getByLabel("Paste roster CSV", { exact: true }).fill("firstName,lastName,gradYear,position,jerseyNumber\nStaged,Fixture,2028,D,8");
      await page.getByRole("button", { name: /preview/i }).click();
      await page.getByRole("button", { name: /commit/i }).click();
      await page.getByText("Staged Fixture", { exact: true }).waitFor();
      check("real_browser_roster_preview_and_staging");
      stage = "browser-head-coach-approval";
      await page.getByTestId("skin-tab-more").click();
      const approvalsPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Staff approvals", exact: true }) });
      await approvalsPanel.getByRole("button", { name: "Approve", exact: true }).click();
      await page.getByText("Staff approval recorded.", { exact: true }).waitFor();
      assert.equal((await api("pending")).status, 200);
      check("real_browser_head_coach_approved_same_team_assistant");
      await page.reload();
      await page.getByRole("heading", { name: "Staff approvals", exact: true }).waitFor({ timeout: 30_000 });
      await page.getByText("No pending staff approvals.", { exact: true }).waitFor();
      const approved = (await pool.query(`SELECT r.status,m.role,m.status AS membership_status
        FROM hs_onboarding.staff_requests r JOIN public.team_memberships m ON m.user_id=r.auth_id::text
        AND m.team_id=r.team_id::text WHERE r.id=$1`, [pendingRequest])).rows[0];
      assert.deepEqual(approved, { status: "approved", role: "assistant_coach", membership_status: "approved" });
      check("real_browser_head_coach_approval_survived_reload_with_canonical_access");
      await page.screenshot({ path: `${out}/coach-approvals-phone.jpg`, fullPage: true });
    }
    stage = "signed-in-browser";
    if (role === "athletic_director") {
      await page.getByLabel("Choose active team").selectOption(jv);
      await page.getByRole("heading", { name: "Northfield JV", exact: true }).waitFor();
      await page.locator(".staff-skeleton").first().waitFor({ state: "hidden", timeout: 30_000 });
      await page.locator(".tss-staff h2").waitFor();
      check(`real_browser_ad_${width}_team_switch_and_loaded_workspace`);
      await page.screenshot({ path: `${out}/ad-${width === 1365 ? "desktop" : "phone"}.jpg`, fullPage: true });
    }
    assert.deepEqual(pageErrors, []); assert.deepEqual(hiddenRequests, []); check(`${role}_${width}_no_hidden_adult_requests_or_browser_crashes`);
    await context.close();
    }
  }
} catch (error) {
  report.errors.push(`${stage}_failed`);
  report.errors.push(String((error as Error)?.message ?? "unknown")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[URL]").replace(/[A-Za-z0-9_-]{100,}/g, "[redacted]").slice(0, 600));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (pool) {
    try {
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const teams = (await db.query("SELECT id FROM hs_onboarding.teams WHERE program_id=$1", [program])).rows.map(r => r.id);
        await db.query("DELETE FROM hs_onboarding.staff_audit WHERE program_id=$1", [program]);
        await db.query("DELETE FROM hs_onboarding.staff_requests WHERE program_id=$1", [program]);
        if (teams.length) {
          await db.query(`DELETE FROM hs_onboarding.message_reports WHERE message_id IN(
            SELECT m.id FROM hs_onboarding.child_messages m JOIN hs_onboarding.child_chats c ON c.id=m.chat_id WHERE c.team_id=ANY($1::uuid[]))`, [teams]);
          await db.query("DELETE FROM hs_onboarding.child_messages WHERE chat_id IN(SELECT id FROM hs_onboarding.child_chats WHERE team_id=ANY($1::uuid[]))", [teams]);
          await db.query("DELETE FROM hs_onboarding.child_chats WHERE team_id=ANY($1::uuid[])", [teams]);
          await db.query("DELETE FROM hs_onboarding.staff_dispatch WHERE team_id=ANY($1::uuid[])", [teams]);
          await db.query("DELETE FROM hs_onboarding.staff_lineup WHERE event_id IN(SELECT id FROM hs_onboarding.staff_events WHERE team_id=ANY($1::uuid[]))", [teams]);
          await db.query("DELETE FROM hs_onboarding.staff_events WHERE team_id=ANY($1::uuid[])", [teams]);
          await db.query("DELETE FROM hs_onboarding.staged_players WHERE team_id=ANY($1::uuid[])", [teams]);
          await db.query("DELETE FROM hs_onboarding.team_settings WHERE team_id=ANY($1::uuid[])", [teams]);
          await db.query("DELETE FROM public.team_memberships WHERE team_id=ANY($1::varchar[])", [teams]);
          await db.query("DELETE FROM public.teams WHERE id=ANY($1::varchar[])", [teams]);
          await db.query("DELETE FROM hs_onboarding.teams WHERE id=ANY($1::uuid[])", [teams]);
        }
        await db.query("DELETE FROM hs_onboarding.programs WHERE id=$1", [program]);
        await db.query("DELETE FROM hs_onboarding.leagues WHERE id=$1", [league]);
        await db.query("DELETE FROM hs_onboarding.flows WHERE auth_id=ANY($1::uuid[])", [accounts]);
        await db.query("DELETE FROM public.users WHERE id=ANY($1::varchar[])", [accounts]);
        await db.query("COMMIT"); report.cleanup = true;
      } catch { await db.query("ROLLBACK"); throw new Error("cleanup_failed"); }
      finally { db.release(); }
      for (const id of accounts) await auth(`admin/users/${id}`, "DELETE");
    } catch { report.errors.push("synthetic_fixture_cleanup_failed"); process.exitCode = 1; }
    await pool.end();
  }
  await writeFile(`${out}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

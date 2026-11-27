/**
 * Actual App.Router + React Query + request/parent-session plumbing.
 * Auth events and HTTP responses are synthetic, loopback-only fixtures.
 * Unrelated pages/layouts are markers: this is NOT provider-SDK/native acceptance.
 * No environment credentials, database connections, or real email transport.
 */
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";
import { chromium, type Page } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const production=process.argv.includes("--production-age");
const output = path.resolve(`generated-artifacts/high-school-onboarding-router${production?"-production-age":""}`);
const appPath = path.resolve("client/src/App.tsx");
const source = await readFile(appPath, "utf8");
assert.ok(!source.includes('legacy-onboarding-preview'),"The retired preview route must not be restored.");
assert.ok(!source.includes('@/pages/HighSchoolOnboarding"'),"The retired combined UI must not be imported.");
const realPages = new Set(["HighSchoolYouthOnboarding", "HighSchoolYouthOnboardingPreview", "Under18Onboarding", "ParentVerification"]);
const imports = new Map<string, { names: string[]; defaultName?: string }>();
for (const match of source.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\}\s*)?from\s*["']([^"']+)["']/g)) {
  imports.set(match[3], { defaultName: match[1], names: (match[2] || "").split(",").map(s => s.trim()).filter(Boolean) });
}
const provider = `
import {useSyncExternalStore} from 'react';
const listeners=new Set(),authListeners=new Set();
const actor={id:'router-synthetic-adult',email:'router@example.com'};
let snapshot={user:window.__fixtureAccessToken?actor:null,isAuthenticated:!!window.__fixtureAccessToken,isLoading:false};
export function useFixtureAuth(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>snapshot);}
window.__setFixtureSession=token=>{
  window.__fixtureAccessToken=token;
  const session=token?{access_token:token,user:actor}:null;
  snapshot={user:token?actor:null,isAuthenticated:!!token,isLoading:false};
  authListeners.forEach(fn=>fn(token?'SIGNED_IN':'SIGNED_OUT',session));
  listeners.forEach(fn=>fn());
};
export const supabase={auth:{
  getSession:async()=>({data:{session:window.__fixtureAccessToken?{access_token:window.__fixtureAccessToken,user:actor}:null},error:null}),
  onAuthStateChange:fn=>{authListeners.add(fn);return{data:{subscription:{unsubscribe:()=>authListeners.delete(fn)}}}},
  signOut:async()=>{window.__setFixtureSession(null);return{error:null}}
}};
export async function clearStaleSession(){window.__setFixtureSession(null);}
`;
const bundle = await build({
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", loader: { ".png": "dataurl", ".css": "empty" },
  define: { "process.env.NODE_ENV": JSON.stringify(production?"production":"development"),
    "import.meta.env.DEV": String(!production), "import.meta.env.PROD": String(production),
    "import.meta.env.VITE_ISOLATED_DEVELOPMENT": JSON.stringify(!production?"true":"false"), "import.meta.env.VITE_API_BASE_URL": '""' },
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{QueryClientProvider}from'@tanstack/react-query';
    import{Router}from'./client/src/App';
    import{queryClient}from'./client/src/lib/queryClient';
    import{parentVerificationSession as store}from'./client/src/lib/parentVerificationSession';
    if(window.__preloadAdultCache)queryClient.setQueryData(['/api/user'],{id:'router-synthetic-adult',onboardingCompleted:true});
    window.__legacyPageMounts=[];
    new MutationObserver(()=>document.querySelectorAll('[data-router-page]').forEach(n=>{
      const name=n.getAttribute('data-router-page');if(!window.__legacyPageMounts.includes(name))window.__legacyPageMounts.push(name);
    })).observe(document.getElementById('root'),{subtree:true,childList:true});
    window.__routerInspection=()=>({
      parentHeadersPresent:Object.keys(store.headers(window.__fixtureAccessToken)).length>0,
      cacheContainsPlayer:queryClient.getQueryCache().getAll().some(q=>JSON.stringify(q.state.data||{}).includes('RouterFixtureChild')),
      local:localStorage.length,session:sessionStorage.length,prefetch:window.__prefetchEnabled||0,
      legacyPageMounts:window.__legacyPageMounts
    });
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><Router/></QueryClientProvider>);
  ` },
  plugins: [{ name: "router-fixture-boundaries", setup(b) {
    b.onResolve({ filter: /^@assets\// }, () => ({ path: "fixture-image", namespace: "router-fixture" }));
    b.onResolve({ filter: /^fixture-auth$/ }, () => ({ path: "fixture-auth", namespace: "router-fixture" }));
    b.onResolve({ filter: /(?:^@\/lib\/|^\.\/)supabase$/ }, () => ({ path: "supabase", namespace: "router-fixture" }));
    b.onResolve({ filter: /^@\// }, a => {
      if (a.importer !== appPath) return;
      if (a.path === "@/hooks/useAuth" || a.path === "@/hooks/useAppDataPrefetch" || a.path === "@/context/DemoContext") {
        return { path: a.path, namespace: "router-fixture" };
      }
      if (a.path.startsWith("@/pages/") && !realPages.has(a.path.split("/").at(-1)!)) {
        return { path: a.path, namespace: "router-fixture" };
      }
      if (a.path.startsWith("@/components/") || a.path.startsWith("@/context/")) {
        return { path: a.path, namespace: "router-fixture" };
      }
    });
    b.onLoad({ filter: /.*/, namespace: "router-fixture" }, a => {
      let contents: string;
      if (a.path === "fixture-image") contents = `export default 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';`;
      else if (a.path === "fixture-auth") contents = provider;
      else if (a.path === "supabase") contents = `export{supabase,clearStaleSession}from'fixture-auth';
        export async function requireSignupEmailConfirmation(){throw Error('Provider signup is outside this offline router fixture');}`;
      else if (a.path === "@/hooks/useAuth") contents = `export{useFixtureAuth as useAuth}from'fixture-auth';`;
      else if (a.path === "@/hooks/useAppDataPrefetch") contents =
        `export function useAppDataPrefetch(enabled){if(enabled)window.__prefetchEnabled=(window.__prefetchEnabled||0)+1}`;
      else if (a.path === "@/context/DemoContext") contents =
        `export const useDemo=()=>({isActive:false});export function DemoContextProvider({children}){return children}`;
      else {
        const imported = imports.get(a.path)!;
        const page = a.path.startsWith("@/pages/") ? a.path.split("/").at(-1)! : null;
        contents = `import React from'react';const Marker=({children})=>${page
          ? `React.createElement('div',{'data-router-page':${JSON.stringify(page)}},${JSON.stringify(page)})`
          : `children||null`};`;
        if (imported.defaultName) contents += "export default Marker;";
        for (const name of imported.names) contents += `export const ${name}=Marker;`;
      }
      return { contents, loader: "jsx", resolveDir: process.cwd() };
    });
  } }],
});

type Fixture = {
  enrolled: boolean; active: boolean; completed: boolean; path: string | null;
  statusError?: boolean; stateError?: boolean; revoked?: boolean; challengePurpose?: string;
  staffDraft?: boolean; staffInvited?: boolean;
  calls: { method: string; path: string }[]; unexpected: string[];
};
const fixtures = new Map<string, Fixture>();
const staffInvitationOnly = process.argv.includes("--staff-invitation-only");
const fixtureGrant = "g".repeat(43);
// Deliberately unsigned, synthetic session envelopes. Never sent outside loopback.
const session = (id: string) => `fixture.${Buffer.from(JSON.stringify({ sub: "router-synthetic-adult", session_id: id })).toString("base64url")}.not-a-signature`;
const firstSession = session("first"), secondSession = session("second");
const app = express();
app.use(express.json());
app.use("/api", (req, res) => {
  const f = fixtures.get(String(req.headers["x-fixture-case"]));
  if (!f) return res.status(403).json({ code: "FIXTURE_REQUIRED" });
  const requestPath = req.path;
  f.calls.push({ method: req.method, path: requestPath });
  const verified = !f.revoked && req.headers["x-parent-verification"] === fixtureGrant;
  if (req.method === "GET" && requestPath === "/high-school/parent-verification/status") {
    return f.statusError ? res.status(503).json({ code: "FIXTURE_UNAVAILABLE" }) : res.json({ enrolled: f.enrolled, verified });
  }
  if (req.method === "GET" && requestPath === "/high-school/onboarding/state") {
    if (f.stateError) return res.status(503).json({ code: "FIXTURE_UNAVAILABLE" });
    return res.json({
      active: f.active, path: f.path, revision: 0,
      hockeyType: f.path ? ["player","organizer"].includes(f.path) ? "adult" : "high_school_youth" : undefined,
      ...((f.path==="staff"||f.path==="parent"&&verified)?{journey:{profile:{firstName:"Fixture",lastName:"Adult",timezone:"America/New_York"},
        ...(f.staffDraft?{programId:"synthetic-school",teamId:"synthetic-team",staffRole:"assistant_coach"}:{})}}:{}),
      status: f.path === "parent" ? verified ? "draft" : "parent_verification_required" : f.path === "staff" ? f.staffDraft&&!f.staffInvited?"draft":"waiting_approval" : "choose",
      ...(f.staffInvited?{draft:{programId:"synthetic-school",teamId:"synthetic-team",role:"assistant_coach"}}:{}),
      ...(f.path === "parent" && verified ? { draft: { guardianConfirmed: false, players: [{
        id: "00000000-0000-4000-8000-000000000009", firstName: "RouterFixtureChild", lastName: "Example",
        gradYear: 2030, position: "F", jerseyNumber: "", consent: false, photoConsent: false, publicNameConsent: false,
      }] } } : {}),
    });
  }
  if (req.method === "GET" && requestPath.startsWith("/high-school/onboarding/catalog")) return res.json({ programs: [], leagues: [] });
  if (req.method === "GET" && requestPath === "/high-school/onboarding/referral-partners") return res.json([]);
  if (req.method === "POST" && requestPath === "/high-school/onboarding/lookup" && f.staffDraft) {
    if(req.body.invitation!=="SyntheticStaffInvitationForUiTesting12345") return res.status(403).json({code:"INVALID_INVITATION",message:"Invitation is invalid or expired."});
    f.staffInvited=true;return res.json({matched:true});
  }
  if (req.method === "POST" && requestPath === "/high-school/onboarding/journey" && f.staffDraft) return res.json({revision:1});
  if (req.method === "POST" && requestPath === "/high-school/onboarding/hockey-type") return res.json({saved:true,hockeyType:req.body.hockeyType});
  if (req.method === "GET" && requestPath === "/user") return res.json({ id: "router-synthetic-adult", onboardingCompleted: f.completed });
  if (req.method === "POST" && requestPath === "/high-school/onboarding/choose") {
    assert.ok(["player", "organizer"].includes(req.body.path));
    f.path = req.body.path; f.active = false; return res.json({ ok: true });
  }
  if (req.method === "POST" && requestPath === "/high-school/parent-verification/challenge") {
    assert.ok(["parent_action", "password_change"].includes(req.body.purpose));
    f.challengePurpose = req.body.purpose;
    f.revoked = false; return res.json({ challengeId: "00000000-0000-4000-8000-000000000008" });
  }
  if (req.method === "POST" && requestPath === "/high-school/parent-verification/verify") {
    if (req.body.code !== "2468") return res.status(400).json({ code: "INVALID_OR_EXPIRED_CODE" });
    return res.json({ purpose: f.challengePurpose || "parent_action",
      verificationToken: f.challengePurpose === "password_change" ? "p".repeat(43) : fixtureGrant,
      expiresInSeconds: f.challengePurpose === "password_change" ? 120 : 600 });
  }
  if (req.method === "POST" && requestPath === "/high-school/parent-verification/revoke") {
    f.revoked = true; return res.json({ ok: true });
  }
  f.unexpected.push(requestPath); return res.status(503).json({ code: "UNEXPECTED_FIXTURE_REQUEST" });
});
app.get("/fixture.js", (_q, r) => r.type("application/javascript").send(bundle.outputFiles[0].text));
app.use((_q, r) => r.type("html").send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/fixture.js"></script>'));
const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.on("listening", r));
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const report: any = { scope: "Actual App.Router and request/query/session plumbing; fixture Auth/events and loopback HTTP; unrelated pages are markers",
  selection: staffInvitationOnly ? "staff-invitation-only" : "full-router",
  checks: [], realProviderSdkAcceptance: false, realEmailsSent: 0, databaseConnections: 0, externalRequests: 0 };
const mark = (name: string) => {
  if(!staffInvitationOnly || name==="saved_school_selections_require_invitation_and_cannot_submit_uninvited_staff_requests") report.checks.push(name);
};
async function runCase(id: string, options: Partial<Fixture> & { guest?: boolean; cachedAdult?: boolean; width?: number; ageRestricted?: boolean }, visit: string,
  test: (page: Page, fixture: Fixture) => Promise<void>) {
  if(staffInvitationOnly && id!=="staff-invitation-only") return;
  const f: Fixture = { enrolled: false, active: true, completed: false, path: null, ...options, calls: [], unexpected: [] };
  fixtures.set(id, f);
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: 844 } });
  await context.addInitScript(({ token, cachedAdult, ageRestricted }) => {
    (window as any).__fixtureAccessToken = token; (window as any).__preloadAdultCache = cachedAdult;
    if(ageRestricted)sessionStorage.setItem("roster-dev-signup-parent-required","1");
  }, { token: options.guest ? null : firstSession, cachedAdult: !!options.cachedAdult, ageRestricted:!!options.ageRestricted });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  let errors = 0;
  page.on("pageerror", () => errors++);
  await page.route("**/*", r => {
    const url = r.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue();
    if (new URL(url).origin !== origin) { report.externalRequests++; return r.abort(); }
    return r.continue({ headers: { ...r.request().headers(), "x-fixture-case": id } });
  });
  try {
    await page.goto(origin + visit); await test(page, f);
    assert.equal(errors, 0); assert.deepEqual(f.unexpected, []);
  } catch (error) {
    report.failedCase = id;
    report.failureHeadings = await page.locator("h1,h2").allTextContents().catch(() => []);
    throw error;
  } finally { await context.close(); }
}
const noLegacyRequests = (f: Fixture) => assert.equal(f.calls.filter(c => c.path === "/user").length, 0);
const inspection = (page: Page) => page.evaluate(() => (window as any).__routerInspection());
async function verifyParent(page: Page) {
  await page.getByRole("button", { name: "Email a verification code", exact: true }).click();
  await page.getByLabel("Four-digit email code", { exact: true }).fill("2468");
  await page.getByRole("button", { name: "Verify email code", exact: true }).click();
  await page.getByLabel("First name", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("First name", { exact: true }).inputValue(), "RouterFixtureChild");
}
try {
  if(production){
    for(const visit of ["/under-18","/under-18/code?challengeId=fixture","/roster"]){
      await runCase("production-parent-"+visit,{guest:true,ageRestricted:true},visit,async(p,f)=>{
        await p.getByRole("heading",{name:"Players under 18 join through a parent",exact:true}).waitFor();
        assert.equal(await p.locator("input").count(),0);
        assert.equal(await p.getByRole("button",{name:"I have a code from my parent"}).count(),0);
        assert.equal(f.calls.length,0);
      });
    }
    mark("production_under18_and_direct_code_links_offer_parent_guidance_without_any_api_or_auth_calls");
    for(const [visit,pageName] of [["/forgot-password","ForgotPassword"],["/reset-password","ResetPassword"],["/login","Login"]]){
      await runCase("production-recovery-"+pageName,{guest:true,ageRestricted:true},visit,async(p,f)=>{
        await p.locator(`[data-router-page="${pageName}"]`).waitFor();
        assert.equal(f.calls.length,0);
      });
    }
    mark("production_age_answer_preserves_existing_signin_and_password_recovery");
    for(const completed of [false,true]){
      await runCase("production-adult-"+completed,{completed,active:false,ageRestricted:true},"/roster",async(p,f)=>{
        await p.locator(`[data-router-page="${completed?"Roster":"Onboarding"}"]`).waitFor();
        assert.ok(f.calls.some(c=>c.path==="/user"));
        assert.ok(!f.calls.some(c=>c.path.startsWith("/high-school/")));
      });
    }
    mark("production_authenticated_adults_keep_existing_profile_and_roster_without_school_onboarding_queries");
  }else{
  await runCase("preview-home",{guest:true},"/",async(p,f)=>{
    await p.getByRole("heading",{name:"Are you 18 or older?",exact:true}).waitFor();
    assert.equal(await p.getByTestId("input-email").count(),0);
    assert.equal(await p.getByTestId("input-password").count(),0);
    await p.getByRole("button",{name:"No, I'm under 18",exact:true}).click();
    await p.getByRole("button",{name:"Continue",exact:true}).click();
    await p.getByRole("heading",{name:"Players under 18 join through a parent",exact:true}).waitFor();
    await p.getByRole("button",{name:"Back",exact:true}).first().click();
    await p.getByRole("button",{name:"Yes, I'm 18 or older",exact:true}).click();
    await p.getByRole("button",{name:"Continue",exact:true}).click();
    await p.getByTestId("input-email").fill("preview@example.invalid");
    await p.getByTestId("input-password").fill("Preview-only-123!");
    await p.getByTestId("button-submit").click();
    await p.getByRole("heading",{name:"What kind of hockey?",exact:true}).waitFor();
    assert.equal(f.calls.length,0);
  });
  mark("preview_home_reuses_actual_signup_and_age_screens_without_auth_or_api_calls");
  for(const route of ["/get-started","/high-school/onboarding","/"]){
    await runCase("under18-denied"+route,{guest:true,ageRestricted:true},route,async(p,f)=>{
      await p.getByRole("heading",{name:"Players under 18 join through a parent",exact:true}).waitFor();
      await p.reload();
      await p.getByRole("heading",{name:"Players under 18 join through a parent",exact:true}).waitFor();
      assert.equal(f.calls.length,0);
    });
  }
  await runCase("under18-cached-adult",{ageRestricted:true,cachedAdult:true,completed:true,active:false},"/get-started",async(p,f)=>{
    await p.getByRole("heading",{name:"Players under 18 join through a parent",exact:true}).waitFor();
    assert.equal((await inspection(p)).prefetch,0);
    assert.equal(f.calls.length,0);
  });
  mark("under18_answer_blocks_questionnaire_roles_and_cached_adult_content_including_reload");
  for (const route of ["/high-school/onboarding", "/high-school/parent-verification"]) {
    await runCase("guest" + route, { guest: true }, route, async (p, f) => {
      if(route==="/high-school/onboarding")await p.getByRole("button",{name:"Sign Up",exact:true}).waitFor();
      else await p.getByRole("link", { name: /Go to sign.in/ }).waitFor();
      assert.equal(await p.getByRole("button", { name: "Email a verification code", exact: true }).count(), 0);
      assert.equal(f.calls.length, 0);
    });
  }
  mark("guest_direct_routes_require_sign_in_without_api_or_code_requests");
  await runCase("preview", { enrolled: true, path: "parent" }, "/high-school/onboarding-preview", async (p, f) => {
    await p.getByRole("heading", { name: "What kind of hockey?", exact: true }).waitFor();
    await p.getByRole("button", { name: "Open child-phone role demo", exact: true }).click();
    await p.getByRole("heading", { name: "Enter your parent's code", exact: true }).waitFor();
    assert.equal(f.calls.length, 0); assert.equal((await inspection(p)).parentHeadersPresent, false);
  });
  if(!production){
    await runCase("staff-invitation-only", { path:"staff",staffDraft:true }, "/high-school/onboarding", async(p,f)=>{
      await p.getByRole("heading",{name:"Join with an invitation",exact:true}).waitFor();
      const submit=p.getByRole("button",{name:"Use invitation",exact:true});
      assert.equal(await submit.isDisabled(),true);
      assert.equal(await p.getByRole("heading",{name:"Find your school",exact:true}).count(),0);
      assert.equal(await p.getByRole("button",{name:"Send request",exact:true}).count(),0);
      assert.equal(await p.getByRole("button",{name:"Set up a new school",exact:true}).count(),0);
      await p.getByLabel("Invitation code",{exact:true}).fill("NotAValidInvitation");
      const refused=p.waitForResponse(response=>response.url().endsWith("/onboarding/lookup")&&response.status()===403);
      await submit.click();await refused;
      await p.getByRole("heading",{name:"Join with an invitation",exact:true}).waitFor();
      await p.getByLabel("Invitation code",{exact:true}).fill("SyntheticStaffInvitationForUiTesting12345");
      await submit.click();
      await p.getByRole("heading",{name:"Waiting for approval",exact:true}).waitFor();
      assert.equal(f.calls.filter(call=>call.method==="POST"&&call.path==="/high-school/onboarding/lookup").length,2);
      assert.equal(f.calls.filter(call=>call.method==="POST"&&call.path==="/high-school/onboarding/draft").length,0);
    });
    mark("saved_school_selections_require_invitation_and_cannot_submit_uninvited_staff_requests");
  }
  mark("preview_route_avoids_authenticated_api_queries_even_for_locked_parent");
  for (const role of ["player", "organizer"]) {
    await runCase("adult-" + role, {}, "/", async (p, f) => {
      await p.getByRole("button", { name: /^Adult Hockey/ }).click();
      await p.getByRole("button", { name: "Continue", exact: true }).click();
      noLegacyRequests(f);
      await p.getByRole("button", { name: role === "player" ? /^Player/ : /^Team Captain/ }).click();
      await p.getByRole("button", { name: "Continue", exact: true }).click();
      await p.locator('[data-router-page="Onboarding"]').waitFor();
      assert.equal(f.calls.filter(c => c.path === "/high-school/onboarding/choose").length, 1);
    });
  }
  mark("both_adult_selections_handoff_from_guarded_router_to_existing_onboarding_boundary");
  await runCase("returning-adult", { active: false, completed: true, width: 1280 }, "/roster", async (p, f) => {
    await p.locator('[data-router-page="Roster"]').waitFor();
    assert.equal(f.calls.filter(c => c.path === "/user").length, 1);
    assert.ok((await inspection(p)).prefetch > 0);
  });
  mark("returning_completed_adult_keeps_existing_route_access");
  for (const route of ["/roster", "/high-school/onboarding"]) {
    await runCase("locked" + route, { enrolled: true, path: "parent", cachedAdult: true }, route, async (p, f) => {
      await p.getByRole("heading", { name: "Verify you're the parent", exact: true }).waitFor();
      noLegacyRequests(f);
      const state = await inspection(p);
      assert.equal(state.prefetch, 0); assert.deepEqual(state.legacyPageMounts, []);
      assert.equal(await p.getByLabel("First name", { exact: true }).count(), 0);
    });
  }
  mark("locked_parent_cannot_reach_legacy_routes_or_cached_adult_content_or_prefetch");
  await runCase("status-down", { statusError: true, cachedAdult: true }, "/roster", async (p, f) => {
    await p.getByRole("alert").filter({ hasText: "Parent controls remain locked" }).waitFor();
    noLegacyRequests(f); assert.equal((await inspection(p)).prefetch, 0);
    assert.equal(await p.getByRole("button", { name: "Email a verification code", exact: true }).count(), 0);
  });
  await runCase("state-down", { stateError: true, cachedAdult: true }, "/roster", async (p, f) => {
    await p.getByRole("alert").filter({ hasText: "Onboarding is unavailable" }).waitFor();
    noLegacyRequests(f); assert.deepEqual((await inspection(p)).legacyPageMounts, []);
  });
  mark("verification_or_onboarding_service_failure_keeps_existing_routes_closed");
  await runCase("pending-staff", { path: "staff", cachedAdult: true }, "/roster", async (p, f) => {
    await p.getByRole("heading", { name: "Waiting for approval", exact: true }).waitFor();
    noLegacyRequests(f); assert.equal((await inspection(p)).prefetch, 0);
    assert.deepEqual((await inspection(p)).legacyPageMounts, []);
  });
  mark("pending_staff_does_not_reach_roster_even_with_cached_completed_adult_profile");
  await runCase("password-purpose", { enrolled: true, path: "parent" }, "/high-school/parent-verification", async (p, f) => {
    await p.getByRole("button", { name: "Change password", exact: true }).click();
    await p.getByRole("button", { name: "Email a verification code", exact: true }).click();
    await p.getByLabel("Four-digit email code", { exact: true }).fill("2468");
    await p.getByRole("button", { name: "Verify email code", exact: true }).click();
    await p.getByLabel("New shared password", { exact: true }).waitFor();
    assert.equal((await inspection(p)).parentHeadersPresent, false);
    await p.evaluate(() => history.pushState({}, "", "/high-school/onboarding"));
    await p.getByRole("heading", { name: "Verify you're the parent", exact: true }).waitFor();
    assert.equal(await p.getByLabel("First name", { exact: true }).count(), 0); noLegacyRequests(f);
    assert.equal(f.calls.some(c => c.path.endsWith("/password")), false);
  });
  mark("password_purpose_fixture_approval_does_not_unlock_parent_intake_or_change_any_password");
  await runCase("parent-lock", { enrolled: true, path: "parent" }, "/high-school/onboarding", async (p, f) => {
    await verifyParent(p);
    assert.equal((await inspection(p)).parentHeadersPresent, true);
    assert.equal((await inspection(p)).cacheContainsPlayer, true);
    await p.getByRole("button", { name: "Lock parent controls", exact: true }).click();
    await p.getByRole("heading", { name: "Verify you're the parent", exact: true }).waitFor();
    assert.equal(await p.getByLabel("First name", { exact: true }).count(), 0);
    const state = await inspection(p);
    assert.equal(state.parentHeadersPresent, false); assert.equal(state.cacheContainsPlayer, false);
    assert.equal(state.local, 0); assert.equal(state.session, 0); noLegacyRequests(f);
  });
  mark("fixture_verified_parent_reaches_intake_and_lock_removes_fields_authority_and_cached_player_data");
  await runCase("parent-expiry", { enrolled: true, path: "parent" }, "/roster", async (p, f) => {
    await p.clock.install(); await verifyParent(p);
    await p.clock.fastForward(600_001);
    await p.getByRole("heading", { name: "Verify you're the parent", exact: true }).waitFor();
    const state = await inspection(p);
    assert.equal(state.parentHeadersPresent, false); assert.equal(state.cacheContainsPlayer, false);
    assert.equal(await p.getByLabel("First name", { exact: true }).count(), 0); noLegacyRequests(f);
  });
  mark("parent_expiry_relocks_actual_router_and_removes_cached_intake");
  await runCase("parent-reload", { enrolled: true, path: "parent" }, "/roster", async (p, f) => {
    await verifyParent(p); await p.reload();
    await p.getByRole("heading", { name: "Verify you're the parent", exact: true }).waitFor();
    assert.equal((await inspection(p)).parentHeadersPresent, false); noLegacyRequests(f);
  });
  mark("browser_reload_does_not_restore_parent_authority_from_shared_login");
  await runCase("session-switch", { enrolled: true, path: "parent" }, "/high-school/onboarding", async (p, f) => {
    await verifyParent(p);
    await p.evaluate(token => (window as any).__setFixtureSession(token), secondSession);
    await p.getByRole("heading", { name: "Verify you're the parent", exact: true }).waitFor();
    assert.equal((await inspection(p)).parentHeadersPresent, false);
    assert.equal((await inspection(p)).cacheContainsPlayer, false);
    await p.evaluate(() => (window as any).__setFixtureSession(null));
    await p.getByRole("link", { name: "Sign in", exact: true }).waitFor();
    assert.equal(await p.getByLabel("First name", { exact: true }).count(), 0); noLegacyRequests(f);
  });
  mark("same_account_new_session_and_signout_remove_parent_authority_in_router");
  }
  assert.equal(report.externalRequests, 0); report.outcome = "passed";
} catch (e: any) {
  report.outcome = "failed";
  report.safeFailureKind = e?.name === "TimeoutError" ? "TimeoutError" : e?.code === "ERR_ASSERTION" ? "AssertionError" : "SafeFailure";
  process.exitCode = 1;
} finally {
  await browser.close(); await new Promise<void>(r => server.close(() => r()));
  await mkdir(output, { recursive: true }); await writeFile(path.join(output, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

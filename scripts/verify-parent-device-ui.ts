/** Actual parent screen, cookies, grants and Family APIs against disposable
 * loopback SQL. Auth/mail adapters are synthetic; never a live-device claim. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { createStaffFixture } from "../server/tests/helpers/highSchoolStaffFixture";
import { HighSchoolParentSecurity, ParentSecurityError, parentDigest } from "../server/highSchoolParentSecurity";
import { registerParentVerificationRoutes, PARENT_API, parentDeviceCookie, parentGrantHeader, requireDevParentAuthority } from "../server/highSchoolParentHttp";
import { HighSchoolFamilySetup, HighSchoolFamilyReview } from "../server/highSchoolFamilySetup";
import { registerHighSchoolFamilyRoutes } from "../server/highSchoolFamilyHttp";
import { PARENT_DEVICE_SECONDS } from "../shared/highSchoolParentCodePolicy";
import { parentHomeFixture } from "./helpers/parentHomeFixture";

// Only this disposable process uses these flags; no workspace configuration
// or provider credentials are read or changed.
process.env.NODE_ENV = "development";
process.env.NONPRODUCTION_ISOLATED = "1";
delete process.env.PREVIEW_USE_LIVE_SECRETS;
const f = await createStaffFixture(), { pool, actors } = f, actor = actors.parent;
const mail: string[] = [];
const parent = new HighSchoolParentSecurity(pool, async value => { mail.push(value.code); });
const family = new HighSchoolFamilySetup(pool, parent, async () => "personal");
const issuer = "https://synthetic-parent-home.example/auth/v1";
const validJwt = (value: typeof actor) => `fixture.${Buffer.from(JSON.stringify({ sub: value.authId, session_id: value.sessionId, iss: issuer, aud: "authenticated", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url")}.fixture`;
const accessToken = validJwt(actor), otherToken = validJwt(actors.otherParent);
const root = process.cwd();
const bundle = await build({
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": path.join(root, "client/src") }, loader: { ".css": "empty" },
  define: { "import.meta.env": JSON.stringify({ PROD: true, DEV: false }), "process.env.NODE_ENV": '"production"' },
  plugins: [parentHomeFixture(root), { name: "isolated-auth-and-transport", setup(build) {
    build.onResolve({ filter: /(?:hooks\/useAuth|hooks\/useDashboardSelection|hooks\/useProductionOnboardingAccess)$/ }, args => ({ path: args.path, namespace: "boundary-fixture" }));
    build.onResolve({ filter: /(?:\/|^)(?:FamilyDevices|FamilyStaffReview|ProductionOnboardingTest|HighSchoolYouthOnboarding|ResetPassword|ForgotPassword|TeamSkinBoundary)$/ }, args => ({ path: args.path, namespace: "boundary-fixture" }));
    build.onLoad({ filter: /.*/, namespace: "boundary-fixture" }, args => ({ loader: "tsx", resolveDir: root, contents:
      args.path.endsWith("useAuth") ? `export const useAuth=()=>({user:window.fixtureSessionEnded?null:{id:${JSON.stringify(actor.authId)}},isAuthenticated:!window.fixtureSessionEnded,isLoading:false});` :
      args.path.endsWith("useDashboardSelection") ? `import{useState}from'react';export const useDashboardSelection=()=>{const[s,set]=useState(()=>({selectedType:localStorage.getItem('dashboardSelectedType'),selectedId:localStorage.getItem('dashboardSelectedId')}));return{...s,clearSelection:()=>{localStorage.removeItem('dashboardSelectedType');localStorage.removeItem('dashboardSelectedId');set({selectedType:null,selectedId:null})}}};` :
      args.path.endsWith("useProductionOnboardingAccess") ? `export const useProductionOnboardingAccess=()=>({data:{enabled:false},isLoading:false});` :
      args.path.endsWith("teamRequestScope") ? `export const resetTeamRequestScope=()=>{};` :
      `const Empty=()=>null;export default Empty;export const FamilySetup=Empty,FamilyDevices=Empty,FamilyStaffReview=Empty,ProductionOnboardingTest=Empty,ProductionSchoolRuntime=Empty;`
    }));
    build.onResolve({ filter: /^(?:@\/lib\/|\.\/(?:lib\/)?)(?:queryClient|supabase)$/ }, args => ({ path: args.path.endsWith("supabase") ? "@/lib/supabase" : "@/lib/queryClient", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "ts", resolveDir: root, contents: args.path.endsWith("supabase")
      ? `export const supabase={auth:{getSession:async()=>({data:{session:window.fixtureSessionEnded?null:{access_token:window.fixtureAccessToken}}}),signOut:async()=>{if(window.fixtureSignOutError)return{error:new Error('Synthetic sign-out failure')};window.fixtureSignOutCalls++;window.fixtureSessionEnded=true;return{error:null}}}};`
       : `import{QueryClient}from'@tanstack/react-query';export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>(await apiRequest('GET',queryKey.filter(x=>x!==undefined&&x!==null).join('/'))).json()}}});export class ApiError extends Error{};
          export const getImageUrl=x=>x;
         export const getAuthHeaders=async()=>({Authorization:'Bearer '+window.fixtureAccessToken,...window.fixture.store.headers(window.fixtureAccessToken)});
         export async function apiRequest(method,url,body){const r=await fetch(url,{method,headers:{...await getAuthHeaders(),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok){const e=new ApiError('Fixture request failed');e.data=await r.json();throw e;}return r;}` }));
  } }],
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from 'react';import{createRoot}from'react-dom/client';import{useLocation}from'wouter';
    import ParentVerification from './client/src/pages/ParentVerification';
    import{LiveFamilyBoundary}from'./client/src/components/high-school-family/LiveFamilyBoundary';
    import{Router}from'./client/src/App';
    import{QueryClientProvider}from'@tanstack/react-query';import{queryClient}from'@/lib/queryClient';
    import{parentVerificationSession as store,parentDeviceMetadataKey}from './client/src/lib/parentVerificationSession';
    import{childSkinSession}from './client/src/lib/highSchoolChildSession';
    window.fixtureAccessToken=${JSON.stringify(accessToken)};
    window.fixtureSignOutCalls=0;window.fixtureSessionEnded=false;
    window.fixture={store,metadataKey:parentDeviceMetadataKey,child:childSkinSession};
    const fixtureMode=new URLSearchParams(window.location.search).get('mode')||sessionStorage.getItem('boundary-mode');
    if(fixtureMode==='boundary')sessionStorage.setItem('boundary-mode',fixtureMode);
    function FixtureApp({status}){const[path]=useLocation();const mode=fixtureMode;
      if(mode?.startsWith('boundary'))return <QueryClientProvider client={queryClient}><LiveFamilyBoundary entry={<main>Sign in</main>}><Router/></LiveFamilyBoundary></QueryClientProvider>;
      if(path==='/')return <main><h1>Home</h1></main>;
      return <ParentVerification verified={status.verified} enrolled={mode==='not-enrolled'?false:status.enrolled}
        authenticated={mode!=='signed-out'} unavailable={mode==='unavailable'}/>;}
    async function mount(){const response=await fetch('${PARENT_API}/status',{headers:{Authorization:'Bearer '+window.fixtureAccessToken,...store.headers(window.fixtureAccessToken)}});
      createRoot(document.getElementById('root')).render(<FixtureApp status={await response.json()}/>);}
    void mount();`,
  },
});
const app = express(); app.use(express.json()); app.use(cookieParser());
const authenticate = async (req: express.Request) => {
  if (req.get("authorization") === `Bearer ${accessToken}`) return actor;
  if (req.get("authorization") === `Bearer ${otherToken}`) return actors.otherParent;
  throw new ParentSecurityError("INVALID_SESSION", 401);
};
registerParentVerificationRoutes(app, parent, authenticate);
registerHighSchoolFamilyRoutes(app, family, new HighSchoolFamilyReview(pool), parent, authenticate);
// Synthetic ordinary account data, behind the SAME parent/read policy invoked
// by isAuthenticated. Family data above continues through its real SQL guards.
app.get("/api/*", async (req, res, next) => {
  if (req.path.startsWith("/api/high-school/")) { next(); return; }
  try {
    const a = await authenticate(req);
    await requireDevParentAuthority(parent, a.authId, req.get("authorization")!.slice(7), issuer, req.get(parentGrantHeader), "account_read");
    if (req.path === "/api/user") return res.json({ id:a.authId,firstName:"Parent",lastName:"Fixture",onboardingCompleted:true,role:"free_tier" });
    if (req.path === "/api/user/notification-counts") return res.json({leagues:{},teams:{},tournaments:{}});
    if (/count/.test(req.path)) return res.json({count:0});
    res.json([]);
  } catch (error) { res.status(error instanceof ParentSecurityError ? error.status : 503).json({code:(error as any).code}); }
});
app.get("/api/high-school/child-device/fixture-proof", (req, res) => {
  res.json({ inheritedParentHeader: !!req.get(parentGrantHeader) });
});
app.get("/bundle.js", (_req, res) => { res.type("text/javascript").send(bundle.outputFiles[0].text); });
app.get("/fixture.css", async (_req, res) => {
  const file = (await readdir("dist/public/assets").catch(() => [])).find(name => /^index-.*\.css$/.test(name));
  res.type("text/css").send(file ? await readFile(path.join("dist/public/assets",file),"utf8") : "");
});
app.get("*", (_req, res) => { res.type("html").send(`<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/bundle.js"></script>`); });
let server: ReturnType<typeof app.listen> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let checks = 0;
try {
  await pool.query(`ALTER TABLE public.users ADD COLUMN onboarding_completed boolean DEFAULT false, ADD COLUMN date_of_birth varchar;
    CREATE TABLE hs_parent_security.grants(token_digest text PRIMARY KEY,auth_id uuid,session_id uuid,purpose text,expires_at timestamptz,consumed boolean DEFAULT false);
    CREATE TABLE hs_parent_security.audit(auth_id uuid,session_id uuid,event text,created_at timestamptz DEFAULT now());
    CREATE TABLE hs_parent_security.challenges(id uuid PRIMARY KEY,auth_id uuid,session_id uuid,purpose text,code_digest text,expires_at timestamptz,
      attempts int DEFAULT 0,delivered boolean DEFAULT false,consumed boolean DEFAULT false,created_at timestamptz DEFAULT now());
    CREATE TABLE hs_parent_security.version(version int);`);
  const db = await pool.connect();
  try {
    await db.query("SELECT set_config('roster.hs_family_dev','family-setup',false)");
    await db.query(await readFile("scripts/dev-only/high-school-family-setup.sql", "utf8"));
  } finally { db.release(); }
  await pool.query("UPDATE public.users SET onboarding_completed=true,date_of_birth='1990-01-01' WHERE id IN($1,$2)", [actor.authId, actors.otherParent.authId]);
  await family.begin(actor);
  await family.begin(actors.otherParent);
  server = app.listen(process.argv.includes("--serve") ? 3003 : 0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", error => { errors.push(error.message); console.error("Browser fixture:", error.stack); });
  const familyState = () => page.evaluate(async () => {
    const r = await fetch("/api/high-school/family/state", { headers: { Authorization: "Bearer " + (window as any).fixtureAccessToken,
      ...(window as any).fixture.store.headers((window as any).fixtureAccessToken) } });
    return { status: r.status, data: await r.json() };
  });
  const verificationUrl = `${origin}/high-school/parent-verification`;
  await page.goto(verificationUrl);
  await page.getByRole("button", { name: "Email a verification code", exact: true }).click();
  await page.getByLabel("Four-digit email code").waitFor();
  const pendingChallenge = await pool.query("SELECT id,consumed FROM hs_parent_security.challenges WHERE auth_id=$1", [actor.authId]);
  assert.equal(pendingChallenge.rows.length, 1);
   await page.evaluate("window.fixtureSignOutError=true");
   await page.getByRole("button", { name: "Back to Home", exact: true }).click();
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/");
   assert.equal(await page.evaluate("window.fixtureSignOutCalls"), 0);
   assert.equal(await page.evaluate("window.fixtureSessionEnded"), false);
  assert.equal((await pool.query("SELECT consumed FROM hs_parent_security.challenges WHERE id=$1", [pendingChallenge.rows[0].id])).rows[0].consumed, false);
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM hs_parent_security.grants")).rows[0].n), 0); checks++;
  for (const mode of ["unavailable", "signed-out", "not-enrolled"]) {
    await page.goto(`${verificationUrl}?mode=${mode}`);
     await page.getByRole("button", { name: "Back to Home", exact: true }).click();
    await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
     assert.equal(await page.evaluate("window.fixtureSignOutCalls"), 0); checks++;
  }
   // Real production boundary, Router, swipe container and mobile Dashboard:
   // assert actual schedule UI, not a substitute labelled "Home".
   const realHome = async () => {
     await page.getByTestId("text-schedule-title").waitFor();
     assert.equal(await page.getByText("Your saved family setup has not changed.", {exact:false}).count(), 0);
     assert.equal(await page.evaluate("window.fixtureSignOutCalls"), 0);
   };
   await page.goto(`${verificationUrl}?mode=boundary`);
   await page.getByRole("button", { name: "Back to Home", exact: true }).click();
   await realHome();
   assert.equal(await page.evaluate("window.fixtureSessionEnded"), false);
   assert.equal(await page.evaluate("window.fixtureSignOutCalls"), 0);
   assert.equal((await familyState()).data.verified, false); checks++;
   const ordinaryRead = await page.evaluate(async () => {
     const headers={Authorization:"Bearer "+(window as any).fixtureAccessToken};
     const user=await fetch("/api/user",{headers});
     const teams=await fetch("/api/high-school/family/adult-team-ids",{headers});
     const privateChange=await fetch("/api/high-school/family/draft",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({revision:0,players:[]})});
     return {user:user.status,teams:teams.status,privateChange:privateChange.status};
   });
   assert.deepEqual(ordinaryRead,{user:200,teams:200,privateChange:403}); checks++;
   await page.reload();
   await realHome(); checks++;
   await page.evaluate("localStorage.setItem('dashboardSelectedType','team');localStorage.setItem('dashboardSelectedId','stale-school-team')");
   await page.goto(`${origin}/?mode=boundary`);
   await realHome();
   assert.notEqual(await page.evaluate("localStorage.getItem('dashboardSelectedId')"),"stale-school-team"); checks++;
   await page.evaluate("window.history.pushState(null,'','/high-school/family')");
   await page.getByRole("heading", { name: "Verify you're the parent", exact: true }).waitFor();
   await page.getByRole("button", { name: "Back to Home", exact: true }).click();
   await realHome(); checks++;
   await page.goto(`${origin}/app?mode=boundary`);
   await realHome(); checks++;
   await page.route("**/api/high-school/parent-verification/status", route => route.fulfill({status:503,contentType:"application/json",body:'{"code":"UNAVAILABLE"}'}));
   await page.goto(`${verificationUrl}?mode=boundary`);
   await page.getByRole("button", { name: "Back to Home", exact: true }).click();
   await realHome();
   assert.equal(await page.evaluate("window.fixtureSignOutCalls"), 0); checks++;
   await page.unroute("**/api/high-school/parent-verification/status");
    // Submit through the real boundary, not just a standalone verification page:
    // saving device authority invalidates status and may remount that page.
    await pool.query("DELETE FROM hs_parent_security.challenges WHERE auth_id=$1", [actor.authId]);
    mail.length = 0;
    await page.goto(`${verificationUrl}?mode=boundary`);
    await page.getByRole("button", { name: "Email a verification code", exact: true }).click();
    await page.getByLabel("Four-digit email code").waitFor();
    await page.getByLabel("Four-digit email code").fill(mail.at(-1)!);
    // A denied submission must retain the current challenge rather than making
    // the parent request a second email (which has a separate resend limit).
    await page.route("**/api/high-school/parent-verification/verify", route => route.fulfill({
      status:429,contentType:"application/json",body:'{"code":"CODE_RATE_LIMIT"}',
    }));
    await page.getByRole("button", { name: "Verify email code", exact: true }).click();
    await page.getByRole("alert").filter({hasText:"Too many requests."}).waitFor();
    assert.equal(await page.getByLabel("Four-digit email code").inputValue(), mail.at(-1));
    assert.equal(mail.length, 1); checks++;
    await page.unroute("**/api/high-school/parent-verification/verify");
    await page.getByRole("button", { name: "Verify email code", exact: true }).click();
    await page.getByRole("button", { name: "Continue to family setup", exact: true }).waitFor({timeout:5000});
    assert.equal((await familyState()).data.verified, true);
    assert.equal(mail.length, 1);
    assert.equal(await page.getByRole("button", { name: "Email a verification code", exact: true }).count(), 0);
    // The server's verified status also survives a full page load. A separate
    // password-change code must remain mandatory despite parent approval.
    await page.reload();
    await page.getByRole("button", { name: "Continue to family setup", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Email a verification code", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await page.getByRole("button", { name: "Email a verification code", exact: true }).waitFor();
    assert.equal(await page.getByLabel("New shared password", {exact:true}).count(), 0);
    await page.getByRole("button", { name: "Parent controls", exact: true }).click();
    assert.equal(mail.length, 1); checks++;
    await page.getByRole("button", { name: "Continue to family setup", exact: true }).click();
    await page.getByRole("heading", { name: "Your family, your pace", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/high-school/family"); checks++;
    await page.getByRole("button", {name:"Back to my account",exact:true}).click();
    // No adult teams in this synthetic fixture: return to unscoped adult Home.
    await page.waitForURL(url=>url.pathname==="/");
    await page.goto(`${origin}/high-school/family?mode=boundary`);
    await page.getByRole("heading", { name: "Your family, your pace", exact: true }).waitFor();
    assert.equal(mail.length, 1); checks++;
    await page.evaluate(async () => {
      await fetch("/api/high-school/parent-verification/revoke", {method:"POST",headers:{Authorization:"Bearer "+(window as any).fixtureAccessToken}});
      (window as any).fixture.store.clear();
    });
    await page.evaluate("sessionStorage.removeItem('boundary-mode')");
  await pool.query("DELETE FROM hs_parent_security.challenges WHERE auth_id=$1", [actor.authId]); mail.length = 0;
  await page.goto(verificationUrl);
  assert.equal((await familyState()).data.verified, false); checks++;
  const challenged = page.waitForResponse(r => r.url().endsWith("/challenge") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Email a verification code", exact: true }).click();
  assert.equal((await challenged).status(), 200);
  await page.getByLabel("Four-digit email code").waitFor();
  await page.getByLabel("Four-digit email code").fill(mail.at(-1)!);
  const verified = page.waitForResponse(r => r.url().endsWith("/verify") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Verify email code", exact: true }).click();
  const result = await (await verified).json();
  assert.equal(result.remembered, true); assert.equal(result.expiresInSeconds, PARENT_DEVICE_SECONDS);
  assert.equal("verificationToken" in result, false); checks++;
  await page.getByRole("status").filter({ hasText: "This parent device is verified for 30 days." }).waitFor();
  const cookie = (await context.cookies()).find(value => value.name === parentDeviceCookie)!;
  assert.ok(cookie.httpOnly); assert.equal(cookie.sameSite, "Strict");
  assert.equal(await page.evaluate("document.cookie.includes('roster_parent_device')"), false);
  assert.equal(await page.evaluate(`localStorage.getItem(window.fixture.metadataKey).includes(${JSON.stringify(cookie.value)})`), false); checks++;
  const stored = (await pool.query("SELECT *,extract(epoch FROM expires_at-now()) AS seconds FROM hs_parent_security.grants WHERE token_digest=$1", [parentDigest(cookie.value)])).rows[0];
  assert.ok(Number(stored.seconds) > PARENT_DEVICE_SECONDS - 20);
  let state = await familyState(); assert.equal(state.data.verified, true); assert.ok(state.data.requests.length > 0); checks++;
  const savedRequests = JSON.stringify(state.data.requests);
  await page.getByRole("button", { name: "Back to Home", exact: true }).click();
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  assert.equal(await page.evaluate("window.fixtureSignOutCalls"), 0);
  assert.equal((await familyState()).data.verified, true);
  assert.equal(JSON.stringify((await familyState()).data.requests), savedRequests); checks++;
  await page.goto(verificationUrl);
  await page.getByRole("button", { name: "Back to Home", exact: true }).waitFor();
  await page.reload();
  state = await familyState(); assert.equal(state.data.verified, true); assert.ok(state.data.requests.length > 0);
  assert.equal(mail.length, 1); checks++;
  const tab = await context.newPage(); await tab.goto(verificationUrl);
  assert.equal(await tab.evaluate(async () => (await (await fetch("/api/high-school/family/state", { headers: { Authorization: "Bearer " + (window as any).fixtureAccessToken, ...(window as any).fixture.store.headers((window as any).fixtureAccessToken) } })).json()).verified), true); checks++;
  const reopened = await browser.newContext({ storageState: await context.storageState(), viewport: { width: 1440, height: 900 } });
  const reopenedPage = await reopened.newPage(); await reopenedPage.goto(verificationUrl);
  assert.equal(await reopenedPage.evaluate(async () => (await (await fetch("/api/high-school/family/state", { headers: { Authorization: "Bearer " + (window as any).fixtureAccessToken, ...(window as any).fixture.store.headers((window as any).fixtureAccessToken) } })).json()).verified), true);
  await reopened.close(); assert.equal(mail.length, 1); checks++;
  assert.equal((await fetch(`${origin}/api/high-school/family/state`, { headers: { Cookie: `${parentDeviceCookie}=${cookie.value}` } })).status, 401); checks++;
  const cookieWithoutHint = await fetch(`${origin}/api/high-school/family/state`, { headers: {
    Authorization: `Bearer ${accessToken}`, Cookie: `${parentDeviceCookie}=${cookie.value}`,
  } });
  assert.equal((await cookieWithoutHint.json() as any).verified, false); checks++;
  const socketToken = await page.evaluate("window.fixture.store.socketGrant(window.fixtureAccessToken)") as string;
  assert.match(socketToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await parent.authorized(actor, socketToken), true);
  assert.equal(await page.evaluate("window.fixture.store.socketGrant(window.fixtureAccessToken)"), socketToken); checks++;
  const hintOnly = await fetch(`${origin}/api/high-school/family/state`, { headers: { Authorization: `Bearer ${accessToken}`, "x-parent-device-id": parentDigest(cookie.value) } });
  assert.equal((await hintOnly.json() as any).verified, false); checks++;
  const newSession = { ...actor, sessionId: randomUUID() };
  await pool.query("INSERT INTO auth.sessions VALUES($1,$2,NULL)", [newSession.sessionId, actor.authId]);
  assert.equal(await parent.authorized(newSession, cookie.value), false);
  const otherState = await fetch(`${origin}/api/high-school/family/state`, { headers: {
    Authorization: `Bearer ${otherToken}`, Cookie: `${parentDeviceCookie}=${cookie.value}`, "x-parent-device-id": parentDigest(cookie.value),
  } });
  assert.equal((await otherState.json() as any).verified, false); checks++;
  const password = await page.evaluate(async () => {
    const r = await fetch("/api/high-school/parent-verification/password", { method: "POST", headers: { Authorization: "Bearer " + (window as any).fixtureAccessToken, "Content-Type": "application/json" }, body: JSON.stringify({ password: "SyntheticNewPassword1!" }) });
    return { status: r.status, data: await r.json() };
  });
  assert.equal(password.status, 403); assert.equal(password.data.code, "PASSWORD_VERIFICATION_REQUIRED"); checks++;
  const passwordChallenge = randomUUID(), passwordCode = "0123";
  await pool.query(`INSERT INTO hs_parent_security.challenges(id,auth_id,session_id,purpose,code_digest,expires_at,delivered)
    VALUES($1,$2,$3,'password_change',$4,now()+interval '2 minutes',true)`, [passwordChallenge, actor.authId, actor.sessionId, parentDigest(`${passwordChallenge}:${passwordCode}`)]);
  assert.equal((await parent.verify(actor, passwordChallenge, passwordCode, true)).expiresInSeconds, 120); checks++;
  await pool.query("UPDATE hs_parent_security.grants SET expires_at=now()-interval '1 second' WHERE token_digest=$1", [parentDigest(cookie.value)]);
  assert.equal((await familyState()).data.verified, false);
  await pool.query("UPDATE hs_parent_security.grants SET expires_at=now()+interval '30 days' WHERE token_digest=$1", [parentDigest(cookie.value)]); checks++;
  assert.equal(await page.evaluate(async () => (await (await fetch("/api/high-school/child-device/fixture-proof", { headers: { Authorization: "Bearer hs_child_" + "a".repeat(43) } })).json()).inheritedParentHeader), false); checks++;
  const forgotten = page.waitForResponse(r => r.url().endsWith("/forget-device") && r.status() === 200);
  await page.evaluate("window.fixture.child.save('hs_child_'+'a'.repeat(43))");
  await forgotten;
  assert.equal((await familyState()).data.verified, false);
  assert.equal(await page.evaluate("localStorage.getItem(window.fixture.metadataKey)"), null); checks++;
  assert.equal((await pool.query("SELECT consumed FROM hs_parent_security.grants WHERE token_digest=$1", [parentDigest(cookie.value)])).rows[0].consumed, true);
  assert.equal(await parent.authorized(actor, socketToken), false); checks++;
  await pool.query("UPDATE hs_parent_security.grants SET consumed=false WHERE token_digest=$1", [parentDigest(cookie.value)]);
  const locked = await page.evaluate(async () => (await fetch("/api/high-school/parent-verification/revoke", { method: "POST", headers: { Authorization: "Bearer " + (window as any).fixtureAccessToken } })).status);
  assert.equal(locked, 200);
  assert.equal((await context.cookies()).some(value => value.name === parentDeviceCookie), false);
  assert.equal((await familyState()).data.verified, false); checks++;
  const productionChallenge = randomUUID();
  await pool.query(`INSERT INTO hs_parent_security.challenges(id,auth_id,session_id,purpose,code_digest,expires_at,delivered)
    VALUES($1,$2,$3,'parent_action',$4,now()+interval '2 minutes',true)`,
  [productionChallenge, actor.authId, actor.sessionId, parentDigest(`${productionChallenge}:0123`)]);
  process.env.NODE_ENV = "production";
  try {
    const response = await fetch(`${origin}${PARENT_API}/verify`, { method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: productionChallenge, code: "0123", rememberDevice: true }) });
    assert.equal(response.status, 200);
    const setCookie = response.headers.get("set-cookie")!;
    assert.match(setCookie, /;\s*Secure/i); assert.match(setCookie, /;\s*HttpOnly/i);
    assert.match(setCookie, /Max-Age=2592000/); assert.match(setCookie, /SameSite=Strict/);
    const safeResult: any = await response.json();
    assert.equal("verificationToken" in safeResult, false); checks++;
  } finally { process.env.NODE_ENV = "development"; }
  assert.deepEqual(errors, []);
  await tab.close(); await context.close(); await browser.close(); browser = undefined;
  console.log(JSON.stringify({ outcome: "passed", checks, scope: "Real screen, browser cookies and isolated SQL; synthetic Auth/mail, no production calls" }));
  if (process.argv.includes("--serve")) { console.log(`Parent verification fixture: ${origin}`); await new Promise(() => {}); }
} finally {
  await browser?.close();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await f.close();
}

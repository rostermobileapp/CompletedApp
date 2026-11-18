/**
 * Real Login + OnboardingQuestionnaire screens, fake auth, isolated local
 * PostgreSQL. Never connects to Supabase, stores, HPIB, or the live API.
 * ATTRIBUTION_TEST_DB_URL=postgresql://.../attribution_test npx tsx scripts/test-signup-attribution-browser.ts
 */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import pg from "pg";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { saveOnboardingReferral, ReferralSaveError } from "../server/onboardingReferral";

const target = new URL(process.env.ATTRIBUTION_TEST_DB_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.pathname, "/attribution_test");
const pool = new pg.Pool({ connectionString: target.href, host: target.hostname, port: Number(target.port),
  user: target.username, database: "attribution_test", ssl: false, max: 8 });
const dir = path.resolve("generated-artifacts/attribution-browser");
await mkdir(dir, { recursive: true });
const cssDir = path.resolve("generated-artifacts/attribution-client-build/assets");
const css = (await readdir(cssDir)).find(file => /^index-.*\.css$/.test(file));
assert.ok(css, "Build the client into generated-artifacts/attribution-client-build first");
await writeFile(`${dir}/styles.css`, await readFile(path.join(cssDir, css)));
await pool.query("DELETE FROM users WHERE id LIKE 'browser-%'");
await pool.query("DELETE FROM referral_user_links WHERE user_id LIKE 'browser-%'");
const sessions = new Map<string, { id: string; user_metadata: Record<string, any> }>();
let sequence = 0, authenticatedSaves = 0;
const errors: string[] = [];
const app = express();
app.use(express.json());
app.get("/api/referral/validate-code", async (req, res) => {
  const row = (await pool.query("SELECT id,org_name FROM referral_partners WHERE referral_code=$1 AND status='approved'",
    [String(req.query.code)])).rows[0];
  if (!row) return void res.status(404).json({ message: "Code not recognized" });
  res.json({ valid: true, id: row.id, orgName: row.org_name });
});
app.get("/api/referral/approved-partners", async (_req, res) => {
  res.json((await pool.query(`SELECT id,org_name AS "orgName" FROM referral_partners WHERE status='approved' ORDER BY id`)).rows);
});
app.post("/fixture/signup", async (req, res) => {
  const id = `browser-${++sequence}`;
  await pool.query("INSERT INTO users(id) VALUES($1)", [id]);
  const user = { id, user_metadata: req.body.metadata || {} };
  sessions.set(`fixture-${id}`, user);
  res.json({ user, token: `fixture-${id}` });
});
app.post("/fixture/metadata", (req, res) => {
  const user = sessions.get(String(req.headers.authorization || "").replace("Bearer ", ""));
  if (!user) return void res.sendStatus(401);
  Object.assign(user.user_metadata, req.body);
  res.json(user);
});
app.use("/api", (req: any, res, next) => {
  req.fixtureUser = sessions.get(String(req.headers.authorization || "").replace("Bearer ", ""));
  if (!req.fixtureUser) return void res.status(401).json({ message: "Authentication required" });
  next();
});
const profile = async (id: string) => {
  const row = (await pool.query(`SELECT id,referral_partner_id AS "referralPartnerId",referral_code AS "referralCode" FROM users WHERE id=$1`, [id])).rows[0];
  return row;
};
app.get("/api/user", async (req: any, res) => res.json(await profile(req.fixtureUser.id)));
app.patch("/api/user/onboarding", async (req: any, res) => {
  try {
    await saveOnboardingReferral(pool, req.fixtureUser.id, req.body);
    authenticatedSaves++;
    res.json(await profile(req.fixtureUser.id));
  } catch (error) {
    if (error instanceof ReferralSaveError) return void res.status(error.status).json({ message: error.message, code: error.code });
    res.sendStatus(500);
  }
});

const authMock = `
export const state={user:null,token:null};
export const supabase={auth:{
onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
getUser:async()=>({data:{user:state.user},error:null}),
updateUser:async({data})=>{const r=await fetch('/fixture/metadata',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.token},body:JSON.stringify(data)});state.user=await r.json();return {data:{user:state.user},error:r.ok?null:new Error('metadata save failed')};},
signUp:async(payload)=>{const r=await fetch('/fixture/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({metadata:payload.options.data})});const data=await r.json();state.user=data.user;state.token=data.token;window.dispatchEvent(new Event('fixture-auth'));return {data:{user:{...data.user,identities:[{}]},session:{access_token:data.token}},error:null};},
}};
export async function clearStaleSession(){}
`;
const queryMock = `
import {QueryClient} from '@tanstack/react-query';import {state} from 'fixture-auth';
export async function apiRequest(method,url,data){const response=await fetch(url,{method,headers:{'Content-Type':'application/json',...(state.token?{Authorization:'Bearer '+state.token}:{})},...(data?{body:JSON.stringify(data)}:{})});if(!response.ok){const body=await response.json();throw Object.assign(new Error(body.message),{status:response.status});}return response;}
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>(await apiRequest('GET',queryKey[0])).json()}}});
`;
const entry = `
import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {QueryClientProvider} from '@tanstack/react-query';
import Login from './client/src/pages/Login';import Questionnaire from './client/src/pages/OnboardingQuestionnaire';
import {queryClient} from 'fixture-query';import {state} from 'fixture-auth';
import {beginSignupAttribution} from './client/src/lib/signupAttributionBrowser';
import {installAppAttributionLinks} from './client/src/lib/appAttributionLinks';
beginSignupAttribution();installAppAttributionLinks(document,()=>window.location.href);
function App(){const [,refresh]=useState(0);useEffect(()=>{const change=()=>refresh(n=>n+1);window.addEventListener('fixture-auth',change);return()=>window.removeEventListener('fixture-auth',change);},[]);return <QueryClientProvider client={queryClient}>{state.user?<Questionnaire/>:<Login/>}</QueryClientProvider>}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
  bundle: true, format: "esm", outfile: `${dir}/fixture.js`, jsx: "automatic",
  alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets") },
  loader: { ".png": "dataurl" }, define: { "import.meta.env.DEV": "false" },
  plugins: [{ name: "isolated-auth-and-api", setup(b) {
    b.onResolve({ filter: /^(fixture-auth|fixture-query)$|(?:^|\/)(supabase|queryClient|nativePurchases|use-toast|EmailVerificationModal)$/ }, args => {
      if (/supabase|fixture-auth/.test(args.path)) return { path: "auth", namespace: "fixture" };
      if (/queryClient|fixture-query/.test(args.path)) return { path: "query", namespace: "fixture" };
      if (/nativePurchases/.test(args.path)) return { path: "native", namespace: "fixture" };
      if (/use-toast/.test(args.path)) return { path: "toast", namespace: "fixture" };
      return { path: "verification", namespace: "fixture" };
    });
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
      contents: args.path === "auth" ? authMock : args.path === "query" ? queryMock :
        args.path === "native" ? "export const setSubscriberAttributes=attrs=>{window.confirmedNativeAttributes=attrs};" :
        args.path === "toast" ? "export const useToast=()=>({toast:()=>{}});" :
        "export const EmailVerificationModal=()=>null;", loader: "js", resolveDir: process.cwd(),
    }));
  } }],
});
app.use(express.static(dir));
app.use(express.static(path.resolve("client/public")));
app.get("*", (_req, res) => res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`));
const server = app.listen(55445, "127.0.0.1");
const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
try {
  for (const scenario of ["url", "manual"] as const) {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 } });
    await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:55445/login${scenario === "url" ? "?ref=HPIB1234&utm_source=hpib&utm_campaign=fall" : ""}`);
    if (scenario === "url") {
      await page.evaluate(() => {
        const box = document.createElement("div");
        box.hidden = true;
        box.innerHTML = ["/login", "/get-started", "/referral-program/apply"]
          .map((entry, i) => `<a id="fixture-cta-${i}" href="https://www.roster-app.com${entry}">App entry</a>`).join("")
          + '<a id="fixture-store" href="https://apps.apple.com/app/example">Store</a>';
        document.body.appendChild(box);
      });
      await page.waitForFunction(() => (document.querySelector("#fixture-cta-0") as HTMLAnchorElement)?.href.includes("ref=HPIB1234"));
      for (const id of [0, 1, 2]) {
        const actual = await page.locator(`#fixture-cta-${id}`).evaluate((a: HTMLAnchorElement) => ({ href: a.href, target: a.target, rel: a.rel }));
        assert.equal(new URL(actual.href).searchParams.get("utm_source"), "hpib");
        assert.equal(actual.target, "_blank");
        assert.ok(actual.rel.includes("noopener") && actual.rel.includes("noreferrer"));
      }
      assert.equal(await page.locator("#fixture-store").getAttribute("target"), null);
      await page.evaluate(() => {
        history.pushState({}, "", "/pricing");
        const anchor = document.createElement("a");
        anchor.id = "fixture-later-cta";
        anchor.href = "https://www.roster-app.com/get-started";
        anchor.hidden = true;
        document.body.appendChild(anchor);
      });
      await page.waitForFunction(() => (document.querySelector("#fixture-later-cta") as HTMLAnchorElement)?.href.includes("ref=HPIB1234"));
      await page.locator("#fixture-later-cta").evaluate((a: HTMLAnchorElement) => { a.href = "https://www.roster-app.com/login"; });
      await page.waitForFunction(() => {
        const href = (document.querySelector("#fixture-later-cta") as HTMLAnchorElement)?.href;
        return !!href && new URL(href).pathname === "/login" && href.includes("ref=HPIB1234");
      });
    }
    await page.getByTestId("button-login-initial").click();
    await page.getByTestId("button-toggle-mode").click();
    await page.locator('input[type="email"]').fill(`${scenario}@example.invalid`);
    await page.locator('input[type="password"]').fill("Fixture-only-password-123");
    await page.getByTestId("button-submit").click();
    await page.getByRole("button", { name: /Get Started.*Free/ }).click();
    // Follow the existing questionnaire rather than injecting a preview state.
    await page.getByRole("button", { name: /Choose my role/ }).click();
    await page.getByRole("button", { name: /Player$/ }).click();
    // Pain selection and the subsequent feature summary retain their real UI.
    await page.getByRole("button", { name: /RSVP|attendance|who.s coming/i }).first().click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /Set up my experience/ }).click();
    const select = page.locator("select");
    await select.waitFor();
    assert.equal(await select.evaluate(element => getComputedStyle(element).borderTopWidth), "2px", "Real application styles must be loaded");
    await page.waitForFunction(() => document.querySelector("select")?.querySelectorAll("option").length! >= 4);
    if (scenario === "url") {
      await page.waitForFunction(() => (document.querySelector("select") as HTMLSelectElement)?.value === "hpib");
      await page.getByText("Partner from your link: HPIB", { exact: false }).waitFor();
    } else {
      await select.selectOption("hpib");
    }
    await page.screenshot({ path: `${dir}/${scenario}-confirmation.jpg`, fullPage: true });
    await page.getByRole("button", { name: "Build my roster →" }).click();
    await page.waitForFunction(() => (window as any).confirmedNativeAttributes?.referral_code === "HPIB1234");
    const stored = (await pool.query(`SELECT referral_partner_id,referral_code FROM users WHERE id=$1`, [`browser-${sequence}`])).rows[0];
    assert.equal(stored.referral_partner_id, "hpib");
    assert.equal(stored.referral_code, "HPIB1234");
    const metadata = Array.from(sessions.values()).at(-1)!.user_metadata;
    assert.equal(metadata.acquisition_campaign?.utm_source, scenario === "url" ? "hpib" : undefined);
    console.log(`PASS: ${scenario === "url" ? "Web link → real signup UI → preselected partner → confirmed PostgreSQL save" : "No URL → real signup UI → manual partner selection → confirmed PostgreSQL save"}`);
    await context.close();
  }
  assert.equal(authenticatedSaves, 2);
  assert.deepEqual(errors, []);
  await writeFile(`${dir}/results.json`, JSON.stringify({ scenarios: 2, authenticatedSaves, browserErrors: errors, liveAccountsCreated: 0, schemaChangesToApp: 0 }, null, 2));
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
}

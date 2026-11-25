/** Offline rendering/lifecycle checks. Auth and context transport use named
 * synthetic fixtures; no provider, hosted DB, delivery, purchase or activation. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import express from "express";
import { WebSocketServer } from "ws";
import { chromium } from "playwright-core";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import type { SkinContext, SkinTeam, TeamRole } from "../shared/teamSkin";

const out = "generated-artifacts/high-school-team-skins";
const report = { scope: "Offline fixture browser/lifecycle checks; not real Auth, native or child activation acceptance",
  checks: [] as string[], errors: [] as string[], requests: [] as string[] };
const roles: TeamRole[] = ["head_coach", "assistant_coach", "team_manager", "athletic_director", "parent", "player"];
const teams = (role: TeamRole): SkinTeam[] => [
  { id: "varsity", name: "Northfield Varsity", program_type: "high_school", role, status: "approved" },
  { id: "jv", name: "Northfield JV", program_type: "high_school", role: "team_manager", status: "approved" },
  { id: "adult", name: "Adult team", program_type: "adult", role: "player", status: "approved" },
];
let fixture: SkinContext;
const bundle = await build({
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  alias: { "@assets": `${process.cwd()}/attached_assets` },
  loader: { ".css": "empty", ".png": "dataurl" }, define: {
    "process.env.NODE_ENV": '"development"',
    "import.meta.env": JSON.stringify({ DEV: true, VITE_ISOLATED_DEVELOPMENT: "true" }),
  },
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React,{useEffect} from 'react'; import {createRoot} from 'react-dom/client';
    import {QueryClientProvider,useQuery} from '@tanstack/react-query';
    import {TeamSkinBoundary} from './client/src/components/high-school-skins/TeamSkinBoundary';
    import {queryClient,apiRequest} from './client/src/lib/queryClient';
    import {childSkinSession,requestChildSession} from './client/src/lib/highSchoolChildSession';
    import {notifyDashboardSelectionChange} from './client/src/hooks/useDashboardSelection';
    import {WebSocketProvider} from './client/src/context/WebSocketContext';
    window.__life={mounts:0,sockets:0,polls:0,aborted:0,wsAttempts:0,wsOpen:0};
    const NativeSocket=window.WebSocket;
    window.WebSocket=class extends NativeSocket{
      constructor(...args){super(...args);window.__life.wsAttempts++;let opened=false;
        this.addEventListener('open',()=>{opened=true;window.__life.wsOpen++;});
        this.addEventListener('close',()=>{if(opened)window.__life.wsOpen--;});
      }
    };
    window.selectTeam=(id)=>{localStorage.setItem('dashboardSelectedType','team');localStorage.setItem('dashboardSelectedId',id);notifyDashboardSelectionChange();};
    window.navigate=(path)=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));};
    window.deniedChildRequest=()=>requestChildSession('hs_child_'+'x'.repeat(43),'GET','/api/payment-requests').then(()=>false,()=>true);
    window.cacheKeys=()=>queryClient.getQueryCache().getAll().map(q=>q.queryKey);
    window.refreshContext=()=>queryClient.invalidateQueries({queryKey:['team-skin-context']});
    function Adult(){
      const result=useQuery({queryKey:['/api/adult-fixture']});
      useEffect(()=>{
        window.__life.mounts++;window.__life.sockets++;
        const timer=setInterval(()=>{window.__life.polls++;void apiRequest('GET','/api/trivia-fixture').catch(()=>{});},100);
        void apiRequest('GET','/api/beer-delayed').catch(e=>{if(e.name==='AbortError')window.__life.aborted++;});
        return()=>{clearInterval(timer);window.__life.sockets--;};
      },[]);
      return <main data-testid="adult-runtime"><h1>Original adult runtime fixture</h1><p>{result.data?'Adult query loaded':'Loading'}</p>
        <button onClick={()=>window.selectTeam('varsity')}>Select Varsity</button></main>;
    }
    if(window.__fixture.actor.type==='child')childSkinSession.save('hs_child_'+'x'.repeat(43));
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}>
      <TeamSkinBoundary entry={<main data-testid="onboarding-entry">Existing onboarding</main>}>
        <WebSocketProvider><Adult/></WebSocketProvider>
      </TeamSkinBoundary>
    </QueryClientProvider>);
  ` },
  plugins: [{
    name: "synthetic-auth-only", setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)(?:useAuth|DemoContext|supabase)$/ }, args =>
        ({ path: args.path, namespace: "synthetic" }));
      builder.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({
        loader: "js", contents: args.path.endsWith("useAuth")
          ? `export const useAuth=()=>({user:{id:window.__fixture.actor.id},isLoading:false,isAuthenticated:true});`
          : args.path.endsWith("DemoContext")
            ? `export const useDemo=()=>({isActive:false});`
            : `export const clearStaleSession=async()=>{};export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-fixture'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`,
      }));
    },
  }],
});
const app = express();
app.use("/api", (req, _res, next) => { report.requests.push(req.path); next(); });
app.get(["/api/high-school/skin-context", "/api/high-school/child-device/skin-context"], (_req, res) => res.json(fixture));
app.get("/api/beer-delayed", (_req, res) => {
  const timer = setTimeout(() => res.json({ stale: true }), 10_000);
  res.on("close", () => clearTimeout(timer));
});
app.get(["/api/adult-fixture", "/api/trivia-fixture"], (_req, res) => res.json({ synthetic: true }));
app.get("/api/user", (_req, res) => res.json({ id: fixture.actor.id }));
app.use("/api", (_req, res) => res.status(403).json({ code: "NO_OTHER_APIS_IN_FIXTURE" }));
app.get("/page.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
app.get("/page.css", async (_req, res) => {
  const compiled=(await readdir("dist/public/assets")).find(name=>/^index-.*\.css$/.test(name))!;
  res.type("css").send(await readFile(`dist/public/assets/${compiled}`,"utf8")
    +await readFile("client/src/components/high-school-skins/team-skin-shell.css","utf8"));
});
app.get("*", (req, res) => res.type("html").send(`<!doctype html><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css">
  <div id="root"></div><script>sessionStorage.removeItem('roster-child-session');window.__fixture=${JSON.stringify(fixture)};
  localStorage.setItem('dashboardSelectedType','team');localStorage.setItem('dashboardSelectedId',${JSON.stringify(req.query.initial ?? "varsity")});
  </script><script src="/page.js"></script>`));
const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.on("listening", resolve));
const sockets = new WebSocketServer({ server, path: "/ws" });
sockets.on("connection", ws => ws.on("message", () => ws.send(JSON.stringify({ type: "authenticated" }))));
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const mark = (text: string) => report.checks.push(text);
const forbidden = (path: string) => /trivia|beer|badge|patch|achievement|troph|streak|odds|prediction/i.test(path);
try {
  await mkdir(out, { recursive: true });
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    page.on("pageerror", e => report.errors.push(e.message));
    await page.route("**/*", r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    for (const role of roles) {
      const start = report.requests.length;
      fixture = { actor: { id: `fixture-${role}`, type: role === "player" ? "child" : "adult" },
        teams: role === "player" ? [teams(role)[0]] : teams(role), restricted: true };
      await page.goto(`${origin}${role === "player" ? "/under-18/code" : "/"}`);
      await page.getByTestId("skin-role-label").waitFor();
      if (role === "player") assert.equal(new URL(page.url()).pathname, "/high-school/home");
      if(role==="parent"||role==="player") {
        const tabs = await page.locator('[data-testid^="skin-tab-"]').allTextContents();
        assert.deepEqual(tabs.map(t => t.trim()), role === "parent"
          ? ["Home", "Schedule", "Chat", "Payments", "Family"] : ["Home", "Schedule", "Chat", "Team"]);
        await page.getByTestId("skin-tab-schedule").click();
      } else {
        assert.equal(await page.getByTestId("bottom-navigation").innerText(),"My Team\nMessages\nHome\nPayments\nProfile");
        await page.getByTestId("button-hamburger-menu").click();
        await page.getByRole("button",{name:"Schedule",exact:true}).click();
      }
      assert.equal(await page.getByTestId("skin-route-denied").count(), 0);
      await page.evaluate(() => (window as any).navigate("/trophy-case"));
      await page.getByTestId("skin-route-denied").waitFor();
      assert.equal(await page.getByTestId("adult-runtime").count(), 0);
      await page.getByRole("button", { name: /home/i }).first().click();
      assert.equal(await page.getByTestId("skin-route-denied").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => (window as any).__life.mounts), 0);
      assert.equal(await page.evaluate(() => (window as any).__life.wsAttempts), 0);
      assert.deepEqual(report.requests.slice(start).filter(forbidden), []);
      if (role === "player") {
        assert.equal(await page.getByTestId("skin-team-switcher").count(), 0);
        assert.equal(await page.evaluate(() => (window as any).deniedChildRequest()), true);
        await page.evaluate(() => (window as any).navigate("/high-school/payments"));
        await page.getByTestId("skin-route-denied").waitFor();
        assert.equal(await page.getByTestId("adult-runtime").count(), 0);
      }
      await page.screenshot({ path: `${out}/${role}-${width}.png`, fullPage: true });
      mark(`${role}: correct ${width}px tabs, denied deep link, zero adult mounts/requests`);
    }
    // Start in the actual adult branch, keep a request pending, then select
    // parent -> manager -> adult using the real persisted selection hook.
    fixture = { actor: { id: "mixed-fixture", type: "adult" }, teams: teams("parent"), restricted: true };
    await page.goto(`${origin}/?initial=adult`);
    await page.getByText("Adult query loaded").waitFor();
    await page.waitForFunction(() => (window as any).__life.polls >= 1 && (window as any).__life.wsOpen === 1);
    await page.getByRole("button", { name: "Select Varsity" }).click();
    await page.getByTestId("skin-role-label").waitFor();
    assert.match(await page.getByTestId("skin-role-label").innerText(), /Parent/);
    await page.waitForFunction(() => (window as any).__life.aborted >= 1);
    assert.equal(await page.evaluate(() => (window as any).__life.sockets), 0);
    await page.waitForFunction(() => (window as any).__life.wsOpen === 0);
    const wsAttempts = await page.evaluate(() => (window as any).__life.wsAttempts);
    const settled = report.requests.length;
    await page.waitForTimeout(1250);
    assert.equal(await page.evaluate(() => (window as any).__life.wsAttempts), wsAttempts);
    assert.deepEqual(report.requests.slice(settled).filter(forbidden), []);
    assert.equal((await page.evaluate(() => (window as any).cacheKeys())).some((k: string[]) => k[0] === "/api/adult-fixture"), false);
    await page.getByLabel("Choose active team").selectOption("jv");
    assert.match(await page.getByTestId("skin-role-label").innerText(), /Team Manager/);
    await page.getByLabel("Choose active team").click();
    await page.getByRole("button", {name:/^Adult team/}).click();
    await page.getByText("Adult query loaded").waitFor();
    assert.equal(await page.evaluate(() => (window as any).__life.sockets), 1);
    mark(`Mixed ${width}px: parent/manager/adult transitions; old request aborted, timers stopped, cache removed, adult remounted`);
    // Route changes can precede selection observers by a commit. A school
    // document with an old adult selection must never start adult providers.
    await page.goto(`${origin}/high-school/home?initial=adult`);
    await page.getByTestId("skin-team-recovery").waitFor();
    assert.equal(await page.evaluate(() => (window as any).__life.mounts), 0);
    const handoffStart = report.requests.length;
    await page.getByRole("button", { name: "Use Northfield Varsity as Parent" }).click();
    await page.getByTestId("skin-role-label").waitFor();
    assert.match(await page.getByTestId("skin-role-label").innerText(), /Parent/);
    assert.equal(await page.evaluate(() => (window as any).__life.mounts), 0);
    assert.deepEqual(report.requests.slice(handoffStart).filter(forbidden), []);
    mark(`School handoff ${width}px: stale adult selection never mounts adult providers; approved parent recovery works`);
    fixture = { actor: { id: "revoked-fixture", type: "adult" }, teams: teams("parent"), restricted: true };
    await page.goto(`${origin}/`);
    await page.getByTestId("skin-role-label").waitFor();
    fixture = { ...fixture, teams: fixture.teams.filter(t => t.id !== "varsity") };
    const revokedStart = report.requests.length;
    await page.evaluate(() => (window as any).refreshContext());
    await page.getByTestId("skin-team-recovery").waitFor();
    assert.equal(await page.getByTestId("adult-runtime").count(), 0);
    await page.getByRole("button", { name: "Use Northfield JV as Team Manager" }).click();
    assert.match(await page.getByTestId("skin-role-label").innerText(), /Team Manager/);
    assert.equal(await page.getByTestId("skin-team-recovery").count(), 0);
    assert.equal(await page.evaluate(() => (window as any).__life.mounts), 0);
    assert.deepEqual(report.requests.slice(revokedStart).filter(forbidden), []);
    mark(`Revoked ${width}px: selected membership disappears; chooser recovers to another approved team without reload or adult mounts`);
    fixture = { actor: { id: "another-account-fixture", type: "adult" },
      teams: teams("head_coach").filter(t => t.program_type === "high_school"), restricted: true };
    await page.goto(`${origin}/?initial=prior-account-team`);
    await page.getByTestId("skin-team-recovery").waitFor();
    assert.equal(await page.getByTestId("adult-runtime").count(), 0);
    await page.getByRole("button", { name: "Use Northfield Varsity as Head Coach" }).click();
    assert.match(await page.getByTestId("skin-role-label").innerText(), /Head Coach/);
    assert.equal(await page.evaluate(() => (window as any).__life.mounts), 0);
    mark(`Account switch ${width}px: foreign saved team recovers through authorized chooser without editing storage or reloading`);
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ scope: report.scope, checks: report.checks, browserErrors: report.errors }, null, 2));
} catch(error) {
  console.error(error);
  throw error;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise<void>(resolve => sockets.close(() => resolve()));
  await new Promise<void>(resolve => server.close(() => resolve()));
}

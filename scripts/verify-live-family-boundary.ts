/** Browser-check the actual production boundary with isolated Auth/API adapters.
 * Real hosted DEV Family/HTTP/provider checks are separate; never a live-login claim. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const checks: string[] = [];
const root = process.cwd();
const mocks: Record<string, string> = {
  "@/hooks/useAuth": `export const useAuth=()=>({user:window.fixture.user,isLoading:false});`,
  "@/context/DemoContext": `export const useDemo=()=>({isActive:false});`,
  "@/lib/queryClient": `
    import {QueryClient} from '@tanstack/react-query';
    export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
    window.fixtureClient=queryClient;
    export async function apiRequest(method,url) {
      window.requests.push(url);
      const f=window.fixture;
      if(method!=='GET')window.mutations.push(url);
      if(url.endsWith('/status')) return new Response(JSON.stringify({enrolled:f.enrolled,verified:f.verified}));
      if(url.endsWith('/availability')) return new Response(JSON.stringify({enabled:!new URLSearchParams(location.search).has('off')}));
      if(url.endsWith('/test-access')) return new Response(JSON.stringify({enabled:false}));
      if(url.endsWith('/adult-team-ids')) return new Response(JSON.stringify({teamIds:['owned-adult']}));
      if(url.endsWith('/staff/teams')) return new Response(JSON.stringify({teams:[{id:'owned-review',name:'Owned review team'}]}));
      throw new Error('Unexpected fixture request');
    }
    export const getImageUrl=path=>path;`,
  "@/components/ObjectUploader": `export const ObjectUploader=()=>null;`,
  "@/pages/ParentVerification": `export default function Verify(){return <h1>Parent email verification</h1>}`,
  "@/pages/ResetPassword": `export default function Reset(){return <h1>Recovery route</h1>}`,
  "@/pages/ForgotPassword": `export default function Forgot(){return <h1>Recovery request route</h1>}`,
  "./FamilySetup": `export function FamilySetup({onExit}){return <><h1>Owned private child fixture</h1><button onClick={onExit}>Return to my adult account</button></>}`,
  "./FamilyStaffReview": `export function FamilyStaffReview({teamId}){return <p>Reviewing {teamId}</p>}`,
  "@/components/high-school-skins/TeamSkinBoundary": `export function ProductionSchoolRuntime(){return <h1>School runtime</h1>}`,
  "@/pages/HighSchoolYouthOnboarding": `export default function Onboarding(){return <h1>School onboarding</h1>}`,
};
const result = await build({
  stdin: { contents: `
    import React,{useEffect} from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClientProvider} from '@tanstack/react-query';
    import {queryClient} from '@/lib/queryClient';
    import {parentVerificationSession} from '@/lib/parentVerificationSession';
    import {LiveFamilyBoundary} from '${root}/client/src/components/high-school-family/LiveFamilyBoundary.tsx';
    import Onboarding from '${root}/client/src/pages/Onboarding.tsx';
    const q=new URLSearchParams(location.search),mode=q.get('mode');
    window.requests=[];window.mutations=[];window.adultMounts=0;
    window.fixture={user:mode==='signed-out'?null:{id:'owned-user'},enrolled:mode==='protected'||mode==='verified',verified:mode==='verified'};
    localStorage.setItem('dashboardSelectedType','team');
    localStorage.setItem('dashboardSelectedId',q.get('school')?'owned-school':'owned-adult');
    const token='e30.'+btoa(JSON.stringify({sub:'owned-user',session_id:'owned-session'}))+'.fixture';
    window.clearFixtureProof=()=>{window.fixture.verified=false;parentVerificationSession.clear()};
    if(mode==='verified')parentVerificationSession.save(token,'x'.repeat(43),600);
    function Adult(){useEffect(()=>{window.adultMounts++},[]);
      return mode?.startsWith('incomplete')?<Onboarding familyAccountId={mode==='incomplete'?'owned-user':undefined}/>:<h1>Ordinary adult runtime</h1>}
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}>
      <LiveFamilyBoundary entry={<h1>Sign in</h1>}><Adult/></LiveFamilyBoundary>
    </QueryClientProvider>);`,
    loader: "tsx", resolveDir: root, sourcefile: "family-boundary-browser.tsx" },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic",
  loader: { ".png": "dataurl", ".css": "empty" },
  define: { "import.meta.env": JSON.stringify({ PROD: true, DEV: false }), "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "owned-boundary-fixture",
    setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "fixture" };
        if (args.path.startsWith("@/")) {
          const base = path.join(root, "client/src", args.path.slice(2));
          const file = [".ts", ".tsx", ".js"].map(extension => base + extension).find(existsSync);
          if (file) return { path: file };
        }
        if (args.path.startsWith("@assets/")) return { path: path.join(root, "client/src/assets", args.path.slice(8)) };
      });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        contents: mocks[args.path], loader: "tsx", resolveDir: root,
      }));
    },
  }],
});
const js = result.outputFiles[0].text;
const server = createServer((req, res) => {
  res.setHeader("Content-Type", req.url?.startsWith("/bundle.js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
  res.end(req.url?.startsWith("/bundle.js") ? js : '<!doctype html><div id="root"></div><script type="module" src="/bundle.js"></script>');
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/?mode=incomplete`);
    await page.getByRole("button", { name: "Add a child without finishing my playing profile" }).click();
    await page.getByRole("heading", { name: "Owned private child fixture" }).waitFor();
    assert.equal(await page.evaluate("window.mutations.length"), 0);
    await page.goto(`${origin}/?mode=incomplete-ineligible`);
    await page.getByRole("progressbar", { name: "Profile onboarding progress" }).waitFor({ state: "attached" });
    assert.equal(await page.getByRole("button", { name: "Add a child without finishing my playing profile" }).count(), 0);
    await page.goto(`${origin}/?mode=incomplete&off=1`);
    await page.getByRole("progressbar", { name: "Profile onboarding progress" }).waitFor({ state: "attached" });
    await page.waitForFunction(() => (window as any).fixtureClient.getQueryData(["family-availability", "owned-user"])?.enabled === false);
    assert.equal(await page.getByRole("button", { name: "Add a child without finishing my playing profile" }).count(), 0);
    await page.goto(`${origin}/profile?mode=ordinary`);
    await page.getByRole("heading", { name: "Ordinary adult runtime" }).waitFor();
    await page.goto(`${origin}/high-school/family?mode=protected`);
    await page.getByRole("heading", { name: "Parent email verification" }).waitFor();
    assert.equal(await page.evaluate("window.adultMounts"), 0);
    await page.goto(`${origin}/high-school/family?mode=verified`);
    await page.getByRole("heading", { name: "Owned private child fixture" }).waitFor();
    assert.equal(await page.evaluate("window.adultMounts"), 0);
    await page.getByRole("button",{name:"Return to my adult account",exact:true}).click();
    await page.getByRole("heading",{name:"Ordinary adult runtime"}).waitFor();
    assert.equal(new URL(page.url()).pathname,"/");
    await page.goto(`${origin}/high-school/family?mode=verified`);
    await page.getByRole("heading", { name: "Owned private child fixture" }).waitFor();
    await page.evaluate(`window.fixtureClient.setQueryData(['private-child-data'],{name:'Owned synthetic child'});window.clearFixtureProof()`);
    await page.getByRole("heading", { name: "Parent email verification" }).waitFor();
    assert.equal(await page.getByText("Owned private child fixture").count(), 0);
    assert.equal(await page.evaluate("window.fixtureClient.getQueryData(['private-child-data'])===undefined"), true);
    await page.goto(`${origin}/profile?mode=verified&school=1`);
    await page.getByRole("heading", { name: "Choose an adult team to continue" }).waitFor();
    assert.equal(await page.evaluate("window.adultMounts"), 0);
    await page.getByRole("button", { name: "Return to my adult account" }).click();
    await page.getByRole("heading", { name: "Ordinary adult runtime" }).waitFor();
    await page.goto(`${origin}/high-school/family-review?mode=verified&school=1`);
    await page.getByLabel("Team", { exact: true }).selectOption("owned-review");
    await page.getByText("Reviewing owned-review").waitFor();
    assert.equal(await page.evaluate("window.adultMounts"), 0);
    await page.goto(`${origin}/reset-password?mode=signed-out`);
    await page.getByRole("heading", { name: "Recovery route" }).waitFor();
    assert.equal(await page.evaluate("window.requests.length"), 0);
    assert.deepEqual(errors, []);
    checks.push(`${width}px: incomplete-profile family entry, ineligible/disabled entry hiding, no profile mutations, ordinary access, proof gate, private-data clearing, school isolation, adult return, review and recovery routing`);
    await context.close();
  }
} finally {
  await browser.close(); await new Promise<void>(resolve => server.close(() => resolve()));
}
await mkdir("generated-artifacts/high-school-family", { recursive: true });
await writeFile("generated-artifacts/high-school-family/live-boundary.json", JSON.stringify({
  scope: "Actual production boundary; isolated Auth/API adapters, not a live signed-in acceptance", checks, passed: true,
}, null, 2));
console.log(JSON.stringify({ passed: true, checks }, null, 2));

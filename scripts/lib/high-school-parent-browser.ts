import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";
import { build } from "esbuild";
import { chromium } from "playwright-core";

/**
 * Actual parent page + actual DEV verification service. Only the browser auth
 * session plumbing is injected; a private test-runner mailbox supplies codes.
 * No public code endpoint and no credentials are written into the bundle.
 */
export async function verifyParentBrowser(input: {
  app: Express; origin: string; accessToken: string; newPassword: string;
  lastCode(): string; prepareDelivery(works: boolean): Promise<void>;
  onProgress?(check: string): void;
}) {
  const output = path.resolve("generated-artifacts/high-school-parent-browser");
  await mkdir(output, { recursive: true });
  const store = path.resolve("client/src/lib/parentVerificationSession.ts");
  const page = path.resolve("client/src/pages/ParentVerification.tsx");
  const built = await build({
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env.DEV": "true", "import.meta.env.VITE_ISOLATED_DEVELOPMENT": '"true"',
      "import.meta.env.VITE_API_BASE_URL": '""',
    },
    stdin: {
      resolveDir: process.cwd(), loader: "tsx",
      contents: `import React from 'react';import{createRoot}from'react-dom/client';
        import Page from ${JSON.stringify(page)};
        import{parentVerificationSession as store}from ${JSON.stringify(store)};
        window.__parentTestHeaders=()=>({Authorization:'Bearer '+(window.__parentTestToken||''),...store.headers(window.__parentTestToken)});
        createRoot(document.getElementById('root')).render(<Page/>);`,
    },
    plugins: [{
      name: "private-fixture-auth",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/(?:queryClient|supabase)$/ }, args => ({ path: args.path, namespace: "private-fixture" }));
        b.onLoad({ filter: /.*/, namespace: "private-fixture" }, args => ({
          resolveDir: process.cwd(), loader: "js",
          contents: args.path.endsWith("supabase") ? `
            export const supabase={auth:{
              getSession:async()=>({data:{session:window.__parentTestToken?{access_token:window.__parentTestToken}:null}}),
              signOut:async()=>{window.__parentTestToken=null;return{error:null}}
            }};` : `
            import{parentVerificationSession as store}from ${JSON.stringify(store)};
            export class ApiError extends Error{constructor(status,data){super('Verification failed');this.status=status;this.data=data;}}
            export async function getAuthHeaders(){return{Authorization:'Bearer '+(window.__parentTestToken||''),...store.headers(window.__parentTestToken)};}
            export async function apiRequest(method,url,data){
              const res=await fetch(url,{method,headers:{...await getAuthHeaders(),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
              if(!res.ok)throw new ApiError(res.status,await res.json());return res;
            }`,
        }));
      },
    }],
  });
  const js = built.outputFiles[0].text;
  assert.equal(js.includes(input.accessToken), false);
  await writeFile(path.join(output, "page.js"), js);
  let css = "body{margin:0;font:16px system-ui}main{padding:24px}section{max-width:440px;margin:auto}button,input{font:inherit;padding:12px;box-sizing:border-box}input{width:100%}button{cursor:pointer}[role=alert]{color:#a00}";
  try {
    const assets = path.resolve("dist/public/assets");
    const filename = (await readdir(assets)).find(name => name.endsWith(".css"));
    if (filename) css = await readFile(path.join(assets, filename), "utf8");
  } catch { /* Functional test still works without a previous production build. */ }
  // These routes exist ONLY on the verifier's loopback HTTP server.
  input.app.get("/__parent-ui-test/page.js", (_req, res) => { res.type("application/javascript").send(js); });
  input.app.get("/__parent-ui-test/styles.css", (_req, res) => { res.type("text/css").send(css); });
  input.app.get("/__parent-ui-test", (_req, res) => { res.type("html").send(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__parent-ui-test/styles.css"><div id="root"></div><script src="/__parent-ui-test/page.js"></script>',
  ); });
  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const checks: string[] = [];
  const mark = (value: string) => { checks.push(value); input.onProgress?.(value); };
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(token => { (window as any).__parentTestToken = token; }, input.accessToken);
    const ui = await context.newPage();
    let pageErrors = 0;
    ui.on("pageerror", () => { pageErrors++; });
    await ui.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.origin === input.origin || url.protocol === "data:" ? route.continue() : route.abort();
    });
    await ui.clock.install();
    await ui.goto(`${input.origin}/__parent-ui-test`);
    await ui.getByRole("heading", { name: "Verify you're the parent" }).waitFor();
    assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await ui.screenshot({ path: path.join(output, "phone-locked.png"), fullPage: true });
    mark("actual_parent_page_phone_layout_has_no_horizontal_overflow");
    await input.prepareDelivery(false);
    await ui.getByRole("button", { name: "Email a verification code", exact: true }).click();
    await ui.getByRole("alert").filter({ hasText: "unavailable" }).waitFor();
    assert.equal(await ui.getByLabel("Four-digit email code").count(), 0);
    mark("delivery_failure_shows_error_without_claiming_a_code_was_sent");
    await input.prepareDelivery(true);
    await ui.getByRole("button", { name: "Email a verification code", exact: true }).click();
    await ui.getByLabel("Four-digit email code").waitFor();
    assert.equal(await ui.getByLabel("Four-digit email code").getAttribute("maxlength"), "4");
    assert.equal(await ui.getByLabel("Four-digit email code").getAttribute("autocomplete"), "one-time-code");
    const correct = input.lastCode();
    await ui.getByLabel("Four-digit email code").fill(correct === "0000" ? "0001" : "0000");
    await ui.getByRole("button", { name: "Verify email code", exact: true }).click();
    await ui.getByRole("alert").filter({ hasText: "incorrect" }).waitFor();
    await ui.getByLabel("Four-digit email code").fill(correct);
    await ui.getByRole("button", { name: "Verify email code", exact: true }).click();
    await ui.getByRole("status").filter({ hasText: "unlocked" }).waitFor();
    const allowed = await ui.evaluate(async () => (await fetch("/api/parent-only-fixture", { headers: (window as any).__parentTestHeaders() })).status);
    assert.equal(allowed, 200);
    mark("email_code_entry_unlocks_the_real_session_bound_dev_parent_guard");
    await ui.getByRole("button", { name: "Lock parent controls", exact: true }).click();
    await ui.getByText("Parent controls are locked for this session.", { exact: true }).waitFor();
    const denied = await ui.evaluate(async () => (await fetch("/api/parent-only-fixture", { headers: (window as any).__parentTestHeaders() })).status);
    assert.equal(denied, 403);
    mark("lock_button_revokes_server_authority_and_clears_browser_grant");
    await ui.clock.fastForward(61_000);
    await input.prepareDelivery(true);
    await ui.getByRole("button", { name: "Change password", exact: true }).click();
    await ui.getByRole("button", { name: "Email a verification code", exact: true }).click();
    await ui.getByLabel("Four-digit email code").waitFor();
    await ui.getByLabel("Four-digit email code").fill(input.lastCode());
    await ui.getByRole("button", { name: "Verify email code", exact: true }).click();
    await ui.getByLabel("New shared password", { exact: true }).waitFor();
    await ui.clock.fastForward(121_000);
    await ui.getByRole("alert").filter({ hasText: "approval expired" }).waitFor();
    assert.equal(await ui.getByLabel("New shared password", { exact: true }).count(), 0);
    mark("expired_password_approval_removes_the_password_form");
    await input.prepareDelivery(true);
    await ui.getByRole("button", { name: "Email a verification code", exact: true }).click();
    await ui.getByLabel("Four-digit email code").waitFor();
    await ui.getByLabel("Four-digit email code").fill(input.lastCode());
    await ui.getByRole("button", { name: "Verify email code", exact: true }).click();
    await ui.getByLabel("New shared password", { exact: true }).fill(input.newPassword);
    await ui.getByLabel("Confirm shared password", { exact: true }).fill("IntentionalMismatch1!");
    await ui.getByRole("button", { name: "Change shared password", exact: true }).click();
    await ui.getByRole("alert").filter({ hasText: "do not match" }).waitFor();
    await ui.getByLabel("Confirm shared password", { exact: true }).fill(input.newPassword);
    await ui.getByRole("button", { name: "Change shared password", exact: true }).click();
    await ui.getByRole("status").filter({ hasText: "All previous sessions were ended" }).waitFor();
    assert.equal(await ui.getByLabel("New shared password", { exact: true }).count(), 0);
    mark("separate_email_code_password_confirmation_and_real_password_change_complete_in_browser");
    await ui.setViewportSize({ width: 1280, height: 900 });
    await ui.screenshot({ path: path.join(output, "desktop-password-complete.png"), fullPage: true });
    assert.equal(pageErrors, 0);
    mark("desktop_completion_and_browser_javascript_checks_passed");
    await context.close();
    return checks;
  } finally { await browser.close(); }
}

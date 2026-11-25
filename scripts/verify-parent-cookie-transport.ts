/** Real request client and a persistent Chromium profile; synthetic loopback
 * services only. This is not installed-app or real-provider acceptance. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { build } from "esbuild";
import { chromium, type BrowserContext } from "playwright-core";

const api = "/api/high-school/parent-verification";
const token = `fixture.${Buffer.from(JSON.stringify({ sub: "parent", session_id: "session" })).toString("base64url")}.fixture`;
const deviceId = "a".repeat(64);
const frontend = express(), backend = express();
const backendCalls: string[] = [];
let frontendOrigin = "";
for (const app of [frontend, backend]) {
  app.use(express.json());
  app.use("/api", (req, res) => {
    if (app === backend) backendCalls.push(`${req.method} ${req.originalUrl}`);
    res.setHeader("Access-Control-Allow-Origin", frontendOrigin);
    res.setHeader("Access-Control-Allow-Headers", "authorization,content-type,x-parent-device-id,x-parent-verification");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    if (req.path === "/high-school/parent-verification/verify") {
      res.cookie("roster_parent_device", "synthetic-cookie-proof", {
        httpOnly: true, sameSite: "strict", path: "/api", maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.json({ remembered: true, deviceId, expiresInSeconds: 30 * 24 * 60 * 60 });
      return;
    }
    res.json({
      cookie: req.headers.cookie?.includes("roster_parent_device=synthetic-cookie-proof") === true,
      hint: req.get("x-parent-device-id") === deviceId,
      service: app === frontend ? "frontend-proxy" : "backend",
    });
  });
}
const frontendServer = frontend.listen(0, "127.0.0.1");
const backendServer = backend.listen(0, "127.0.0.1");
await Promise.all([frontendServer, backendServer].map(server =>
  new Promise<void>(resolve => server.listening ? resolve() : server.once("listening", resolve))));
frontendOrigin = `http://127.0.0.1:${(frontendServer.address() as { port: number }).port}`;
const backendOrigin = `http://127.0.0.1:${(backendServer.address() as { port: number }).port}`;
const profile = await mkdtemp(path.join(tmpdir(), "parent-cookie-transport-"));
let context: BrowserContext | undefined;
try {
  const root = process.cwd();
  const bundle = await build({
    bundle: true, write: false, platform: "browser", format: "iife",
    alias: { "@": path.join(root, "client/src") },
    define: {
      "import.meta.env": JSON.stringify({ PROD: true, DEV: false, VITE_API_BASE_URL: backendOrigin }),
      "process.env.NODE_ENV": '"production"',
    },
    plugins: [{ name: "synthetic-auth-only", setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, args => ({ path: args.path, namespace: "synthetic-auth" }));
      builder.onLoad({ filter: /.*/, namespace: "synthetic-auth" }, () => ({ loader: "js", contents: `
        export const clearStaleSession=async()=>{throw new Error('Unexpected session clearing')};
        export const supabase={auth:{
          getSession:async()=>({data:{session:{access_token:${JSON.stringify(token)}}}}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
        }};` }));
    } }],
    stdin: { resolveDir: root, contents: `
      import {apiRequest,getQueryFn} from './client/src/lib/queryClient';
      import {parentVerificationSession as store} from './client/src/lib/parentVerificationSession';
      window.fixture={apiRequest,getQueryFn,store,token:${JSON.stringify(token)}};` },
  });
  frontend.get("/bundle.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
  frontend.get("*", (_req, res) => res.type("html").send('<!doctype html><meta charset="UTF-8"><script src="/bundle.js"></script>'));
  const launch = () => chromium.launchPersistentContext(profile, {
    executablePath: "/repl/tools/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  context = await launch();
  let page = await context.newPage();
  await page.goto(frontendOrigin);
  // Preserve the configured direct backend for unrelated, non-parent requests.
  assert.equal(await page.evaluate(async () =>
    (await (await (window as any).fixture.apiRequest("GET", "/api/public-fixture")).json()).service), "backend");
  backendCalls.length = 0;
  const result = await page.evaluate(async endpoint =>
    (await (await (window as any).fixture.apiRequest("POST", endpoint, {})).json()), `${api}/verify`);
  assert.ok((await context.cookies()).some(cookie => cookie.name === "roster_parent_device" && cookie.httpOnly),
    "Parent approval must set its HttpOnly cookie on the frontend origin");
  await page.evaluate(result => {
    const f = (window as any).fixture;
    f.store.remember(f.token, result.deviceId, result.expiresInSeconds);
  }, result);
  const check = async () => {
    for (const endpoint of [`${api}/status`, "/api/high-school/family/state", "/api/ordinary-parent-operation"]) {
      const value = await page.evaluate(async endpoint =>
        (await (await (window as any).fixture.apiRequest("GET", endpoint)).json()), endpoint);
      assert.deepEqual(value, { cookie: true, hint: true, service: "frontend-proxy" });
    }
    const queried = await page.evaluate(async () =>
      (window as any).fixture.getQueryFn({ on401: "throw" })({ queryKey: ["/api/high-school/family/state"] }));
    assert.deepEqual(queried, { cookie: true, hint: true, service: "frontend-proxy" });
  };
  await check();
  await context.close();
  context = await launch();
  page = await context.newPage();
  await page.goto(frontendOrigin);
  await check();
  assert.deepEqual(backendCalls, [], "Parent proof must never bypass the same-origin proxy");
  console.log(JSON.stringify({ outcome: "passed", scope: "Real request client, nonempty API base, persistent Chromium close/reopen; synthetic loopback services, not native acceptance" }));
} finally {
  await context?.close();
  await Promise.all([frontendServer, backendServer].map(server => new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()))));
  await rm(profile, { recursive: true, force: true });
}

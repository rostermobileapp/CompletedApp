import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("family device controls show expiry, revoke only the selected device, and refresh all-device revocation", async () => {
  // Real component and React Query in a disposable browser fixture. No app Auth,
  // hosted services, parent credentials or real-family data are used.
  const result = await build({
    stdin: {
      contents: `import React from "react";
        import {createRoot} from "react-dom/client";
        import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
        import {FamilyDevices} from "./client/src/components/high-school-family/FamilyDevices";
        createRoot(document.getElementById("root")).render(
          <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
            <FamilyDevices actorId="synthetic-parent"/>
          </QueryClientProvider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    plugins: [{
      name: "isolated-api",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/queryClient$/ }, () => ({ path: "fixture-api", namespace: "fixture" }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `export async function apiRequest(method,url,body){
            const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},
              ...(body?{body:JSON.stringify(body)}:{})});
            if(!response.ok)throw new Error("Device request failed");
            return response;
          }`, loader: "js",
        }));
      },
    }],
  });
  const base = "/api/high-school/onboarding";
  const expiry = "2099-12-01T18:30:00.000Z";
  let sessions = [
    { id: "phone", childId: "child", deviceLabel: "Casey's phone", expiresAt: expiry },
    { id: "tablet", childId: "child", deviceLabel: "Casey's tablet", expiresAt: expiry },
    { id: "sibling", childId: "sibling", deviceLabel: "Jamie's phone", expiresAt: expiry },
  ];
  let requests: any[] = [{ id: "request", firstName: "Casey", deviceLabel: "New phone" }];
  let failRevoke = false, failList = false;
  const posts: string[] = [];
  const server = createServer((req, res) => {
    const path = req.url!;
    if (path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<div id="root"></div><script src="/fixture.js"></script>'); return;
    }
    if (path === "/fixture.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(result.outputFiles[0].text); return;
    }
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") {
      posts.push(path);
      if (failRevoke) { res.statusCode = 403; res.end("{}"); return; }
      if (path.endsWith("/devices/phone/revoke")) sessions = sessions.filter(s => s.id !== "phone");
      if (path === `${base}/children/child/revoke`) {
        sessions = sessions.filter(s => s.childId !== "child"); requests = [];
      }
      res.end('{"revoked":true}'); return;
    }
    if (path === `${base}/device-sessions` && failList) { res.statusCode = 403; res.end("{}"); return; }
    res.end(JSON.stringify(
      path === `${base}/children` ? { children: [
        { id: "child", firstName: "Casey", lastName: "Synthetic", canActivate: true },
        { id: "sibling", firstName: "Jamie", lastName: "Synthetic", canActivate: false },
      ] } : path === `${base}/device-sessions` ? { sessions } : { requests },
    ));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${address.port}`);
    const phone = page.getByRole("button", { name: "Sign out Casey's phone for Casey", exact: true });
    await phone.waitFor();
    assert.equal(await page.locator(`time[datetime="${expiry}"]`).count(), 3);
    assert.equal(await page.getByText("No active devices.", { exact: true }).count(), 0);
    failRevoke = true;
    await phone.click();
    await page.getByRole("alert").filter({ hasText: "Device setup could not be completed" }).waitFor();
    assert.equal(await phone.count(), 1);
    failRevoke = false;
    await phone.click();
    await page.getByRole("status").filter({ hasText: "Other devices are unchanged." }).waitFor();
    assert.equal(await phone.count(), 0);
    assert.equal(await page.getByRole("button", { name: "Sign out Casey's tablet for Casey", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Sign out Jamie's phone for Jamie", exact: true }).isEnabled(), true,
      "coverage must not disable device revocation");
    assert.ok(posts.every(path => path === `${base}/children/child/devices/phone/revoke`));
    await page.getByRole("button", { name: "Sign out Casey's devices", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "pending setup codes were revoked" }).waitFor();
    assert.equal(await page.getByText("No active devices.", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Sign out Casey's tablet for Casey", exact: true }).count(), 0);
    assert.equal(await page.getByText("Approve Casey's phone?", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Sign out Jamie's phone for Jamie", exact: true }).count(), 1);
    failList = true;
    await page.reload();
    await page.getByRole("alert").filter({ hasText: "Device access could not be checked" }).waitFor();
    assert.equal(await page.getByText("No active devices.", { exact: true }).count(), 0,
      "failed listing must not be presented as an empty device list");
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

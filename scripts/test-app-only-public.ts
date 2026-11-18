/** Signed-out APP checks. No login, provider mutation, or real API requests. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";
import { APP_ORIGIN, WEBSITE_ORIGIN, MARKETING_REDIRECT_PATHS } from "../shared/appWebPolicy";

const origin = process.env.APP_PUBLIC_TEST_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
assert.ok(!origin.includes("undefined"), "Set APP_PUBLIC_TEST_ORIGIN to the APP preview");
for (const path of MARKETING_REDIRECT_PATHS) {
  const query = "?ref=FIXTURE&utm_source=separation&value=a%26b";
  const response = await fetch(`${origin}${path}${query}`, { redirect: "manual", signal: AbortSignal.timeout(12000) });
  assert.equal(response.status, 301, path);
  assert.equal(response.headers.get("location"), WEBSITE_ORIGIN + path + query);
}
for (const filename of ["apple-app-site-association", "assetlinks.json"]) {
  const response = await fetch(`${origin}/.well-known/${filename}`, { signal: AbortSignal.timeout(12000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),
    await fs.readFile(`client/public/.well-known/${filename}`));
}
const missing = await fetch(`${origin}/app-separation-unknown-fixture`, { redirect: "manual", signal: AbortSignal.timeout(12000) });
assert.equal(missing.status, 404);
console.log("PASS: Real preview HTTP redirects, native files, and unknown-route 404.");

const browser = await chromium.launch({
  executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"],
});
try {
  for (const viewport of [{ width: 402, height: 874 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport });
    const errors: string[] = [];
    // Test the actual signed-out client with all app APIs blocked. No auth bypass.
    await context.route("**/api/**", route => route.abort());
    await context.route("**/*", route => route.request().method() === "POST" ? route.abort() : route.fallback());
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(20000);
    page.on("pageerror", error => errors.push(error.message));
    for (const path of ["/", "/login", "/app"]) {
      await page.goto(origin + path, { waitUntil: "domcontentloaded" });
      await page.getByTestId("button-login-initial").waitFor();
      assert.equal(await page.locator(".partner-hero, .rp-nav, .scroll-story").count(), 0);
      assert.ok((await page.locator('link[rel="canonical"]').getAttribute("href"))?.startsWith(APP_ORIGIN));
      assert.equal(await page.locator('link[rel~="canonical"]').count(), 1);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute("target"), null);
      assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
      console.log(`PASS: ${viewport.width}px ${path} Login and APP metadata.`);
    }
    for (const path of ["/privacy-policy", "/privacy", "/terms-of-service", "/terms"]) {
      const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200, path);
      await page.getByTestId(path === "/privacy" ? "privacy-page" :
        path === "/privacy-policy" ? "privacy-policy-page" : "terms-of-service-page").waitFor();
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), APP_ORIGIN + path);
      assert.ok(!await page.locator(`a[href="${WEBSITE_ORIGIN}/"]`).count());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, path);
      console.log(`PASS: ${viewport.width}px ${path} public legal page and APP metadata.`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("PASS: Actual preview redirects, unchanged native JSON/MIME, real 404, and phone/desktop Login/legal routes. All browser APIs and POSTs blocked.");
} finally {
  await browser.close();
}

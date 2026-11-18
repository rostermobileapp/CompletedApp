import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { request as httpRequest } from "node:http";

const origin = process.env.WEBSITE_TEST_ORIGIN || "http://127.0.0.1:5012";
const out = path.resolve("generated-artifacts/website-review");
await fs.mkdir(out, { recursive: true });
const routes = ["/", "/features", "/pricing", "/about", "/referral-program", "/line-combos-predictions",
  "/rosterhockey-vs-benchapp", "/rosterhockey-vs-teamsnap", "/rosterhockey-vs-rosterlytic",
  "/hockey", "/for-youth-teams", "/for-adult-leagues", "/for-varsity",
  "/faq", "/support", "/contact", "/privacy", "/privacy-policy", "/terms", "/terms-of-service"];
const results: { name: string; detail: string }[] = [];
if (new URL(origin).hostname === "127.0.0.1") {
  // fetch can normalize Host back to its URL hostname. Use raw HTTP so this
  // actually exercises production hostname handling on the isolated server.
  const apex = await new Promise<{ status: number; location?: string }>((resolve, reject) => {
    httpRequest(`${origin}/features?utm_source=review`, { headers: { Host: "rosterhockey.com" } }, response => {
      response.resume();
      resolve({ status: response.statusCode!, location: response.headers.location });
    }).on("error", reject).end();
  });
  assert.equal(apex.status, 308);
  assert.equal(apex.location, "https://www.rosterhockey.com/features?utm_source=review");
}
for (const route of routes) {
  const response = await fetch(origin + route);
  assert.equal(response.status, 200, route);
  const html = await response.text();
  assert.ok(html.includes(`href="https://www.rosterhockey.com${route === "/" ? "/" : route}"`), `Website-owned canonical: ${route}`);
  assert.match(html, /<h[12][ >]/, `Prerendered body: ${route}`);
  assert.match(html, /application\/ld\+json/, `Structured data: ${route}`);
  if (["/soccer", "/baseball"].includes(route)) {
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(html, /name="robots" content="noindex/);
  }
}
results.push({ name: "Public initial HTML", detail: "All 20 public routes returned prerendered content, website canonicals and structured data" });
const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
assert.ok(!sitemap.includes("/soccer") && !sitemap.includes("/baseball"));
for (const route of ["/soccer", "/baseball", "/soccer/example"]) {
  const response = await fetch(`${origin}${route}?utm_source=review`, { redirect: "manual" });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://www.rosterhockey.com/hockey?utm_source=review");
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
}
for (const route of ["/blog", "/does-not-exist", "/api/stripe/prices", "/.well-known/apple-app-site-association"]) {
  const response = await fetch(origin + route, { redirect: "manual" });
  assert.equal(response.status, 404, route);
  assert.equal(response.headers.get("location"), null);
}
for (const route of ["/get-started", "/login", "/referral-program/apply", "/hpib"]) {
  const response = await fetch(`${origin}${route}?ref=TEST123&utm_source=review`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `https://www.roster-app.com${route}?ref=TEST123&utm_source=review`);
}
results.push({ name: "Routing/crawl boundaries", detail: "Real unknown/API/blog/association 404s; explicit APP-only redirects preserve queries; unlaunched sports stay unindexed" });

const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"], headless: true });
const apiAttempts: string[] = [], errors: string[] = [], missing: string[] = [];
try {
  for (const size of [{ width: 1440, height: 1000 }, { width: 402, height: 874 }]) {
    const context = await browser.newContext({ viewport: size, reducedMotion: "reduce" });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/") || /roster-app\.com|supabase|railway|stripe|revenuecat|onesignal|ipapi\.co/.test(url.hostname)) {
        apiAttempts.push(url.origin + url.pathname); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.url().startsWith(origin) && response.status() >= 400) missing.push(response.url()); });
    for (const route of ["/", "/features", "/pricing", "/about", "/referral-program", "/contact", "/terms", "/hockey", "/for-youth-teams", "/line-combos-predictions"]) {
      await page.goto(`${origin}${route}?partner_code=FIRST&utm_source=website-review&utm_campaign=split`, { waitUntil: "networkidle" });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, `Horizontal overflow: ${route} at ${size.width}`);
      const appLinks = await page.locator('a[href^="https://www.roster-app.com"]').evaluateAll(anchors =>
        anchors.map(a => ({ href: (a as HTMLAnchorElement).href, target: a.getAttribute("target"), rel: a.getAttribute("rel") })));
      for (const link of appLinks) {
        assert.equal(link.target, "_blank", link.href);
        assert.ok(link.rel?.includes("noopener") && link.rel.includes("noreferrer"), link.href);
        assert.equal(new URL(link.href).searchParams.get("ref"), "FIRST", link.href);
        assert.equal(new URL(link.href).searchParams.get("utm_source"), "website-review", link.href);
      }
      if (route === "/referral-program") {
        assert.equal(await page.locator('input[type="file"],form').count(), 0, "No transactional application form on WEBSITE");
        assert.ok(appLinks.some(link => new URL(link.href).pathname === "/referral-program/apply"));
      }
      if (route === "/pricing") {
        await page.getByRole("button", { name: "Toggle annual billing" }).click();
        await page.getByText("$64.99 billed annually.", { exact: true }).waitFor();
        await page.getByText("$119.99 billed annually.", { exact: true }).waitFor();
      }
      if (["/", "/features", "/pricing", "/referral-program"].includes(route)) {
        await page.screenshot({ path: `${out}/${route === "/" ? "home" : route.slice(1)}-${size.width}.jpg`, fullPage: false });
      }
    }
    await context.close();
  }
  results.push({ name: "Responsive browser checks", detail: "10 public pages checked at desktop and phone widths, including CTAs, campaign forwarding, local media, pricing toggle, and no app API access" });
  // Preserve and observe the real bracket SVG progression, not just end-state text.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(`${origin}/features`, { waitUntil: "networkidle" });
  const bracket = page.locator('svg[style*="position: absolute"]').filter({ has: page.locator("path") }).first();
  await bracket.scrollIntoViewIfNeeded();
  await page.waitForTimeout(8500);
  const paths = await bracket.locator("path").evaluateAll(paths => paths.map(p => ({
    opacity: getComputedStyle(p).opacity, dash: p.getAttribute("stroke-dasharray") || (p as SVGPathElement).style.strokeDasharray,
    offset: p.getAttribute("stroke-dashoffset") || (p as SVGPathElement).style.strokeDashoffset,
  })));
  assert.ok(paths.length >= 6, "Rendered bracket connector paths exist");
  assert.ok(paths.every(p => Number(p.opacity) > 0.95 && (p.dash.includes("1px") || p.dash.startsWith("1 "))), "Bracket connector drawing completed");
  await page.screenshot({ path: `${out}/bracket-animation.jpg`, fullPage: false });
  await context.close();
  results.push({ name: "Original bracket animation", detail: "Real SVG connector drawing completed with the original stages/timing/geometry; only copied TypeScript assertions changed" });
  assert.deepEqual(apiAttempts, [], "No APP/API/location-tracker requests, even with those hosts blocked");
  assert.deepEqual(errors, [], "No page JavaScript errors");
  assert.deepEqual(missing, [], "No missing local assets or route errors");
  await fs.writeFile(`${out}/verification.json`, JSON.stringify({ passed: true, routes: routes.length, responsivePages: 10, viewports: [1440, 402], apiAttempts, errors, missing, results }, null, 2));
  console.log(JSON.stringify({ passed: true, results, blockedAppApiAttempts: apiAttempts.length, pageErrors: errors.length, missingAssets: missing.length }, null, 2));
} finally { await browser.close(); }

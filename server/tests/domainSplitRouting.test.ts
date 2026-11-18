import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_ORIGIN, MARKETING_REDIRECT_PATHS, WEBSITE_ORIGIN } from "../../shared/appWebPolicy";
const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));

test("hosting config and actual server share the exact marketing redirect allowlist", () => {
  const rule = config.redirects.find((r: any) => r.destination === `${WEBSITE_ORIGIN}/:path`);
  assert.equal(rule.statusCode, 301);
  const pattern = new RegExp(`^/(?:${rule.source.slice("/:path(".length, -1)})$`);
  for (const path of MARKETING_REDIRECT_PATHS) assert.ok(pattern.test(path), path);
  for (const path of ["/", "/login", "/signup", "/get-started", "/privacy", "/privacy-policy", "/terms",
    "/terms-of-service", "/hpib", "/referral-program/apply", "/referral-program/verify",
    "/referral-program/portal", "/referral-program/portal/login", "/admin/referrals",
    "/api/referral/apply", "/.well-known/apple-app-site-association", "/sitemap.xml", "/robots.txt",
    "/llms.txt", "/game/fixture", "/features/subpage", "/made-up"]) assert.equal(pattern.test(path), false, path);
  assert.ok(config.redirects.every((r: any) => !r.destination.startsWith(APP_ORIGIN)), "No old website-to-APP catch-all");
  assert.ok(!config.rewrites.some((r: any) => r.source === "/:path*" || r.source === "/(.*)"));
});
test("APP-only public documents keep their own initial metadata; API and association transport stay intact", () => {
  for (const path of ["/login", "/privacy", "/privacy-policy", "/terms", "/terms-of-service",
    "/referral-program/apply", "/referral-program/verify", "/referral-program/portal",
    "/referral-program/portal/login", "/hpib"]) {
    assert.equal(config.rewrites.find((r: any) => r.source === path)?.destination, `${path}/index.html`);
  }
  assert.equal(config.rewrites.find((r: any) => r.source === "/api/:path*").destination,
    "https://completedapp-production.up.railway.app/api/:path*");
  assert.equal(config.rewrites.find((r: any) => r.source === "/.well-known/:file*").destination, "/.well-known/:file*");
  assert.equal(config.headers.find((r: any) => r.source === "/.well-known/apple-app-site-association").headers[0].value, "application/json");
  const login = config.headers.find((r: any) => r.source === "/login");
  assert.equal(login.headers[0].value, "index, follow");
  assert.ok(config.headers.some((r: any) => r.has?.some((h: any) => String(h.value).includes("vercel")) &&
    r.headers.some((h: any) => h.key === "X-Robots-Tag" && h.value.includes("noindex"))));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { appDocumentHeaders, isAppDocument, serveAppWebRouting } from "../appWebRouting";
import { APP_ORIGIN, WEBSITE_ORIGIN, APP_CRAWL_FILES, MARKETING_REDIRECT_PATHS, appDocumentHtml, appRobots, marketingDestination } from "../../shared/appWebPolicy";
import { PROTECTED_APP_ROUTES } from "../../client/src/lib/appRouteEntry";

test("every existing authenticated/notification route has a document entry on cold load", () => {
  for (const route of PROTECTED_APP_ROUTES) {
    const path = route.replace(/:[^/]+/g, "fixture");
    assert.equal(isAppDocument(path), true, path);
  }
});

test("real HTTP redirects are exact and preserve encoded query values without an API/auth fallback", async () => {
  const app = express();
  serveAppWebRouting(app);
  app.get("*", (req, res) => {
    if (!isAppDocument(req.path)) return res.status(404).send("Not found");
    return res.set(appDocumentHeaders(req)).send(appDocumentHtml('<html><head><title>APP</title></head><body><div id="root"></div></body></html>', req.path));
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const route of MARKETING_REDIRECT_PATHS) {
      for (const suffix of ["", "/"]) {
        const query = "?ref=FIXTURE&utm_source=review&value=a%26b&value=two";
        const response = await fetch(`${origin}${route}${suffix}${query}`, { redirect: "manual" });
        assert.equal(response.status, 301, route);
        assert.equal(response.headers.get("location"), `${WEBSITE_ORIGIN}${route}${query}`);
        const head = await fetch(`${origin}${route}${suffix}${query}`, { method: "HEAD", redirect: "manual" });
        assert.equal(head.status, 301);
        assert.equal(await head.text(), "");
      }
    }
    for (const route of ["/", "/login", "/app", "/get-started", "/forgot-password", "/reset-password",
      "/privacy", "/privacy-policy", "/terms", "/terms-of-service", "/hpib", "/referral-program/apply",
      "/referral-program/verify", "/referral-program/portal", "/referral-program/portal/login",
      "/referral-program/portal/auth", "/referral-program/portal/set-password", "/referral-program/portal/forgot-password",
      "/admin/referrals", "/admin/referrals/login", "/admin/referrals/partner/fixture",
      "/game/fixture", "/team/fixture", "/scrimmage/fixture", "/messages", "/messages/fixture",
      "/payment-requests/fixture", "/settings/billing", "/subscriptions", "/admin/organizer-card-payments"]) {
      const response = await fetch(`${origin}${route}?token=DO_NOT_COPY`, { redirect: "manual" });
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get("location"), null, route);
      const html = await response.text();
      assert.ok(html.includes(`href="${APP_ORIGIN}${route}"`), route);
      assert.ok(!html.includes("DO_NOT_COPY"));
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    for (const route of ["/blog", "/not-a-page", "/features/subpage", "/api/not-a-page", "/referral-program/portal/made-up",
      "/game/fixture/edit", "/team/fixture/create", "/user/fixture/tournaments", "/league/fixture", "/media/fixture"]) {
      const response = await fetch(`${origin}${route}`, { redirect: "manual" });
      assert.equal(response.status, 404, route);
      assert.equal(response.headers.get("location"), null);
    }
    for (const [pathname, expected] of Object.entries(APP_CRAWL_FILES)) {
      const response = await fetch(origin + pathname);
      assert.equal(await response.text(), expected.body);
      assert.ok(response.headers.get("content-type")?.startsWith(expected.contentType.split(";")[0]));
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("only actual login is indexable and app HTML contains no website content or token", () => {
  assert.equal(appRobots("/login"), "index, follow");
  assert.equal(appRobots("/login", true), "noindex, nofollow");
  for (const path of ["/", "/signup", "/get-started", "/privacy", "/terms", "/referral-program/apply", "/game/fixture"]) {
    assert.equal(appRobots(path), "noindex, nofollow");
  }
  const source = '<html><head><title>Marketing</title><meta name="description" content="Old"><meta property="og:url" content="https://www.rosterhockey.com/"><link rel="canonical" href="https://www.rosterhockey.com/"></head><body><div id="root"></div></body></html>';
  const login = appDocumentHtml(source, "/login?token=SECRET");
  assert.match(login, /Log In \| RosterHockey/);
  assert.match(login, /name="robots" content="index, follow"/);
  assert.ok(!login.includes("SECRET") && !login.includes("www.rosterhockey.com"));
  assert.equal(marketingDestination("/referral-program/apply"), null);
  assert.equal(marketingDestination("/privacy"), null);
});

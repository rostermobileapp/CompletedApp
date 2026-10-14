import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { serveCrawlabilityFiles } from "../crawlabilityFiles";
import { serveStatic } from "../vite";

test("crawler files have explicit content types and never fall through to the SPA", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "roster-crawlability-"));
  const robots = "User-agent: *\nAllow: /\nSitemap: https://www.roster-app.com/sitemap.xml\n";
  const sitemap = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>';
  await writeFile(path.join(root, "robots.txt"), robots);
  await writeFile(path.join(root, "sitemap.xml"), sitemap);
  const app = express();
  serveCrawlabilityFiles(app, root);
  app.get("*", (_req, res) => res.type("html").send("<div>SPA shell</div>"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const [file, type, body] of [
      ["robots.txt", "text/plain", robots],
      ["sitemap.xml", "application/xml", sitemap],
    ]) {
      const response = await fetch(`${origin}/${file}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("content-type")?.startsWith(type));
      assert.equal(await response.text(), body);
      const head = await fetch(`${origin}/${file}`, { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.ok(head.headers.get("content-type")?.startsWith(type));
      assert.equal(await head.text(), "");
      await rm(path.join(root, file));
      const missing = await fetch(`${origin}/${file}`);
      assert.equal(missing.status, 404);
      assert.equal(await missing.text(), `Unable to serve ${file}`);
    }
    assert.match(await (await fetch(`${origin}/app`)).text(), /SPA shell/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("production static serving keeps clean prerendered URLs and SPA/404 boundaries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "roster-static-pages-"));
  await mkdir(path.join(root, "faq"));
  await mkdir(path.join(root, "soccer"));
  await mkdir(path.join(root, "baseball"));
  await writeFile(path.join(root, "index.html"), "<h1>Homepage</h1>");
  await writeFile(path.join(root, "faq", "index.html"), "<h1>FAQ</h1><p>Initial HTML answer</p>");
  for (const sport of ["soccer", "baseball"]) {
    await writeFile(path.join(root, sport, "index.html"), `<meta name="robots" content="noindex"><h1>${sport}</h1>`);
  }
  const app = express();
  serveStatic(app, root);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const faq = await fetch(`${origin}/faq`, { redirect: "manual" });
    assert.equal(faq.status, 200);
    assert.match(await faq.text(), /Initial HTML answer/);
    assert.equal(faq.headers.get("x-robots-tag"), null);
    for (const sport of ["soccer", "baseball"]) {
      for (const suffix of ["", "/", "/index.html"]) {
        const response = await fetch(`${origin}/${sport}${suffix}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("x-robots-tag"), "noindex");
        assert.match(await response.text(), /<meta name="robots" content="noindex">/);
      }
    }
    const slash = await fetch(`${origin}/faq/?source=crawl`, { redirect: "manual" });
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.get("location"), "/faq?source=crawl");
    assert.match(await (await fetch(`${origin}/login`)).text(), /Homepage/);
    const missing = await fetch(`${origin}/not-a-page`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Page not found/);
    assert.equal((await fetch(`${origin}/robots.txt`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

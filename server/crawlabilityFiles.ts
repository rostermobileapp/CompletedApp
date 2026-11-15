import type { Express } from "express";
import path from "node:path";

// Exact routes must run before Vite/static middleware and every SPA fallback.
// A missing build artifact is a real 404, never a 200 HTML app shell.
export function serveCrawlabilityFiles(app: Express, publicDir: string) {
  for (const [filename, contentType] of [
    ["robots.txt", "text/plain; charset=utf-8"],
    ["sitemap.xml", "application/xml; charset=utf-8"],
  ]) {
    app.get(`/${filename}`, (_req, res, next) => {
      res.type(contentType).set("Cache-Control", "public, max-age=0, must-revalidate");
      res.sendFile(path.resolve(publicDir, filename), (error) => {
        if (!error) return;
        if (res.headersSent) return next(error);
        res.status((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500)
          .type("text/plain").send(`Unable to serve ${filename}`);
      });
    });
  }
}

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".woff2": "font/woff2", ".woff": "font/woff" };
const appPaths = new Set(["/login", "/signup", "/get-started", "/forgot-password", "/reset-password", "/hpib", "/referral-program/apply", "/referral-program/verify", "/referral-program/portal", "/referral-program/portal/login", "/referral-program/portal/auth", "/referral-program/portal/set-password", "/referral-program/portal/forgot-password"]);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://website.invalid");
    if ((req.headers.host || "").split(":")[0].toLowerCase() === "rosterhockey.com") {
      res.writeHead(308, { Location: `https://www.rosterhockey.com${url.pathname}${url.search}` });
      return res.end();
    }
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
    if (/^\/(?:soccer|baseball)(?:\/|$)/.test(pathname)) {
      res.writeHead(301, { Location: `https://www.rosterhockey.com/hockey${url.search}`, "X-Robots-Tag": "noindex, follow" });
      return res.end();
    }
    if (appPaths.has(pathname)) { res.writeHead(302, { Location: `https://www.roster-app.com${pathname}${url.search}` }); return res.end(); }
    let file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}/`)) { res.writeHead(400); return res.end(); }
    let status = 200;
    try {
      const stat = await fs.stat(file);
      if (stat.isDirectory()) file = path.join(file, "index.html");
      await fs.access(file);
    } catch { file = path.join(root, "404.html"); status = 404; }
    const headers = { "Content-Type": types[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" };
    if (["/soccer", "/baseball"].includes(pathname) || status === 404) headers["X-Robots-Tag"] = "noindex, follow";
    res.writeHead(status, headers);
    if (req.method === "HEAD") return res.end();
    res.end(await fs.readFile(file));
  } catch { res.writeHead(400); res.end("Bad request"); }
});
server.listen(Number(process.env.PORT || 5000), "0.0.0.0", () => console.log(`Standalone WEBSITE on port ${process.env.PORT || 5000}`));

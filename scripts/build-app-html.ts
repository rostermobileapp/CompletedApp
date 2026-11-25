import fs from "node:fs/promises";
import path from "node:path";
import { APP_CRAWL_FILES, appDocumentHtml } from "../shared/appWebPolicy";

const output = path.resolve("dist/public");
const template = await fs.readFile(path.join(output, "index.html"), "utf8");
// Metadata only. Never renders a marketing page or initializes services at build time.
await fs.writeFile(path.join(output, "index.html"), appDocumentHtml(template, "/"));
const publicEntries = ["/login", "/app", "/get-started", "/forgot-password", "/reset-password", "/under-18", "/under-18/code",
  "/privacy", "/privacy-policy", "/terms", "/terms-of-service", "/hpib",
  "/referral-program/apply", "/referral-program/verify", "/referral-program/portal",
  "/referral-program/portal/login", "/referral-program/portal/auth",
  "/referral-program/portal/set-password", "/referral-program/portal/forgot-password",
  "/admin/referrals/login"];
for (const route of publicEntries) {
  const file = path.join(output, route, "index.html");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, appDocumentHtml(template, route));
}
for (const [pathname, file] of Object.entries(APP_CRAWL_FILES)) {
  await fs.writeFile(path.join(output, pathname), file.body);
}
console.log("Built APP-only metadata and crawl output; no website prerender or APP services used.");

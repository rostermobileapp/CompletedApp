import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const folder = path.resolve("generated-artifacts/website-export");
const archive = path.resolve("generated-artifacts/RosterHockey-Website.zip");
const verification = JSON.parse(await fs.readFile("generated-artifacts/website-review/verification.json", "utf8"));
const form = JSON.parse(await fs.readFile("generated-artifacts/website-review/partner-form-verification.json", "utf8"));
assert.equal(verification.passed, true);
assert.equal(form.passed, true);
const manifest = JSON.parse(await fs.readFile(path.join(folder, "COPY-MANIFEST.json"), "utf8"));
const previous = new Map<string, { source: string }>(manifest.files.map((f: any) => [f.destination, f]));
await fs.writeFile(path.join(folder, "HANDOFF-VERIFICATION.json"), JSON.stringify({
  website: verification, appOwnedPartnerForm: form,
  install: "npm ci, check and production build passed in a fresh directory outside APP with only PATH, HOME and CI set",
  published: false, appFilesDeleted: 0, newReplitProjectCreated: false,
  remaining: "Import ZIP into a new Replit project, verify there, review the proposed APP cleanup, approve publishing separately",
}, null, 2));
const files: string[] = [];
async function walk(dir: string) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, "Export cannot rely on symlinks");
    assert.ok(!["node_modules", "dist", ".git", ".agents", "server"].includes(entry.name), `Forbidden export entry ${entry.name}`);
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file); else files.push(path.relative(folder, file));
  }
}
await walk(folder);
for (const file of files) {
  assert.ok(!/\.env(?!\.example)|\.(?:pem|p8|key)$|google-services\.json|service.account/i.test(file), `Private config file: ${file}`);
  if (!/\.(?:tsx?|jsx?|mjs|json|html|css)$/.test(file)) continue;
  const source = await fs.readFile(path.join(folder, file), "utf8");
  assert.ok(!/(?:sk_live_|sk_test_|sb_secret_)[A-Za-z0-9]{12,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(source), `Credential pattern found: ${file}`);
  if (file.startsWith("src/")) assert.ok(!/\/api\/|@supabase|@revenuecat|onesignal|ipapi\.co|DATABASE_URL|SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|ANTHROPIC_API_KEY/i.test(source), `APP runtime/config in ${file}`);
}
const pkg = JSON.parse(await fs.readFile(path.join(folder, "package.json"), "utf8"));
for (const key of Object.keys(pkg.dependencies)) assert.ok(!/supabase|stripe|revenuecat|onesignal|drizzle|^pg$|anthropic/.test(key));
const records = [];
for (const destination of files.filter(file => file !== "COPY-MANIFEST.json").sort()) {
  const data = await fs.readFile(path.join(folder, destination));
  records.push({ source: previous.get(destination)?.source || "independent dependency resolution / verification", destination, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
}
await fs.writeFile(path.join(folder, "COPY-MANIFEST.json"), JSON.stringify({ ...manifest, files: records }, null, 2));
// Recreate only our generated archive, never any APP source or data.
await fs.rm(archive, { force: true });
execFileSync("zip", ["-q", "-r", archive, "."], { cwd: folder });
const data = await fs.readFile(archive);
assert.ok(data.length < 200 * 1024 * 1024, "Replit ZIP imports have a 200 MB limit");
await fs.writeFile(`${archive}.sha256`, `${createHash("sha256").update(data).digest("hex")}  RosterHockey-Website.zip\n`);
console.log(JSON.stringify({ archive, files: records.length + 1, bytes: data.length, appFilesRemoved: 0, credentialsCopied: false, runtimeAppApiDependencies: 0 }, null, 2));

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";

const origin = process.env.PARTNER_ENTRY_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
assert.ok(!origin.includes("undefined"), "Set PARTNER_ENTRY_ORIGIN to the APP preview");
const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 402, height: 874 } });
let submissions = 0, succeed = false;
const errors: string[] = [];
try {
  await context.route("**/*", async route => {
    const request = route.request();
    // External fonts/SDKs are irrelevant to form behavior and may keep an
    // isolated candidate loading. Also prevents any provider/account requests.
    if (new URL(request.url()).origin !== new URL(origin).origin) return route.abort();
    if (request.method() !== "POST") return route.continue();
    const url = new URL(request.url());
    if (url.pathname !== "/api/referral/apply") return route.abort();
    assert.equal(url.origin, new URL(origin).origin, "Dedicated APP form must use its own origin, never live production from preview");
    submissions++;
    const body = request.postDataBuffer()!.toString();
    for (const field of ["orgName", "contactName", "email", "orgType", "proofDocument"]) assert.ok(body.includes(`name="${field}"`));
    assert.ok(body.includes("Website Export Fixture"));
    assert.ok(body.includes("fixture@example.invalid"));
    await route.fulfill({ status: succeed ? 200 : 400, contentType: "application/json", body: JSON.stringify({ message: succeed ? "Fixture accepted" : "Fixture validation error" }) });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/referral-program/apply`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Apply to become.*partner/ }).waitFor();
  assert.equal(await page.locator(".partner-hero").count(), 0, "APP entry is the application, not the marketing page");
  await page.getByLabel("Organization name").fill("Website Export Fixture");
  await page.getByLabel("Contact name").fill("Fixture Contact");
  await page.getByLabel("Email address").fill("FIXTURE@example.invalid");
  await page.getByLabel("Organization type").selectOption({ label: "Other" });
  await page.locator('input[type="file"]').setInputFiles({ name: "invalid.webp", mimeType: "image/webp", buffer: Buffer.from("fixture") });
  await page.getByRole("alert").filter({ hasText: "Please upload a JPEG, PNG, or PDF file." }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Submit application" }).isDisabled(), true);
  await page.locator('input[type="file"]').setInputFiles({ name: "proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fixture") });
  await page.getByRole("button", { name: "Submit application" }).click();
  await page.getByRole("alert").filter({ hasText: "Fixture validation error" }).waitFor();
  succeed = true;
  await page.getByRole("button", { name: "Submit application" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();
  assert.equal(submissions, 2);
  assert.deepEqual(errors, []);
  await fs.mkdir("generated-artifacts/website-review", { recursive: true });
  await page.screenshot({ path: "generated-artifacts/website-review/app-partner-form-fixture.jpg", fullPage: true });
  await fs.writeFile("generated-artifacts/website-review/partner-form-verification.json", JSON.stringify({
    passed: true, submissionsIntercepted: submissions, liveApplicationsCreated: 0, emailsSent: 0,
    checks: ["public form loads without login", "marketing content excluded", "invalid file rejected", "relative same-origin multipart endpoint", "canonical field names retained", "server error displayed/retry allowed", "confirmation state retained"],
    errors,
  }, null, 2));
  console.log("PASS: Public APP application, upload validation, same-origin multipart fields, error/retry, and confirmation. Both requests intercepted; no live applications/emails.");
} finally { await browser.close(); }

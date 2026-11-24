import test from "node:test";
import assert from "node:assert/strict";
import { createProductionParentMailer } from "../productionParentMailer";
import { productionFamilyEnrollmentEnabled, productionFamilyInstalled } from "../productionFamilyRuntime";

test("live mail is explicit, purpose-specific and never sends from preview", async () => {
  let calls = 0, payload: any;
  const transport: typeof fetch = async (_url, init) => {
    calls++; payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "accepted-test-id" }), { status: 200 });
  };
  const env = { NODE_ENV: "production", RESEND_API_KEY: "private-test-key", RESEND_FROM_EMAIL: "sender@example.com" };
  const mail = { to: "parent@example.com", code: "0123", purpose: "password_change" as const };
  await createProductionParentMailer(env, transport)(mail);
  assert.match(payload.subject, /password-change/);
  assert.match(payload.text, /0123/); assert.equal(payload.to, mail.to);
  for (const blocked of [{ ...env, NODE_ENV: "development" }, { ...env, NONPRODUCTION_ISOLATED: "1" },
    { ...env, PREVIEW_USE_LIVE_SECRETS: "1" }, { ...env, RESEND_API_KEY: "" }])
    await assert.rejects(() => createProductionParentMailer(blocked, transport)(mail), (e: any) => e.code === "PARENT_EMAIL_DELIVERY_UNAVAILABLE");
  assert.equal(calls, 1);
});
test("provider errors and missing delivery identifiers never count as delivered", async () => {
  const env = { NODE_ENV: "production", RESEND_API_KEY: "private-test-key" };
  for (const response of [new Response("unavailable", { status: 500 }), new Response("{}")]) {
    await assert.rejects(() => createProductionParentMailer(env, async () => response)({
      to: "parent@example.com", code: "1234", purpose: "parent_action",
    }), (e: any) => e.code === "PARENT_EMAIL_DELIVERY_UNAVAILABLE");
  }
});
test("the live enrollment switch never enables DEV, test or live-secret preview", () => {
  assert.equal(productionFamilyEnrollmentEnabled({ NODE_ENV: "production", FAMILY_SETUP_ENABLED: "1" }), true);
  for (const env of [{ NODE_ENV: "development", FAMILY_SETUP_ENABLED: "1" }, { NODE_ENV: "production" },
    { NODE_ENV: "production", FAMILY_SETUP_ENABLED: "1", NONPRODUCTION_ISOLATED: "1" },
    { NODE_ENV: "production", FAMILY_SETUP_ENABLED: "1", PREVIEW_USE_LIVE_SECRETS: "1" }])
    assert.equal(productionFamilyEnrollmentEnabled(env), false);
});
test("an absent live install is compatible, but incomplete protection never fails open", async () => {
  assert.equal(await productionFamilyInstalled({ query: async () => ({ rows: [{ present: false, live: false }] }) }), false);
  await assert.rejects(() => productionFamilyInstalled({ query: async () => ({ rows: [{ present: true, live: false }] }) }));
  let calls = 0;
  await assert.rejects(() => productionFamilyInstalled({ query: async () => ({ rows: [++calls === 1
    ? { present: true, live: true } : { version: true, guards: false, policies: true, api_guard: true, family: true }] }) }));
});

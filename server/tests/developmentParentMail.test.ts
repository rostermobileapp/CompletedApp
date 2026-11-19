import assert from "node:assert/strict";
import test from "node:test";
import { developmentParentMailConfig, allowedDevelopmentParentMail, renderDevelopmentParentEmail } from "../developmentParentMailPolicy";
import { createDevelopmentParentMailer } from "../developmentParentMailer";
import { assertDevelopmentRequest } from "../nonproductionNetwork";
import { isolateDevelopmentEnvironment } from "../nonproductionEnvironment";

const env = {
  NODE_ENV: "development", NONPRODUCTION_ISOLATED: "1", DEV_PARENT_EMAIL_ENABLED: "1",
  DEV_RESEND_API_KEY: "re_synthetic_dev_not_a_real_key",
  DEV_PARENT_EMAIL_FROM: "dev@example.com", DEV_PARENT_EMAIL_ALLOWLIST: "parent@example.com",
};
const config = developmentParentMailConfig(env)!;
const payload = { from: config.from, to: "parent@example.com", ...renderDevelopmentParentEmail("0123", "parent_action") };
test("DEV templates accept exactly four digits including leading zeros and describe two-minute expiry", () => {
  assert.match(payload.text, /code is: 0123/);
  assert.match(payload.text, /expires in 2 minutes/);
  for (const code of ["123", "12345", "12345678", "abcd", " 1234"]) {
    assert.throws(() => renderDevelopmentParentEmail(code, "parent_action"));
  }
  assert.equal(allowedDevelopmentParentMail(config, `Bearer ${config.key}`,
    JSON.stringify({ ...payload, text: payload.text.replace("0123", "01234567") })), false);
});
test("DEV mail requires explicit enablement, isolation, separate credential and at most three recipients", () => {
  assert.equal(developmentParentMailConfig({ ...env, NODE_ENV: "production" }), undefined);
  assert.equal(developmentParentMailConfig({ ...env, PREVIEW_USE_LIVE_SECRETS: "1" }), undefined);
  assert.equal(developmentParentMailConfig({ ...env, DEV_PARENT_EMAIL_ENABLED: "0" }), undefined);
  assert.equal(developmentParentMailConfig({ ...env, NONPRODUCTION_ISOLATED: "0" }), undefined);
  for (const delta of [
    { DEV_RESEND_API_KEY: undefined }, { RESEND_API_KEY: env.DEV_RESEND_API_KEY },
    { DEV_PARENT_EMAIL_ALLOWLIST: "" }, { DEV_PARENT_EMAIL_FROM: "untrusted\nBcc: other@example.com" },
    { DEV_PARENT_EMAIL_ALLOWLIST: "a@example.com,b@example.com,c@example.com,d@example.com" },
  ]) assert.throws(() => developmentParentMailConfig({ ...env, ...delta }));
});
test("the network exception accepts only the exact DEV message, sender, recipient and credential", () => {
  const allow = (body: unknown, key = config.key) => allowedDevelopmentParentMail(config, `Bearer ${key}`, JSON.stringify(body));
  assert.equal(allow(payload), true);
  for (const body of [
    { ...payload, to: "other@example.com" }, { ...payload, to: ["parent@example.com"] },
    { ...payload, from: "live@example.com" }, { ...payload, bcc: "other@example.com" },
    { ...payload, attachments: [] }, { ...payload, text: "arbitrary message" },
    { ...payload, subject: "unapproved topic" }, { ...payload, html: "<p>not allowed</p>" },
  ]) assert.equal(allow(body), false);
  assert.equal(allow(payload, "re_synthetic_wrong_key"), false);
  assert.equal(allowedDevelopmentParentMail(config, `Bearer ${config.key}`, "bad json"), false);
  assert.doesNotThrow(() => assertDevelopmentRequest(new URL("https://api.resend.com/emails"), "https://dev.supabase.co",
    "POST", { Authorization: `Bearer ${config.key}` }, undefined, config, JSON.stringify(payload)));
  for (const url of ["https://api.resend.com/domains", "https://api.resend.com/emails?extra=1", "https://other.example/emails"]) {
    assert.throws(() => assertDevelopmentRequest(new URL(url), "https://dev.supabase.co",
      "POST", { Authorization: `Bearer ${config.key}` }, undefined, config, JSON.stringify(payload)));
  }
  assert.throws(() => assertDevelopmentRequest(new URL("https://api.resend.com/emails"), "https://dev.supabase.co",
    "GET", { Authorization: `Bearer ${config.key}` }, undefined, config, JSON.stringify(payload)));
  assert.throws(() => assertDevelopmentRequest(new URL("https://api.resend.com/emails"), "https://dev.supabase.co",
    "POST", { Authorization: `Bearer ${config.key}` }, undefined, config));
});
test("isolation removes the live mailer and preserves a dedicated key only when explicitly enabled", () => {
  const source = {
    DATABASE_URL: "postgres://postgres:synthetic@db.live-project.supabase.co/postgres",
    SUPABASE_URL: "https://live-project.supabase.co",
    DEV_DATABASE_URL: "postgres://postgres:synthetic@db.dev-project.supabase.co/postgres",
    DEV_SUPABASE_URL: "https://dev-project.supabase.co",
    DEV_SUPABASE_SERVICE_ROLE_KEY: "synthetic", DEV_SUPABASE_ANON_KEY: "synthetic",
    RESEND_API_KEY: "re_synthetic_live_different_key",
    ...env, NONPRODUCTION_ISOLATED: undefined,
  };
  const enabled = isolateDevelopmentEnvironment(source);
  assert.equal(enabled.RESEND_API_KEY, undefined);
  assert.equal(enabled.DEV_RESEND_API_KEY, env.DEV_RESEND_API_KEY);
  assert.equal(isolateDevelopmentEnvironment({ ...source, DEV_PARENT_EMAIL_ENABLED: "0" }).DEV_RESEND_API_KEY, undefined);
});
test("mailer never sends without configuration or outside the recipient allowlist", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ id: "synthetic-message" }), { status: 200 }); };
  try {
    await assert.rejects(() => createDevelopmentParentMailer({})( { to: "parent@example.com", code: "0123", purpose: "parent_action" }));
    await assert.rejects(() => createDevelopmentParentMailer(env)({ to: "other@example.com", code: "0123", purpose: "parent_action" }));
    assert.equal(calls, 0);
    await createDevelopmentParentMailer(env)({ to: "parent@example.com", code: "0123", purpose: "password_change" });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test("provider errors and malformed acceptances return safe failure, not the provider body", async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, body] of [[403, { message: "synthetic-private-error" }], [200, {}]] as const) {
      globalThis.fetch = async () => new Response(JSON.stringify(body), { status });
      await assert.rejects(() => createDevelopmentParentMailer(env)({ to: "parent@example.com", code: "0123", purpose: "parent_action" }),
        (error: any) => error.code === "PARENT_EMAIL_DELIVERY_UNAVAILABLE" && !error.message.includes("synthetic-private-error"));
    }
  } finally { globalThis.fetch = original; }
});

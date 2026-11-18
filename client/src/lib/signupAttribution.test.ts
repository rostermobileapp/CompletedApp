import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignupAttribution, SIGNUP_ATTRIBUTION_KEY } from "./signupAttribution";
import { appAttributionUrl, campaignFromUrl, referralCodesFromUrl, type CapturedPartner } from "../../../shared/signupAttribution";

export function attributionStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const partner = (code: string): CapturedPartner => ({ id: `${code}-id`, code, orgName: `${code} Association` });

test("website app links preserve referral/UTM context, not auth tokens or redirect injection", () => {
  const result = new URL(appAttributionUrl("/get-started?screen=welcome", "https://www.rosterhockey.com/hpib?ref=hpib1234&utm_source=hpib&utm_campaign=winter&campaign_id=c1&access_token=private&redirect=https://evil.test"));
  assert.equal(result.origin, "https://www.roster-app.com");
  assert.equal(result.searchParams.get("ref"), "HPIB1234");
  assert.equal(result.searchParams.get("utm_source"), "hpib");
  assert.equal(result.searchParams.get("utm_campaign"), "winter");
  assert.equal(result.searchParams.get("screen"), "welcome");
  assert.equal(result.searchParams.get("campaign_id"), "c1");
  assert.equal(result.searchParams.has("access_token"), false);
  assert.equal(result.searchParams.has("redirect"), false);
  assert.throws(() => appAttributionUrl("https://evil.test", "/?ref=HPIB1234"));
});

test("forwarding multiple pages preserves original candidate order across aliases", () => {
  const first = appAttributionUrl("/", "https://website.test/?partner_code=FIRST&utm_source=original");
  const forwarded = appAttributionUrl(first, "https://website.test/pricing?ref=SECOND&utm_source=later");
  assert.deepEqual(referralCodesFromUrl(forwarded), ["FIRST", "SECOND"]);
  assert.equal(new URL(forwarded).searchParams.get("utm_source"), "original");
});
test("every documented referral alias is recognized and arbitrary strings are rejected", () => {
  for (const key of ["ref", "referral", "referral_code", "referralCode", "partner", "partner_code", "partnerCode"]) {
    assert.deepEqual(referralCodesFromUrl(`/?${key}=hpib1234`), ["HPIB1234"]);
  }
  assert.deepEqual(referralCodesFromUrl("/?ref=%3Cscript%3E&code=auth-code&utm_referral_code=OTHER"), []);
  assert.equal(campaignFromUrl(`/?utm_source=${"x".repeat(300)}`).utm_source.length, 200);
});

test("invalid referrals do not win; the first valid one survives redirects and later links", async () => {
  const storage = attributionStorage();
  const app = createSignupAttribution(storage, async code => code === "INVALID" ? null : partner(code));
  await app.capture("/?ref=INVALID&partner_code=FIRST&utm_source=hpib");
  await app.capture("/login?ref=SECOND&utm_source=other");
  assert.equal(app.read().partner?.code, "FIRST");
  assert.deepEqual(app.read().campaign, { utm_source: "hpib" });
  const reloaded = createSignupAttribution(storage, async code => partner(code));
  await reloaded.capture("/get-started");
  assert.equal(reloaded.read().partner?.code, "FIRST");
  assert.deepEqual(await reloaded.metadata(), {
    initial_referral: partner("FIRST"), acquisition_campaign: { utm_source: "hpib" },
  });
});

test("a transient validation failure retains the original code ahead of later arrivals", async () => {
  let unavailable = true;
  const storage = attributionStorage();
  const app = createSignupAttribution(storage, async code => {
    if (unavailable) throw new Error("Unavailable"); return partner(code);
  });
  await assert.rejects(app.capture("/?ref=FIRST"));
  unavailable = false;
  await app.capture("/?ref=SECOND");
  assert.equal(app.read().partner?.code, "FIRST");
});

test("concurrent link captures cannot let a later response replace the first valid code", async () => {
  const app = createSignupAttribution(attributionStorage(), async code => partner(code));
  await Promise.all([app.capture("/?ref=FIRST"), app.capture("/?ref=SECOND")]);
  assert.equal(app.read().partner?.code, "FIRST");
});

test("campaign-only traffic never produces partner metadata and pending data is account-bound", async () => {
  const storage = attributionStorage();
  const app = createSignupAttribution(storage, async code => partner(code));
  await app.capture("/?utm_source=PARTNER&utm_referral_code=FAKE");
  assert.equal(app.read().partner, undefined);
  assert.equal("initial_referral" in await app.metadata(), false);
  app.forUser("one");
  assert.equal(app.forUser("two"), null);
  assert.deepEqual(await app.metadata(), {});
  app.clear();
  assert.equal(storage.getItem(SIGNUP_ATTRIBUTION_KEY), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { runInNewContext } from "node:vm";
import {
  assertProductionRuntimeConfiguration, isVerifiedProductionRuntime,
  PRODUCTION_RAILWAY_ENVIRONMENT, PRODUCTION_RAILWAY_SERVICE,
} from "../runtimePolicy";
import { isolateDevelopmentEnvironment } from "../nonproductionEnvironment";
import { assertDevelopmentRequest } from "../nonproductionNetwork";
import { nonproductionHttpGuard } from "../nonproductionHttp";
import { getDatabaseConnectionString } from "../testDatabaseGuard";

const environment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://postgres:synthetic@db.live-project.supabase.co/postgres",
  SUPABASE_URL: "https://live-project.supabase.co",
  VITE_SUPABASE_URL: "https://live-project.supabase.co",
  DEV_DATABASE_URL: "postgres://postgres:synthetic@db.dev-project.supabase.co/postgres",
  DEV_SUPABASE_URL: "https://dev-project.supabase.co",
  DEV_SUPABASE_SERVICE_ROLE_KEY: "synthetic-dev-service",
  DEV_SUPABASE_ANON_KEY: "synthetic-dev-anon",
  REPLIT_DEV_DOMAIN: "sandbox.replit.dev",
  STRIPE_SECRET_KEY: "synthetic-live",
  RESEND_API_KEY: "synthetic-live",
  REVENUECAT_API_KEY: "synthetic-live",
  ONESIGNAL_REST_API_KEY: "synthetic-live",
  REPL_IDENTITY: "synthetic-connector-auth",
  REPLIT_CONNECTORS_HOSTNAME: "connector.example",
  PGHOST: "live-default.example",
  PGPASSWORD: "synthetic-live",
};

test("workers require the verified Railway environment and service, not NODE_ENV alone", () => {
  assert.equal(isVerifiedProductionRuntime({ NODE_ENV: "production" }), false);
  assert.equal(isVerifiedProductionRuntime({
    NODE_ENV: "production",
    RAILWAY_ENVIRONMENT_ID: PRODUCTION_RAILWAY_ENVIRONMENT,
    RAILWAY_SERVICE_ID: PRODUCTION_RAILWAY_SERVICE,
  }), true);
  assert.equal(isVerifiedProductionRuntime({
    NODE_ENV: "production",
    RAILWAY_ENVIRONMENT_ID: "preview",
    RAILWAY_SERVICE_ID: PRODUCTION_RAILWAY_SERVICE,
  }), false);
});

test("production misconfiguration refuses startup instead of silently suppressing workers", () => {
  const production = {
    NODE_ENV: "production",
    RAILWAY_ENVIRONMENT_ID: PRODUCTION_RAILWAY_ENVIRONMENT,
    RAILWAY_SERVICE_ID: PRODUCTION_RAILWAY_SERVICE,
  };
  assert.doesNotThrow(() => assertProductionRuntimeConfiguration(production));
  assert.equal(isVerifiedProductionRuntime(production), true);
  for (const invalid of [
    { ...production, NODE_ENV: undefined },
    { ...production, NODE_ENV: "development" },
    { ...production, NODE_ENV: "test" },
    { ...production, RAILWAY_ENVIRONMENT_ID: undefined },
    { ...production, RAILWAY_ENVIRONMENT_ID: "preview" },
    { ...production, RAILWAY_SERVICE_ID: undefined },
    { ...production, RAILWAY_SERVICE_ID: "another-service" },
    { ...production, NONPRODUCTION_ISOLATED: "1" },
    { ...production, VITE_ISOLATED_DEVELOPMENT: "true" },
    { NODE_ENV: "production" },
    { NODE_ENV: "development", RAILWAY_ENVIRONMENT_ID: "unexpected-environment" },
    { NODE_ENV: "test", RAILWAY_SERVICE_ID: "unexpected-service" },
  ]) {
    assert.throws(() => assertProductionRuntimeConfiguration(invalid),
      { code: "PRODUCTION_RUNTIME_CONFIGURATION_INVALID" });
  }
  assert.doesNotThrow(() => assertProductionRuntimeConfiguration(environment));
  assert.equal(isVerifiedProductionRuntime(environment), false);
});

test("bootstrap rejects a production identity with dev NODE_ENV before isolation or worker imports", () => {
  assert.throws(() => execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "-e",
    "await import('./server/runtimeBootstrap.ts'); console.log('UNSAFE_STARTUP_CONTINUED');",
  ], {
    env: {
      PATH: process.env.PATH, NODE_ENV: "development",
      RAILWAY_ENVIRONMENT_ID: PRODUCTION_RAILWAY_ENVIRONMENT,
      RAILWAY_SERVICE_ID: PRODUCTION_RAILWAY_SERVICE,
    },
    stdio: "pipe",
  }), (error: any) => {
    assert.notEqual(error.status, 0);
    assert.match(error.stderr.toString(), /production workers cannot be silently disabled/);
    assert.doesNotMatch(error.stdout.toString(), /UNSAFE_STARTUP_CONTINUED/);
    return true;
  });
});

test("development maps database/browser/auth together and removes all live provider and connector access", () => {
  const isolated = isolateDevelopmentEnvironment(environment);
  assert.equal(isolated.DATABASE_URL, environment.DEV_DATABASE_URL);
  assert.equal(isolated.SUPABASE_URL, environment.DEV_SUPABASE_URL);
  assert.equal(isolated.VITE_SUPABASE_URL, environment.DEV_SUPABASE_URL);
  assert.equal(isolated.VITE_SUPABASE_ANON_KEY, environment.DEV_SUPABASE_ANON_KEY);
  for (const key of [
    "STRIPE_SECRET_KEY", "RESEND_API_KEY", "REVENUECAT_API_KEY",
    "ONESIGNAL_REST_API_KEY", "REPL_IDENTITY", "REPLIT_CONNECTORS_HOSTNAME",
    "PGHOST", "PGPASSWORD",
  ]) assert.equal(isolated[key], undefined, key);
  assert.equal(environment.DATABASE_URL.includes("live-project"), true);
  assert.deepEqual(isolateDevelopmentEnvironment(isolated), isolated);
  assert.throws(() => isolateDevelopmentEnvironment({ ...environment, DEV_DATABASE_URL: environment.DATABASE_URL }));
  assert.throws(() => isolateDevelopmentEnvironment({ ...environment, DEV_SUPABASE_URL: environment.SUPABASE_URL }));
});

test("standalone dev database clients fail closed rather than falling back to production", () => {
  assert.throws(() => getDatabaseConnectionString({ DATABASE_URL: environment.DATABASE_URL }, ["manual.ts"]));
  assert.equal(getDatabaseConnectionString(environment, ["manual.ts"]), environment.DEV_DATABASE_URL);
  const isolated = isolateDevelopmentEnvironment(environment);
  assert.throws(() => getDatabaseConnectionString({
    ...isolated, NODE_ENV: "test", TEST_DATABASE_URL: environment.DATABASE_URL,
  }, []), /forbidden production/);
});

test("outbound policy permits dev reads/password sessions but denies live hosts and auth email/account mutations", () => {
  const dev = environment.DEV_SUPABASE_URL;
  for (const path of ["/auth/v1/user", "/rest/v1/users", "/storage/v1/object/public/logo"]) {
    assert.doesNotThrow(() => assertDevelopmentRequest(new URL(path, dev), dev));
  }
  assert.doesNotThrow(() => assertDevelopmentRequest(new URL("/auth/v1/token", dev), dev, "POST"));
  for (const path of ["/auth/v1/signup", "/auth/v1/recover", "/auth/v1/otp", "/auth/v1/user", "/auth/v1/%73ignup"]) {
    assert.throws(() => assertDevelopmentRequest(new URL(path, dev), dev, "POST"), /disabled/);
  }
  for (const host of [
    "https://onesignal.com/api/v1/notifications", "https://api.resend.com/emails",
    "https://api.stripe.com/v1/checkout/sessions", "https://api.revenuecat.com/v1/subscribers",
    "https://live-project.supabase.co/auth/v1/user",
  ]) assert.throws(() => assertDevelopmentRequest(new URL(host), dev), /disabled/);
});

test("fetch and native HTTPS guards reject provider calls before any network operation", () => {
  const script = `
    import assert from 'node:assert/strict';
    import https from 'node:https';
    import {installDevelopmentNetworkGuard} from './server/nonproductionNetwork.ts';
    let calls=0;
    globalThis.fetch=async()=>{calls++; return new Response('{}')};
    installDevelopmentNetworkGuard('https://dev-project.supabase.co');
    assert.throws(()=>fetch('https://api.resend.com/emails',{method:'POST'}), /disabled/);
    assert.throws(()=>https.request('https://api.stripe.com/v1/customers'), /disabled/);
    assert.throws(()=>fetch('https://dev-project.supabase.co/auth/v1/recover',{method:'POST'}), /disabled/);
    await fetch('https://dev-project.supabase.co/auth/v1/user');
    assert.equal(calls,1);
  `;
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    env: { PATH: process.env.PATH, NODE_ENV: "test" }, stdio: "pipe",
  });
});

test("development delivery HTTP endpoints reject requests explicitly, while production middleware is unchanged", () => {
  const previous = process.env.NONPRODUCTION_ISOLATED;
  const previousUrl = process.env.SUPABASE_URL;
  try {
    process.env.NONPRODUCTION_ISOLATED = "1";
    process.env.SUPABASE_URL = environment.DEV_SUPABASE_URL;
    for (const path of ["/api/stripe/create-checkout-session", "/api/scrimmages/id/invite", "/api/auth/reset-password"]) {
      let status: number | undefined;
      let body: any;
      let next = false;
      const res = { setHeader() {}, status(value: number) { status = value; return this; }, json(value: any) { body = value; } };
      nonproductionHttpGuard({ method: "POST", path } as any, res as any, () => { next = true; });
      assert.equal(status, 503);
      assert.equal(body.code, "NONPRODUCTION_DELIVERY_DISABLED");
      assert.equal(next, false);
    }
    delete process.env.NONPRODUCTION_ISOLATED;
    let next = false;
    nonproductionHttpGuard({ method: "POST", path: "/api/stripe/webhook" } as any, {} as any, () => { next = true; });
    assert.equal(next, true);
  } finally {
    if (previous === undefined) delete process.env.NONPRODUCTION_ISOLATED;
    else process.env.NONPRODUCTION_ISOLATED = previous;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
  }
});

test("browser and native policy blocks delivery and off-target fetch/XHR/WebSocket before transport", () => {
  const output = buildSync({
    entryPoints: ["client/src/lib/nonproductionSafety.ts"], bundle: true, write: false, format: "cjs",
    define: { "import.meta.env": JSON.stringify({
      DEV: true, VITE_ISOLATED_APP_ORIGIN: "https://sandbox.replit.dev",
      VITE_SUPABASE_URL: environment.DEV_SUPABASE_URL,
    }) },
  }).outputFiles[0].text;
  let calls = 0;
  class Socket { constructor(_url?: string) { calls++; } }
  class XHR { open(_method?: string, _url?: string) { calls++; } }
  const module = { exports: {} as any };
  const window = {
    location: { href: "https://sandbox.replit.dev/" },
    fetch: async (_url?: string) => { calls++; return {}; }, WebSocket: Socket,
  };
  runInNewContext(output, { module, exports: module.exports, window, XMLHttpRequest: XHR, navigator: {}, URL });
  assert.throws(() => module.exports.assertClientDeliveryAllowed(), /disabled/);
  assert.throws(() => window.fetch("https://api.stripe.com/v1/customers"), /disabled/);
  assert.throws(() => new window.WebSocket("wss://production.example/ws"), /disabled/);
  assert.throws(() => new XHR().open("POST", "https://api.resend.com/emails"), /disabled/);
  assert.equal(calls, 0);
  assert.doesNotThrow(() => new window.WebSocket("wss://sandbox.replit.dev/ws"));
  assert.equal(calls, 1);
});

test("isolated native purchase, restore, identity and raw attribute paths never reach the bridge", async () => {
  const output = buildSync({
    entryPoints: ["client/src/lib/nativePurchases.ts"], bundle: true, write: false,
    format: "cjs", external: ["natively"],
    define: { "import.meta.env": JSON.stringify({
      DEV: true, VITE_ISOLATED_APP_ORIGIN: "https://sandbox.replit.dev",
      VITE_SUPABASE_URL: environment.DEV_SUPABASE_URL,
    }) },
  }).outputFiles[0].text;
  let bridgeCalls = 0;
  const module = { exports: {} as any };
  class FakeBridge { constructor() { bridgeCalls++; } }
  class Socket {}
  class XHR { open() {} }
  runInNewContext(output, {
    module, exports: module.exports,
    require: (name: string) => {
      assert.equal(name, "natively");
      return { NativelyPurchases: FakeBridge };
    },
    window: {
      location: { href: "https://sandbox.replit.dev/" }, fetch: async () => ({}),
      WebSocket: Socket, natively: { trigger() { bridgeCalls++; } },
    },
    XMLHttpRequest: XHR, navigator: { userAgent: "Natively/Android" }, URL,
    localStorage: { getItem: () => "synthetic-referral" }, setTimeout, clearTimeout,
  });
  const api = module.exports;
  assert.throws(() => api.setSubscriberAttributes({ referral_code: "synthetic" }),
    { code: "NONPRODUCTION_DELIVERY_DISABLED" });
  for (const action of [
    () => api.purchaseProduct("player_pro_monthly"),
    () => api.purchaseProductAndroid("player_pro_monthly"),
    () => api.restorePurchases(), () => api.restorePurchasesAndroid(),
    () => api.readNativePurchaseIdentity(),
    () => api.associateNativePurchaseAccount(`roster_${"a".repeat(64)}`),
  ]) await assert.rejects(action, { code: "NONPRODUCTION_DELIVERY_DISABLED" });
  assert.equal(await api.isBillingSupported(), false);
  assert.equal(await api.isAndroidBillingSupported(), false);
  assert.equal(bridgeCalls, 0);
});

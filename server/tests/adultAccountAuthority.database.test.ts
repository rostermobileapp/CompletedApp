import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { HighSchoolParentSecurity } from "../highSchoolParentSecurity";
import { parentErrorResponse, parentGrantHeader, requireDevParentAuthority } from "../highSchoolParentHttp";

test("actual request logger never includes private school responses or invitation codes", async () => {
  const source = await readFile("server/index.ts", "utf8");
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find(node => node.getText(file).startsWith("app.use(") &&
    node.getText(file).includes("capturedJsonResponse"))!;
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const lines: string[] = [];let middleware: any;
  vm.runInNewContext(compiled, { app: { use: (handler: any) => { middleware = handler; } }, log: (line: string) => lines.push(line) });
  for (const path of ["/api/high-school/leagues/x", "/api/high-school/staff", "/api/high-school/family/x", "/api/high-school/onboarding/lookup"]) {
    let finish: () => void = () => {}, returned: any;
    const body = { secret: "private-fixture-content" };
    const res = { statusCode: 200, on: (_name: string, callback: () => void) => { finish = callback; }, json(value: any) { returned = value;return this; } };
    middleware({ path, method: "POST" }, res, () => res.json(body));finish();
    assert.equal(returned, body);assert.doesNotMatch(lines.at(-1)!, /private-fixture-content|secret| :: /);
    assert.ok(lines.at(-1)!.startsWith(`POST ${path} 200`));
  }
});

/** Executes the actual middleware declaration, without importing production
 * clients or credentials. Only signature/provider verification and user sync
 * are synthetic; account/session and parent proof use disposable real SQL. */
test("adult API authority is independent of Family proof, never of provider authentication or session revocation", async () => {
  const f = await createStaffFixture(), actor = f.actors.parent;
  try {
    const issuer = "https://fixture.example/auth/v1";
    const token = `fixture.${Buffer.from(JSON.stringify({ sub: actor.authId, session_id: actor.sessionId,
      iss: issuer, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
    const security = new HighSchoolParentSecurity(f.pool);
    const source = await readFile("server/supabaseAuth.ts", "utf8");
    const file = ts.createSourceFile("auth.ts", source, ts.ScriptTarget.Latest, true);
    const declaration = file.statements.find(node => ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(value => value.name.getText(file) === "isAuthenticated"))!;
    assert.ok(declaration);
    const compiled = ts.transpileModule(declaration.getText(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    let retired = false, synced = 0, providerCalls = 0;
    const exports: any = {};
    vm.runInNewContext(compiled, {
      exports, console: { log() {}, error() {} }, requireDevParentAuthority, parentErrorResponse, parentGrantHeader,
      parentSecurity: () => security, parentIssuer: () => issuer, onboardingSecurity: () => undefined,
      isRetiredAccount: async () => retired,
      supabase: { auth: { getUser: async (input: string) => {
        providerCalls++;
        return input === token ? { data: { user: { id: actor.authId, email: actor.email, email_confirmed_at: "2026-01-01" } }, error: null }
          : { data: { user: null }, error: { message: "Unverified provider credential" } };
      } } },
      storage: { upsertUser: async (input: any) => {
        assert.equal("role" in input, false);synced++;return { id: actor.authId, email: actor.email, role: "free_tier" };
      } },
    });
    const run = async (credential: string | undefined) => {
      let status = 200, next = false, body: any;
      const req = { method: "POST", path: "/api/leagues", headers: { authorization: credential && `Bearer ${credential}` }, get: () => undefined, header: () => undefined };
      const res = { status(code: number) { status = code;return this; }, json(value: any) { body = value;return this; } };
      await exports.isAuthenticated(req, res, () => { next = true; });
      return { status, next, body, req };
    };
    assert.equal(await security.enrolled(actor.authId), true);
    const adult = await run(token);
    assert.equal(adult.next, true);assert.equal((adult.req as any).user.claims.sub, actor.authId);assert.equal(synced, 1);
    await assert.rejects(requireDevParentAuthority(security, actor.authId, token, issuer), (error: any) => error.code === "PARENT_VERIFICATION_REQUIRED");
    for (const child of ["restricted-child-device-token", `forged.${token.split(".")[1]}.forged`, undefined]) {
      const result = await run(child);assert.equal(result.status, 401);assert.equal(result.next, false);
    }
    assert.equal(synced, 1);assert.equal(providerCalls, 3);
    retired = true;assert.equal((await run(token)).status, 403);retired = false;
    await f.pool.query("DELETE FROM auth.sessions WHERE id=$1", [actor.sessionId]);
    const revoked = await run(token);assert.equal(revoked.status, 401);assert.equal(revoked.next, false);
    assert.equal(synced, 1);
  } finally { await f.close(); }
});

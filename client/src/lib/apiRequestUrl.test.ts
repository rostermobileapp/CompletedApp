import test from "node:test";
import assert from "node:assert/strict";
import { apiRequestUrl } from "./apiRequestUrl";

const backend = "https://backend.example";
test("parent verification establishes and checks first-party cookies through the proxy", () => {
  for (const action of ["challenge", "verify", "status", "password", "revoke", "socket-grant", "forget-device"]) {
    const path = `/api/high-school/parent-verification/${action}`;
    assert.equal(apiRequestUrl(path, backend), path);
  }
  assert.equal(apiRequestUrl("/api/high-school/parent-verification", backend), "/api/high-school/parent-verification");
});
test("remembered parent operations use the proxy, including non-Family operations", () => {
  for (const path of ["/api/high-school/family/state", "/api/user", "/api/teams/fixture"]) {
    assert.equal(apiRequestUrl(path, backend, { "x-parent-device-id": "metadata-only" }), path);
    assert.equal(apiRequestUrl(path, backend, { "X-Parent-Device-Id": "metadata-only" }), path);
  }
});
test("unrelated and legacy temporary-proof requests retain their configured backend", () => {
  for (const headers of [{}, { "x-parent-verification": "temporary-proof" }]) {
    assert.equal(apiRequestUrl("/api/user", backend, headers), `${backend}/api/user`);
  }
  assert.equal(apiRequestUrl("/api/high-school/parent-verification-other", backend),
    `${backend}/api/high-school/parent-verification-other`);
});
test("an empty backend base preserves same-origin development", () => {
  assert.equal(apiRequestUrl("/api/user", ""), "/api/user");
});

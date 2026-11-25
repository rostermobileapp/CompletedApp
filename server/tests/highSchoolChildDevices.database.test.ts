import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { HighSchoolChildDevices } from "../highSchoolChildDevices";
import { HighSchoolParentSecurity, parentDigest } from "../highSchoolParentSecurity";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";

test("parents can list and revoke one child device without affecting any other device", async t => {
  // Loopback-only disposable database; no hosted data or credentials.
  const f = await createStaffFixture();
  const { pool, actors, ids } = f;
  let verified = true;
  const parent = { authorized: async () => verified } as unknown as HighSchoolParentSecurity;
  const service = new HighSchoolChildDevices(pool, parent, true);
  const devices: Record<string, { id: string; token: string; childId: string }> = {};
  try {
    await pool.query("UPDATE hs_onboarding.children SET enabled=true");
    for (const [name, owner, childId] of [
      ["Phone", actors.parent, ids.child1],
      ["Tablet", actors.parent, ids.child1],
      ["Other household", actors.otherParent, ids.child2],
      ["Expired", actors.parent, ids.child1],
      ["Revoked", actors.parent, ids.child1],
      ["Ended approval", actors.parent, ids.child1],
    ] as const) {
      const codeId = randomUUID(), requestId = randomUUID();
      const token = `hs_child_${parentDigest(name).slice(0, 43)}`;
      let approvalId = owner.sessionId;
      if (name === "Ended approval") {
        approvalId = randomUUID();
        await pool.query("INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,now()-interval '1 hour')",
          [approvalId, owner.authId]);
      }
      await pool.query(`INSERT INTO hs_onboarding.device_codes(id,child_id,parent_auth_id,code_digest,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '10 minutes')`, [codeId, childId, owner.authId, parentDigest(codeId)]);
      await pool.query(`INSERT INTO hs_onboarding.device_requests
        (id,code_id,child_id,parent_auth_id,token_digest,device_label,status,approved_session_id,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,'redeemed',$7,now()+interval '10 minutes')`,
      [requestId, codeId, childId, owner.authId, parentDigest(requestId), name, approvalId]);
      await pool.query(`INSERT INTO hs_onboarding.child_sessions
        (token_digest,child_id,request_id,parent_auth_id,approved_session_id,expires_at,revoked_at)
        VALUES($1,$2,$3,$4,$5,now()+($6 * interval '1 hour'),$7)`,
      [parentDigest(token), childId, requestId, owner.authId, approvalId, name === "Expired" ? -1 : 12,
        name === "Revoked" ? new Date() : null]);
      devices[name] = { id: requestId, token, childId };
    }

    await t.test("only active sessions belonging to the verified parent are listed, with safe fields", async () => {
      const result = await service.sessions(actors.parent);
      assert.deepEqual(result.sessions.map(s => s.deviceLabel).sort(), ["Phone", "Tablet"]);
      for (const session of result.sessions) {
        assert.deepEqual(Object.keys(session).sort(), ["childId", "deviceLabel", "expiresAt", "id"]);
        assert.ok(new Date(session.expiresAt).getTime() > Date.now());
        assert.equal(session.childId, ids.child1);
      }
      assert.deepEqual((await service.sessions(actors.otherParent)).sessions.map(s => s.deviceLabel), ["Other household"]);
    });
    await t.test("cross-parent, cross-child and unknown references cannot revoke a session", async () => {
      for (const [who, childId, deviceId] of [
        [actors.otherParent, ids.child1, devices.Phone.id],
        [actors.parent, ids.child2, devices["Other household"].id],
        [actors.parent, ids.child3, devices.Phone.id],
        [actors.parent, ids.child1, randomUUID()],
      ] as const) {
        await assert.rejects(service.revokeSession(who, childId, deviceId),
          (e: any) => e.code === "CHILD_DEVICE_UNAVAILABLE");
      }
      assert.equal((await service.sessions(actors.parent)).sessions.length, 2);
    });
    await t.test("revoking one session invalidates only that token and preserves pairing and other devices", async () => {
      const beforeRequests = (await pool.query("SELECT * FROM hs_onboarding.device_requests ORDER BY id")).rows;
      const beforeCodes = (await pool.query("SELECT * FROM hs_onboarding.device_codes ORDER BY id")).rows;
      // Exercise the actual child bearer-session resolver before and after revoke.
      await service.ownSession(devices.Phone.token);
      await service.ownSession(devices.Tablet.token);
      assert.deepEqual(await service.revokeSession(actors.parent, ids.child1, devices.Phone.id), { revoked: true });
      await assert.rejects(service.ownSession(devices.Phone.token), (e: any) => e.code === "INVALID_CHILD_SESSION");
      await service.ownSession(devices.Tablet.token);
      await service.ownSession(devices["Other household"].token);
      assert.deepEqual((await service.sessions(actors.parent)).sessions.map(s => s.deviceLabel), ["Tablet"]);
      assert.deepEqual((await pool.query("SELECT * FROM hs_onboarding.device_requests ORDER BY id")).rows, beforeRequests);
      assert.deepEqual((await pool.query("SELECT * FROM hs_onboarding.device_codes ORDER BY id")).rows, beforeCodes);
      // Retry remains safe, including after child access has been disabled.
      await pool.query("UPDATE hs_onboarding.children SET enabled=false WHERE id=$1", [ids.child1]);
      await service.revokeSession(actors.parent, ids.child1, devices.Tablet.id);
      await service.revokeSession(actors.parent, ids.child1, devices.Tablet.id);
    });
    await t.test("parent verification is required for both listing and revocation", async () => {
      verified = false;
      await assert.rejects(service.sessions(actors.parent), (e: any) => e.code === "PARENT_VERIFICATION_REQUIRED");
      await assert.rejects(service.revokeSession(actors.parent, ids.child1, devices.Phone.id),
        (e: any) => e.code === "PARENT_VERIFICATION_REQUIRED");
    });
  } finally {
    await f.close();
  }
});

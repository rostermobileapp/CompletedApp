import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getReusableUserDisplayId,
  shouldLookupUserByEmail,
} from "./userSyncPlan";

describe("authenticated user sync query plan", () => {
  it("skips the email lookup when the existing ID and normalized email match", () => {
    assert.equal(
      shouldLookupUserByEmail(
        { id: "user-1", email: "Player@Example.com" },
        " player@example.com ",
      ),
      false,
    );
  });

  it("keeps the email lookup for a new ID or a changed email", () => {
    assert.equal(shouldLookupUserByEmail(undefined, "player@example.com"), true);
    assert.equal(
      shouldLookupUserByEmail(
        { id: "user-1", email: "old@example.com" },
        "new@example.com",
      ),
      true,
    );
  });

  it("does not look up an absent email", () => {
    assert.equal(
      shouldLookupUserByEmail({ id: "user-1", email: null }, null),
      false,
    );
  });

  it("reuses a display ID only for the same authenticated user", () => {
    assert.equal(
      getReusableUserDisplayId(
        "user-1",
        { id: "user-1", displayId: "U00042" },
        undefined,
      ),
      "U00042",
    );
    assert.equal(
      getReusableUserDisplayId(
        "user-2",
        undefined,
        { id: "user-2", displayId: "U00043" },
      ),
      "U00043",
    );
    assert.equal(
      getReusableUserDisplayId(
        "user-1",
        { id: "user-1", displayId: null },
        undefined,
      ),
      null,
    );
    assert.equal(
      getReusableUserDisplayId(
        "user-1",
        undefined,
        { id: "different-user", displayId: "U00044" },
      ),
      undefined,
    );
  });
});

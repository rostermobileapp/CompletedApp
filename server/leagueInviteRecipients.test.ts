import assert from "node:assert/strict";
import { test } from "node:test";
import { selectInviteRecipients, type LeagueInviteCandidate } from "./leagueInviteRecipients";

const candidates: LeagueInviteCandidate[] = [
  { id: "user:new-1", name: "New One", email: "one@example.com", teamName: "Barons", userId: "new-1", invited: false },
  { id: "email:two@example.com", name: "New Two", email: "two@example.com", teamName: "Barons", userId: null, invited: false },
  { id: "user:old", name: "Old Player", email: "old@example.com", teamName: "Barons", userId: "old", invited: false },
];

test("only explicitly selected members are eligible; an empty request never sends to everyone", () => {
  assert.deepEqual(selectInviteRecipients(candidates, ["user:new-1", "email:two@example.com"]).map((person) => person.name), ["New One", "New Two"]);
  assert.throws(() => selectInviteRecipients(candidates, undefined), /Select between/);
  assert.throws(() => selectInviteRecipients(candidates, []), /Select between/);
  assert.throws(() => selectInviteRecipients(candidates, ["user:new-1", "user:elsewhere"]), /not in this league/);
  assert.throws(() => selectInviteRecipients(candidates, ["user:new-1", "user:new-1"]), /Duplicate/);
});
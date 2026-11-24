import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getSkin, SKIN_TABS, skinPathAllowed, type SkinActor, type SkinTeam } from "../../shared/teamSkin";

const adult: SkinActor = { id: "fixture", type: "adult" };
const base: SkinTeam = { id: "team", name: "Fixture", program_type: "high_school", role: "parent", status: "approved" };
test("canonical team roles determine the skin, never account billing or an onboarding choice", () => {
  for (const [role, skin] of [
    ["head_coach", "coach"], ["assistant_coach", "coach"], ["team_manager", "coach"],
    ["athletic_director", "athletic_director"], ["parent", "parent"],
  ] as const) assert.equal(getSkin(adult, { ...base, role }), skin);
  assert.equal(getSkin(adult, { ...base, program_type: "adult", role: "head_coach" }), "adult");
  assert.throws(() => getSkin(adult, { ...base, role: "player" }), /PENDING/);
  assert.throws(() => getSkin(adult, null), /PENDING/);
  assert.throws(() => getSkin(adult, { ...base, status: "pending" } as any), /PENDING/);
  assert.throws(() => getSkin(adult, { ...base, program_type: "unknown" } as any), /UNKNOWN/);
});
test("a verified child actor always remains player; its skin exposes no account, payment or DM paths", () => {
  const child: SkinActor = { id: "child-fixture", type: "child" };
  assert.equal(getSkin(child, null), "player");
  assert.equal(getSkin(child, { ...base, role: "athletic_director", program_type: "adult" }), "player");
  assert.deepEqual(SKIN_TABS.player, ["Home", "Schedule", "Chat", "Team"]);
  for (const path of ["/payments", "/profile", "/settings", "/messages", "/high-school/payments",
    "/high-school/family", "/trophy-case", "/high-school/chat/new", "/high-school/chat/other"]) {
    assert.equal(skinPathAllowed("player", path), false, path);
  }
  assert.equal(skinPathAllowed("player", "/high-school/profile"), true);
});
test("HS mounting boundary encloses all legacy background hosts and production remains a pass-through", async () => {
  const app = await readFile("client/src/App.tsx", "utf8");
  const boundary = await readFile("client/src/components/high-school-skins/TeamSkinBoundary.tsx", "utf8");
  const start = app.indexOf("<TeamSkinBoundary entry=");
  const end = app.indexOf("</TeamSkinBoundary>", start);
  for (const tag of ["WebSocketProvider", "NativeCalendarAutoSync", "BadgeEarnedHost", "BirthdayHost", "TriviaHost"]) {
    const index = app.indexOf(`<${tag}`, start);
    assert.ok(index > start && index < end, tag);
  }
  assert.match(boundary, /if \(!isDevParentClient\) return <>\{children\}<\/>/);
  assert.match(boundary, /queryClient\.cancelQueries/);
  assert.match(boundary, /resetTeamRequestScope/);
  const service = await readFile("server/teamSkinService.ts", "utf8");
  assert.match(service, /t\.program_type/);
  assert.match(service, /m\.role/);
  assert.doesNotMatch(service, /staff_requests|player_requests|journey|\.draft/);
});

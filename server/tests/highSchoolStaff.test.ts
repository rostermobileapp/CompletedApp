import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { previewEvents, previewRoster } from "../highSchoolStaffImports";
import { eventInput } from "../../shared/highSchoolStaff";

test("roster imports report invalid rows and never infer consent or staff status", () => {
  assert.equal(previewRoster("firstName,lastName,gradYear,position,jerseyNumber\nCasey,Fixture,2027,F,12").rows.length, 1);
  const invalid = previewRoster("firstName,lastName,gradYear,position\nCasey,Fixture,2027,Coach\nX,Y,2030,G");
  assert.equal(invalid.errors[0].row, 2); assert.equal(invalid.rows.length, 1);
  assert.ok(previewRoster("name,position\nX,G").errors.some(e => e.message.includes("Missing column")));
  assert.ok(previewRoster("firstName,lastName,gradYear,position,consent\nX,Y,2027,G,true").errors.length);
});
test("schedule CSV validates explicit offsets and iCal never silently imports recurrence or ambiguous times", () => {
  assert.equal(previewEvents("csv", "title,startsAt,rink\nGame,2026-12-01T18:00:00-05:00,North Rink").errors.length, 0);
  assert.ok(previewEvents("csv", "title,startsAt\nGame,2026-12-01T18:00:00").errors.length);
  const ical = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Varsity\\, home\nDTSTART:20261201T230000Z\nLOCATION:North Rink\nEND:VEVENT\nEND:VCALENDAR";
  const good = previewEvents("ical", ical);
  assert.equal(good.rows[0].title, "Varsity, home"); assert.equal(good.errors.length, 0);
  assert.ok(previewEvents("ical", ical.replace("DTSTART:", "RRULE:FREQ=WEEKLY\nDTSTART:")).errors.some(e => e.message.includes("Recurring")));
  assert.ok(previewEvents("ical", ical.replace("DTSTART:", "DTSTART;TZID=America/New_York:")).errors.length);
  assert.equal(eventInput.safeParse({ title: "Game", startsAt: "bad", role: "athletic_director" }).success, false);
});
test("runtime remains DEV guarded, child-disabled and free of outbound staff chat delivery", async () => {
  const auth = await readFile("server/supabaseAuth.ts", "utf8");
  assert.match(auth, /new HighSchoolChildDevices\(pool, parent, false\)/);
  const chat = await readFile("server/highSchoolStaffChat.ts", "utf8");
  assert.doesNotMatch(chat, /import.*(?:oneSignal|resend|sendEmail|mailer)/);
  const http = await readFile("server/highSchoolStaffHttp.ts", "utf8");
  assert.match(http, /isParentSecurityDevelopment/); assert.match(http, /authenticate\(req\)/);
  assert.doesNotMatch(http, /parent\.authorized/);
  const schema = await readFile("shared/schema.ts", "utf8");
  assert.doesNotMatch(schema, /child_profile_id|program_type/);
});

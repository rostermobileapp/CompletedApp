import test from "node:test";
import assert from "node:assert/strict";
import { familyConsentProblems } from "../../client/src/lib/familyConsentValidation";
import { HS_CONSENT_VERSION } from "../../shared/highSchoolOnboarding";
import type { FamilyPlayer } from "../../shared/highSchoolFamilySetup";

const child: FamilyPlayer = {
  id: "10000000-0000-4000-8000-000000000004",
  firstName: "Synthetic", lastName: "Fixture", birthYear: 2012, gradYear: 2030,
  position: "F", jerseyNumber: "", consent: true, consentVersion: HS_CONSENT_VERSION,
  photoConsent: false, publicNameConsent: false,
};
test("optional photo and public-name sharing are not required for consent", () => {
  assert.deepEqual(familyConsentProblems([child], true), []);
});
test("graduation year can be omitted without weakening birth-year validation", () => {
  const { gradYear, ...withoutGraduation } = child;
  assert.deepEqual(familyConsentProblems([withoutGraduation], true), []);
  assert.match(familyConsentProblems([{ ...withoutGraduation, birthYear: undefined }], true).join(" "), /birth year/);
});
test("missing or invalid birth years explain what prevents saving", () => {
  for (const birthYear of [undefined, 1899, new Date().getFullYear() + 1, 2012.5]) {
    assert.deepEqual(familyConsentProblems([{ ...child, birthYear }], true), ["Player 1: Choose a birth year."]);
  }
});
test("each guardian agreement remains mandatory", () => {
  assert.match(familyConsentProblems([{ ...child, consent: false }], true).join(" "), /privacy agreement/);
  assert.match(familyConsentProblems([child], false).join(" "), /authorized adult guardian/);
});
test("all children are validated, not just the first visible child", () => {
  const second = { ...child, id: "10000000-0000-4000-8000-000000000005", birthYear: undefined };
  assert.deepEqual(familyConsentProblems([child, second], true), ["Player 2: Choose a birth year."]);
});
test("name, graduation year, jersey and consent-version errors match server validation", () => {
  const cases: [Partial<FamilyPlayer>, RegExp][] = [
    [{ firstName: " " }, /first name/],
    [{ lastName: "" }, /last name/],
    [{ gradYear: 2041 }, /graduation year/],
    [{ jerseyNumber: "abc" }, /two digits/],
    [{ consentVersion: "old-terms" }, /privacy terms/],
  ];
  for (const [patch, message] of cases) {
    assert.match(familyConsentProblems([{ ...child, ...patch }], true).join(" "), message);
  }
});
test("empty drafts cannot submit consent", () => {
  assert.deepEqual(familyConsentProblems([], true), ["Add a child before saving consent."]);
});

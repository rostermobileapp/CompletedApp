import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationSettingsSchema, updateNotificationPreferencesSchema } from "./schema";

test("Trivia push reminders default on for new preferences", () => {
  assert.equal(notificationSettingsSchema.parse({}).triviaReminders, true);
});

test("Trivia can be disabled and re-enabled without updating other preferences", () => {
  for (const enabled of [false, true]) {
    assert.deepEqual(updateNotificationPreferencesSchema.parse({
      notificationSettings: { triviaReminders: enabled },
    }).notificationSettings, { triviaReminders: enabled });
  }
});

test("legacy and partial updates do not manufacture an enabled Trivia setting", () => {
  assert.deepEqual(updateNotificationPreferencesSchema.parse({
    notificationSettings: { inAppMessages: false },
  }).notificationSettings, { inAppMessages: false });
  assert.deepEqual(updateNotificationPreferencesSchema.parse({
    notificationSettings: {},
  }).notificationSettings, {});
});

test("invalid Trivia preferences cannot be persisted as boolean consent", () => {
  for (const value of ["false", null, 0, []]) {
    assert.equal(updateNotificationPreferencesSchema.safeParse({
      notificationSettings: { triviaReminders: value },
    }).success, false);
  }
});

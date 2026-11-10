import { normalizeEmail } from "./emailNormalization";

type ExistingUserSyncRecord = {
  id: string;
  email?: string | null;
  displayId?: string | null;
};

export function shouldLookupUserByEmail(
  existingById: ExistingUserSyncRecord | undefined,
  incomingEmail: string | null | undefined,
): boolean {
  const normalizedIncomingEmail = normalizeEmail(incomingEmail);
  if (!normalizedIncomingEmail) return false;

  return !existingById ||
    normalizeEmail(existingById.email) !== normalizedIncomingEmail;
}

export function getReusableUserDisplayId(
  userId: string | undefined,
  existingById: ExistingUserSyncRecord | undefined,
  existingByEmail: ExistingUserSyncRecord | undefined,
): string | null | undefined {
  if (userId && existingById?.id === userId) {
    return existingById.displayId;
  }
  if (userId && existingByEmail?.id === userId) {
    return existingByEmail.displayId;
  }
  return undefined;
}

import { z } from "zod";

export const HS_CONSENT_VERSION = "dev-draft-2026-11-19";
export const HS_MAX_FAMILY_PLAYERS = 2;
export const HS_CONSENT_TEXT = "Roster stores your player's name, graduation year, position and optional jersey number. Approved team staff, team parents and teammates may see team information; opponents see first name and last initial only. No child email, phone, address or date of birth is collected. Photos and public-name sharing are off unless separately selected. This setup does not activate a player or grant team access.";
export const HS_PATHS = ["player", "organizer", "staff", "parent", "league_admin"] as const;
export const HS_STAFF_ROLES = ["head_coach", "assistant_coach", "athletic_director", "team_manager"] as const;
const name = z.string().trim().min(1).max(80).refine(s => !/[\u0000-\u001f\u007f]/.test(s));
export const hsPlayerDraft = z.object({
  id: z.string().uuid(), firstName: name, lastName: name,
  gradYear: z.number().int().min(2026).max(2040),
  position: z.enum(["F", "D", "G"]), jerseyNumber: z.string().regex(/^\d{0,2}$/).default(""),
  consent: z.literal(true), consentVersion: z.literal(HS_CONSENT_VERSION),
  photoConsent: z.boolean().default(false), publicNameConsent: z.boolean().default(false),
}).strict();
/** Compare validated values, not incoming JSON key order (PostgreSQL JSONB reorders keys). */
export function hsParentPlayersMatchSaved(local: unknown, saved: unknown): boolean {
  const players = z.array(hsPlayerDraft).min(1).max(HS_MAX_FAMILY_PLAYERS);
  const left = players.safeParse(local), right = players.safeParse(saved);
  if (!left.success || !right.success || left.data.length !== right.data.length) return false;
  const byId = new Map(right.data.map(player => [player.id, JSON.stringify(player)]));
  return byId.size === right.data.length && left.data.every(player => byId.get(player.id) === JSON.stringify(player));
}
// Role choice is not evidence of age or parent authority. Legacy clients may
// still send this flag, but it never grants access or bypasses verification.
export const hsChoosePath = z.object({ path: z.enum(HS_PATHS), adultConfirmed: z.literal(true).optional() }).strict();
export const hsSaveDraft = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("staff"), revision: z.number().int().nonnegative(), role: z.enum(HS_STAFF_ROLES),
    programId: z.string().uuid().optional(), teamId: z.string().uuid().optional(),
    newSchool: z.object({ leagueId: z.string().uuid(), name: name, town: name }).strict().optional(),
  }).strict(),
  z.object({ kind: z.literal("parent"), revision: z.number().int().nonnegative(), guardianConfirmed: z.literal(true),
    players: z.array(hsPlayerDraft).min(1).max(HS_MAX_FAMILY_PLAYERS),
  }).strict(),
]);
export const hsTeamEntry = z.object({
  revision: z.number().int().nonnegative(), teamCode: z.string().trim().min(4).max(80).optional(),
  invitation: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/).optional(),
}).strict().refine(v => Boolean(v.teamCode) !== Boolean(v.invitation), "Use a team code or an invitation, not both.");
export type HsPlayerDraft = z.infer<typeof hsPlayerDraft>;
export type HsPath = typeof HS_PATHS[number];

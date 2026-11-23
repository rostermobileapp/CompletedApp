import { z } from "zod";

export const HS_SETUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const HS_SETUP_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const HS_SETUP_CODE_SECONDS = 600;
export const HS_SETUP_CODE_MAX_FAILURES = 5;
export const hsHockeyType = z.object({
  hockeyType: z.enum(["adult", "high_school_youth"]),
}).strict();
const shortText = z.string().trim().min(1).max(100);
const schoolTeam = z.object({ id: z.string().uuid(), name: shortText }).strict();
const school = z.object({
  id: z.string().uuid(), name: shortText, town: z.string().trim().max(100).default(""),
  teams: z.array(schoolTeam).min(1).max(20),
}).strict();
export const hsLeagueDraftInput = z.object({
  revision: z.number().int().nonnegative(),
  stage: z.enum(["details", "schools", "schedule", "invitations", "plan"]),
  details: z.object({
    name: shortText, state: z.string().trim().min(2).max(60), season: shortText,
  }).strict().optional(),
  schools: z.array(school).min(1).max(100).optional(),
  schedule: z.array(z.object({
    homeTeamId: z.string().uuid(), awayTeamId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    rink: shortText,
  }).strict()).max(2000).optional(),
  invitations: z.array(z.object({
    email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
    role: z.enum(["athletic_director", "head_coach"]),
    schoolId: z.string().uuid(), teamId: z.string().uuid().optional(),
  }).strict()).max(200).optional(),
}).strict();
export type HsLeagueDraftInput = z.infer<typeof hsLeagueDraftInput>;

export const hsJourneyInput = z.object({
  revision: z.number().int().nonnegative(),
  screen: z.enum([
    "hockey_type", "hs_role", "referral", "profile", "staff_role", "staff_school", "staff_team",
    "staff_waiting", "parent_players", "parent_consent", "parent_join", "parent_plan",
    "parent_complete", "parent_code", "league_details", "league_schools", "league_schedule",
    "league_invitations", "league_plan", "league_home",
  ]),
  referralPartnerId: z.string().trim().min(1).max(100).optional(),
  referralSourceOther: z.string().trim().min(1).max(200).optional(),
  profile: z.object({
    firstName: shortText, lastName: shortText, timezone: z.string().min(1).max(100),
  }).strict().optional(),
  staffRole: z.enum(["head_coach", "assistant_coach", "athletic_director", "team_manager"]).optional(),
  programId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
}).strict().refine(
  value => !(value.referralPartnerId && value.referralSourceOther),
  "Choose a referral partner or another source, not both.",
);

/** No client can grant coverage, approve itself or turn a draft into a live league. */
export function validateHsLeagueDraft(
  previous: Record<string, any>, input: HsLeagueDraftInput,
): Record<string, any> {
  const { revision: _revision, ...changes } = input;
  const next: Record<string, any> = { ...previous, ...changes };
  if (!next.details) throw new Error("LEAGUE_DETAILS_REQUIRED");
  const stages = ["details", "schools", "schedule", "invitations", "plan"];
  if (stages.indexOf(input.stage) > 0 && !next.schools?.length) throw new Error("SCHOOLS_REQUIRED");
  const schools = next.schools ?? [];
  const schoolIds = new Set(schools.map((s: any) => s.id));
  const teamIds = schools.flatMap((s: any) => s.teams.map((t: any) => t.id));
  if (schoolIds.size !== schools.length || new Set(teamIds).size !== teamIds.length) throw new Error("DUPLICATE_SCHOOL_OR_TEAM");
  const names = schools.map((s: any) => `${s.name.toLowerCase()}|${s.town.toLowerCase()}`);
  if (new Set(names).size !== names.length) throw new Error("DUPLICATE_SCHOOL_OR_TEAM");
  const teamSet = new Set(teamIds);
  const gameKeys = new Set<string>();
  for (const game of next.schedule ?? []) {
    if (!teamSet.has(game.homeTeamId) || !teamSet.has(game.awayTeamId) || game.homeTeamId === game.awayTeamId) {
      throw new Error("INVALID_SCHEDULE_TEAM");
    }
    const date = new Date(`${game.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== game.date) throw new Error("INVALID_SCHEDULE_DATE");
    const key = `${[game.homeTeamId, game.awayTeamId].sort().join(":")}:${game.date}:${game.time}`;
    if (gameKeys.has(key)) throw new Error("DUPLICATE_SCHEDULE_GAME");
    gameKeys.add(key);
  }
  const inviteKeys = new Set<string>();
  for (const invitation of next.invitations ?? []) {
    const selected = schools.find((s: any) => s.id === invitation.schoolId);
    if (!selected || (invitation.role === "head_coach" &&
        !selected.teams.some((t: any) => t.id === invitation.teamId)) ||
        (invitation.teamId && !selected.teams.some((t: any) => t.id === invitation.teamId))) {
      throw new Error("INVALID_INVITATION_SCOPE");
    }
    const key = `${invitation.email}:${invitation.schoolId}:${invitation.teamId ?? ""}:${invitation.role}`;
    if (inviteKeys.has(key)) throw new Error("DUPLICATE_INVITATION");
    inviteKeys.add(key);
  }
  return next;
}

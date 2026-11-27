import { z } from "zod";
import { staffRoles, eventInput, type StaffEventInput, type StaffRole } from "./highSchoolStaff";

const name = z.string().trim().min(1).max(100);
export const schoolLeagueNameInput = z.object({
  name,
  expectedName: z.string().min(1).max(200),
}).strict();
export const schoolInput = z.object({ name, town: name }).strict();
export const schoolUpdateInput = schoolInput.extend({
  expectedName: z.string().min(1).max(100), expectedTown: z.string().min(1).max(100),
}).strict();
export const schoolDeleteInput = z.object({
  expectedName: z.string().min(1).max(100), expectedTown: z.string().min(1).max(100),
  programIds: z.array(z.string().uuid()).max(10000),
  teamIds: z.array(z.string().uuid()).max(10000),
  confirmation: z.string().min(1).max(100),
}).strict();
export interface SchoolDeletionPreview {
  school: { id: string; name: string; town: string };
  programCount: number; teamCount: number; programIds: string[]; teamIds: string[];
}
export const schoolStructureDeleteInput = z.object({
  expectedName: z.string().min(1).max(100),
  schoolId: z.string().uuid().nullable(),
  programId: z.string().uuid(),
  teamIds: z.array(z.string().uuid()).max(10000),
  confirmation: z.string().min(1).max(100),
}).strict();
export interface SchoolStructureDeletionPreview {
  kind: "program" | "team"; id: string; name: string; schoolId: string | null;
  programId: string; teamIds: string[]; teamCount: number;
}
export const schoolProgramInput = z.object({ name, schoolId: z.string().uuid() }).strict();
export const schoolProgramUpdateInput = schoolProgramInput;
export const schoolTeamInput = z.object({ programId: z.string().uuid(), name }).strict();
const invitationBase = { teamId: z.string().uuid(), email: z.string().trim().email().transform(value => value.toLowerCase()) };
export const schoolInvitationInput = z.discriminatedUnion("kind", [
  z.object({ ...invitationBase, kind: z.literal("staff"), role: z.enum(staffRoles) }).strict(),
  z.object({ ...invitationBase, kind: z.literal("parent"), players: z.array(z.object({
    firstName: name, lastName: name, gradYear: z.number().int().min(2000).max(2100),
    position: z.enum(["F", "D", "G"]), jerseyNumber: z.string().regex(/^\d{0,2}$/).default(""),
  }).strict()).min(1).max(2) }).strict(),
]);
export const schoolSchedulePreviewInput = z.object({
  teamId: z.string().uuid(), format: z.enum(["csv", "ical"]), text: z.string().min(1).max(500_000),
}).strict();
export const schoolScheduleImportInput = z.object({
  teamId: z.string().uuid(), rows: z.array(eventInput).min(1).max(200),
}).strict();
export interface SchoolLeagueWorkspace {
  actorId: string;
  league: { id: string; name: string; leagueType: "high_school" | "youth" };
  schools: { id: string; name: string; town: string; canEdit: boolean; canDelete: boolean; deleteBlockedReason?: string }[];
  programs: { id: string; name: string; town: string; status: string; schoolId: string | null }[];
  teams: { id: string; name: string; programId: string }[];
  staffRequests: { id: string; authId: string; name: string; role: StaffRole; school: string; teamName: string | null }[];
  parentRequests: { id: string; parentAuthId: string; firstName: string; lastName: string; teamId: string; teamName: string }[];
  events: { id: string; teamId: string; teamName: string; title: string; opponent: string; startsAt: string; status: string }[];
}
export interface SchoolLeagueActionResult {
  saved?: boolean; id?: string; teamCode?: string; invitation?: string; recipientEmail?: string;
  expiresAt?: string; delivery?: "manual"; count?: number;
  rows?: StaffEventInput[]; errors?: { row: number; message: string }[];
  notification?: { pending?: number };
}

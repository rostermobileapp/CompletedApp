import { z } from "zod";

export const staffRoles = ["head_coach", "assistant_coach", "team_manager", "athletic_director"] as const;
export type StaffRole = typeof staffRoles[number];
export const eventInput = z.object({
  title: z.string().trim().min(1).max(120),
  opponent: z.string().trim().max(120).default(""),
  startsAt: z.string().datetime({ offset: true }),
  rink: z.string().trim().max(160).default(""),
  address: z.string().trim().max(240).default(""),
}).strict();
export type StaffEventInput = z.input<typeof eventInput>;
export interface StaffPlayer {
  id: string; type: "player" | "staged"; firstName: string; lastName: string;
  number: string; position: string; gradYear: number; className: string;
  guardianLinked: boolean; consented: boolean;
}
export interface StaffEvent extends z.infer<typeof eventInput> {
  id: string; version: number; status: "scheduled" | "final";
  homeScore: number | null; awayScore: number | null; reportAvailable: boolean;
}
export interface StaffMessage {
  id: string; body: string; sender: string; authorType: "staff" | "child";
  createdAt: string;
}
export interface StaffWorkspace {
  team: { id: string; name: string; programId: string; programName: string; rink: string; address: string };
  role: StaffRole;
  capabilities: { manageStaff: boolean; manageProgram: boolean; createPayments: boolean; paymentReason: string };
  roster: StaffPlayer[];
  callupCandidates: (StaffPlayer & { teamName: string })[];
  events: StaffEvent[];
  rooms: { id: string; kind: "team" | "parents" | "coaches"; name: string }[];
  staff: { id: string; userId: string; name: string; role: StaffRole }[];
  approvals: { id: string; role: StaffRole; school: string; name: string; teamName: string }[];
  gaps: { teamId: string; name: string; missingGuardian: number; missingConsent: number }[];
  reports: { id: string; body: string; reason: string; sender: string; teamName: string; status: string }[];
  audit: { id: string; event: string; createdAt: string }[];
  payments: { id: string; creatorId: string; title: string; amount: string; recipients: { id: string; name: string; paid: boolean; confirmed: boolean }[] }[];
  paymentRecipients: { id: string; name: string }[];
}
export interface LineupEntry { playerId: string; state: "dress" | "scratch"; teamName: string; name: string; callup: boolean }
export interface ImportPreview<T> { rows: T[]; errors: { row: number; message: string }[] }

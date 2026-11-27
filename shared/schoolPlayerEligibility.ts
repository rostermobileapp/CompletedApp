import { z } from "zod";

export const playerEligibilityInput = z.object({
  restricted: z.boolean(),
  reason: z.string().trim().max(500),
  version: z.number().int().nonnegative(),
}).strict().refine(value => !value.restricted || value.reason.length > 0, {
  message: "Give a reason for the restriction.", path: ["reason"],
});

export interface SchoolPlayerEligibility {
  playerId: string; firstName: string; lastName: string;
  teamId: string; teamName: string; programName: string;
  leagueRestricted: boolean; leagueReason: string; leagueVersion: number;
  teamRestricted: boolean; teamReason: string; teamVersion: number;
  eligible: boolean;
}
export interface SchoolEligibilityWorkspace {
  scope: "league" | "team";
  canEdit: boolean;
  players: SchoolPlayerEligibility[];
}

import { z } from "zod";
import { hsPlayerDraft, HS_MAX_FAMILY_PLAYERS } from "./highSchoolOnboarding";

/** A family journey is separate from the account's original onboarding path. */
export const familyPlayerDraft = hsPlayerDraft.extend({
  firstName: z.string().trim().max(80).refine(v => !/[\x00-\x1f\x7f]/.test(v)),
  lastName: z.string().trim().max(80).refine(v => !/[\x00-\x1f\x7f]/.test(v)),
  consent: z.boolean(),
});
export type FamilyPlayer = z.infer<typeof familyPlayerDraft>;
export type FamilyRequest = {
  id: string; playerKey: string; teamId: string; teamName: string;
  status: "pending" | "approved" | "denied"; details: FamilyPlayer;
  childId: string | null; deviceActivation: "disabled";
  coverage: "personal" | "league" | "uncovered";
};
export type FamilySetupState = {
  started: boolean; verified: boolean; revision: number;
  status: string; players: FamilyPlayer[]; guardianConfirmed: boolean;
  imported: boolean; requests: FamilyRequest[];
  maximumPlayers: typeof HS_MAX_FAMILY_PLAYERS;
  activationAvailable: false;
};

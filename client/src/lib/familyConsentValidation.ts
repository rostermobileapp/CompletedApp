import type { FamilyPlayer } from "@shared/highSchoolFamilySetup";
import { hsBirthYear, hsPlayerDraft } from "@shared/highSchoolOnboarding";

/** Match server requirements without treating optional sharing as consent. */
export function familyConsentProblems(players: FamilyPlayer[], guardian: boolean): string[] {
  if (!players.length) return ["Add a child before saving consent."];
  const problems: string[] = [];
  const fields: Record<string, string> = {
    id: "Refresh setup to restore this child’s saved identity.",
    firstName: "Enter a first name.",
    lastName: "Enter a last name.",
    gradYear: "Choose a valid graduation year.",
    position: "Choose a position.",
    jerseyNumber: "Use up to two digits for the optional jersey number.",
    consent: "Check the parent or legal guardian privacy agreement.",
    consentVersion: "Review the privacy terms and check the agreement again.",
  };
  players.forEach((player, index) => {
    const prefix = `Player ${index + 1}: `;
    const parsed = hsPlayerDraft.safeParse(player);
    if (!parsed.success) {
      const seen = new Set<string>();
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field === "birthYear" || seen.has(field)) continue;
        seen.add(field);
        problems.push(prefix + (fields[field] ?? "Review the child details."));
      }
    }
    if (!hsBirthYear.safeParse(player.birthYear).success) {
      problems.push(prefix + "Choose a birth year.");
    }
  });
  if (!guardian) problems.push("Confirm that you are the authorized adult guardian for these players.");
  return problems;
}

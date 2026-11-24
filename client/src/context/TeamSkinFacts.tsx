import { createContext, useContext } from "react";
import { ROLE_LABELS, type SkinContext } from "@shared/teamSkin";
export const TeamSkinFacts = createContext<SkinContext | null>(null);
export const useTeamSkinFacts = () => useContext(TeamSkinFacts);
/** Only annotate school options. Adult labels/layout remain unchanged. */
export function skinTeamLabel(facts: SkinContext | null, id: string, name: string) {
  const team = facts?.teams.find(t => t.id === id && t.program_type === "high_school");
  return team ? `${name} · ${ROLE_LABELS[team.role]}` : name;
}

/** Presentation choices never grant membership, parent authority or API access. */
export type Skin = "adult" | "coach" | "athletic_director" | "parent" | "player";
export type TeamRole = "player" | "parent" | "head_coach" | "assistant_coach" | "team_manager" | "athletic_director";
export type SkinActor = { id: string; type: "adult" | "child" };
export type SkinTeam = {
  id: string; name: string; program_type: "adult" | "high_school";
  role: TeamRole; status: "approved"; program_id?: string | null;
};
export type SkinContext = { actor: SkinActor; teams: SkinTeam[]; restricted: boolean };
export const ROLE_LABELS: Record<TeamRole, string> = {
  player: "Player", parent: "Parent", head_coach: "Head Coach",
  assistant_coach: "Assistant Coach", team_manager: "Team Manager", athletic_director: "Athletic Director",
};
/** These are canonical team/membership fields, never onboarding draft choices. */
export function getSkin(user: SkinActor, activeTeam: SkinTeam | null): Skin {
  if (user.type === "child") return "player";
  if (!activeTeam || activeTeam.status !== "approved") throw new Error("TEAM_ACCESS_PENDING");
  if (activeTeam.program_type === "adult") return "adult";
  if (activeTeam.program_type !== "high_school") throw new Error("UNKNOWN_PROGRAM_TYPE");
  if (activeTeam.role === "athletic_director") return "athletic_director";
  if (["head_coach", "assistant_coach", "team_manager"].includes(activeTeam.role)) return "coach";
  if (activeTeam.role === "parent") return "parent";
  // A child is a separate verified actor, not a role an adult can select.
  throw new Error("TEAM_ACCESS_PENDING");
}
export const SKIN_TABS: Record<Exclude<Skin, "adult">, readonly string[]> = {
  coach: ["Home", "Schedule", "Roster", "Chat", "More"],
  athletic_director: ["Home", "Schedule", "Roster", "Chat", "More"],
  parent: ["Home", "Schedule", "Chat", "Payments", "Family"],
  player: ["Home", "Schedule", "Chat", "Team"],
};
export function skinPathAllowed(skin: Exclude<Skin, "adult">, path: string): boolean {
  if (path === "/" || path === "/high-school/home") return true;
  if (skin === "player" && path === "/high-school/profile") return true;
  return SKIN_TABS[skin].some(tab => path === `/high-school/${tab.toLowerCase()}`);
}

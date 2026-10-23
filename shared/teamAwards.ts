/** Transferable team awards are independent of permanent Trophy Case patches. */
export const TEAM_AWARD_LIMITS = { active: 5, removalsPerMonth: 10, imageBytes: 5 * 1024 * 1024, imageEdge: 256 } as const;
export const TEAM_AWARD_PRESETS = ["trophy", "puck", "star", "skate", "shield", "flame"] as const;
export const TEAM_AWARD_CADENCES = ["game", "week", "month", "season"] as const;
export type AwardCadence = typeof TEAM_AWARD_CADENCES[number];
export type AwardPreset = typeof TEAM_AWARD_PRESETS[number];
export interface AwardWindow {
  periodKey: string | null;
  opensAt: string | null;
  closesAt: string | null;
  gameId: string | null;
}
export interface TeamAwardGrant {
  id: string; playerId: string | null; playerName: string; periodKey: string; grantedAt: string;
  grantedById?: string | null; grantedByName?: string;
}
export interface TeamAward {
  id: string; teamId: string; name: string; description: string; cadence: AwardCadence;
  presetIcon: AwardPreset; imageUrl: string | null; imageVersion: string;
  archived: boolean; holder: { id: string; name: string } | null;
  window: AwardWindow; currentGrant: TeamAwardGrant | null; history: TeamAwardGrant[];
}
export interface TeamAwardsBundle {
  enabled: boolean; canManage: boolean; timezone: string; awards: TeamAward[];
  roster: { id: string; name: string }[]; activeLimit: number; removalLimit: number;
}
export interface HeldTeamAward {
  id: string; teamId: string; teamName: string; playerId: string; name: string;
  presetIcon: AwardPreset; imageUrl: string | null; imageVersion: string;
}
export interface SaveTeamAward {
  id?: string; name: string; description: string; cadence: AwardCadence; presetIcon: AwardPreset;
  removeImage?: boolean;
}

/** A recipient-only, unacknowledged recognition event, not a permanent patch. */
export interface TeamAwardCelebration {
  id: string; teamId: string; teamName: string; awardId: string; name: string;
  description: string; presetIcon: AwardPreset; imageUrl: string | null;
  imageVersion: string; grantedAt: string; grantedByName: string;
}
export interface TeamAwardCelebrations {
  events: TeamAwardCelebration[];
  setupRequired?: boolean;
}

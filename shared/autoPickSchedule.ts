/**
 * Pure functions for building the rank-based auto-pick schedule.
 * Shared between client (preview step) and server (engine).
 */

export interface ScheduledSlot {
  type: "self" | "keep" | "buddy";
  playerId: string;
  originalRound: number;
  rolled: boolean;
}

export type AutoPickSchedule = Record<string, Record<string, ScheduledSlot>>;

export interface FlaggedSlot {
  round: number;
  teamId: string;
}

export function rankToRound(rank: string, skillScale: "numbers" | "letters"): number {
  if (!rank) return 0;
  if (skillScale === "letters") {
    const code = rank.toUpperCase().charCodeAt(0) - 65;
    return code + 1;
  }
  const n = parseInt(rank, 10);
  return isNaN(n) ? 0 : n;
}

export function buildRankScaleOptions(
  size: number,
  skillScale: "numbers" | "letters",
): string[] {
  const capped = Math.min(size, skillScale === "letters" ? 26 : 99);
  if (skillScale === "letters") {
    return Array.from({ length: capped }, (_, i) => String.fromCharCode(65 + i));
  }
  return Array.from({ length: capped }, (_, i) => String(i + 1));
}

export interface AutoPickInput {
  draftOrder: string[];
  totalRounds: number;
  captainAssignments: Record<string, string>;
  skillLevels: Record<string, string>;
  skillScale: "numbers" | "letters";
  keepersByTeam: Record<string, string[]>;
  buddyPairs?: string[][];
}

export function buildAutoPickSchedule(params: AutoPickInput): AutoPickSchedule {
  const {
    draftOrder,
    totalRounds,
    captainAssignments,
    skillLevels,
    skillScale,
    keepersByTeam,
    buddyPairs = [],
  } = params;

  const schedule: AutoPickSchedule = {};
  for (const teamId of draftOrder) {
    schedule[teamId] = {};
  }

  const taken = new Set<string>();

  const tryAllocate = (
    teamId: string,
    preferredRound: number,
    slotBase: Pick<ScheduledSlot, "type" | "playerId">,
  ): void => {
    if (preferredRound < 1) return;
    const originalRound = preferredRound;
    let round = preferredRound;
    while (round <= totalRounds) {
      const key = `${teamId}:${round}`;
      if (!taken.has(key)) {
        taken.add(key);
        if (!schedule[teamId]) schedule[teamId] = {};
        schedule[teamId][String(round)] = {
          ...slotBase,
          originalRound,
          rolled: round !== originalRound,
        };
        return;
      }
      round++;
    }
  };

  for (const teamId of draftOrder) {
    const captainId = captainAssignments[teamId];
    if (!captainId) continue;
    const rank = skillLevels[captainId];
    if (!rank) continue;
    const round = rankToRound(rank, skillScale);
    if (round < 1 || round > totalRounds) continue;
    tryAllocate(teamId, round, { type: "self", playerId: captainId });
  }

  for (const teamId of draftOrder) {
    const keepers = keepersByTeam[teamId] || [];
    for (const keeperId of keepers) {
      if (keeperId.startsWith("placeholder:")) continue;
      if (captainAssignments[teamId] === keeperId) continue;
      const rank = skillLevels[keeperId];
      if (!rank) continue;
      const round = rankToRound(rank, skillScale);
      if (round < 1 || round > totalRounds) continue;
      tryAllocate(teamId, round, { type: "keep", playerId: keeperId });
    }
  }

  for (const pair of buddyPairs) {
    for (const teamId of draftOrder) {
      const keepersForTeam = keepersByTeam[teamId] || [];
      for (const memberId of pair) {
        if (memberId === captainAssignments[teamId]) continue;
        if (!keepersForTeam.includes(memberId)) continue;
        if (memberId.startsWith("placeholder:")) continue;
        const rank = skillLevels[memberId];
        if (!rank) continue;
        const round = rankToRound(rank, skillScale);
        if (round < 1 || round > totalRounds) continue;
        tryAllocate(teamId, round, { type: "buddy", playerId: memberId });
      }
    }
  }

  return schedule;
}

export function validateKeeperRanks(
  captainId: string | undefined,
  keeperIds: string[],
  skillLevels: Record<string, string>,
): string[] {
  const players = captainId ? [captainId, ...keeperIds] : [...keeperIds];
  const rankCount = new Map<string, number>();
  for (const pid of players) {
    if (pid.startsWith("placeholder:")) continue;
    const rank = skillLevels[pid];
    if (!rank) continue;
    rankCount.set(rank, (rankCount.get(rank) || 0) + 1);
  }
  return Array.from(rankCount.entries())
    .filter(([, count]) => count > 1)
    .map(([rank]) => rank);
}

export interface CurrentTeam {
  id: string;
  leagueId: string | null;
  membershipLeagueId?: string | null;
  seasonIsActive?: boolean | null;
  isInCompletedTournament?: boolean;
}

export function activeTeamIds(teams: CurrentTeam[], leagueId?: string): Set<string> {
  return new Set(teams
    .filter(team => team.seasonIsActive !== false && !team.isInCompletedTournament)
    .filter(team => !leagueId || team.leagueId === leagueId || team.membershipLeagueId === leagueId)
    .map(team => team.id));
}

export function sharesCurrentTeam(viewerTeams: Set<string>, playerTeams: Set<string>): boolean {
  return Array.from(playerTeams).some(teamId => viewerTeams.has(teamId));
}
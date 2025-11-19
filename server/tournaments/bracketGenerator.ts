import { TournamentTeam, TournamentMatch } from "@shared/schema";

export interface BracketGeneratorResult {
  matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[];
  rounds: string[];
}

/**
 * Generate Single Elimination bracket
 * Works with any number of teams (handles byes for non-power-of-2)
 * Creates ALL matches upfront with TBD teams, handles byes correctly
 */
export function generateSingleElimination(
  teams: TournamentTeam[],
  tournamentId: string
): BracketGeneratorResult {
  const numTeams = teams.length;
  const numRounds = Math.ceil(Math.log2(numTeams));
  const bracketSize = Math.pow(2, numRounds);

  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];

  // Round names (build from finals backwards)
  const roundNames: string[] = [];
  if (numRounds >= 1) roundNames.unshift('Finals');
  if (numRounds >= 2) roundNames.unshift('Semifinals');
  if (numRounds >= 3) roundNames.unshift('Quarterfinals');
  for (let i = 4; i <= numRounds; i++) {
    roundNames.unshift(`Round ${i - numRounds + 1}`);
  }

  // Sort teams by seed
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);
  
  // Standard bracket pairing (1 vs lowest, 2 vs second-lowest, etc.)
  const firstRoundSlots: Array<{ team1Id: string | null; team2Id: string | null }> = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const team1 = sortedTeams[i] || null;
    const team2 = sortedTeams[bracketSize - 1 - i] || null;
    firstRoundSlots.push({
      team1Id: team1?.id || null,
      team2Id: team2?.id || null
    });
  }

  // Pre-calculate match numbering and track bye advances
  const matchIdMap: Record<string, number> = {};
  const byeAdvances: Record<string, string> = {}; // nextMatchKey -> teamId that got bye
  let matchCounter = 1;
  
  for (let roundIndex = 0; roundIndex < numRounds; roundIndex++) {
    const matchesInRound = Math.pow(2, numRounds - roundIndex - 1);
    for (let slotIndex = 0; slotIndex < matchesInRound; slotIndex++) {
      const matchKey = `${roundIndex}_${slotIndex}`;
      
      // Check if this is a bye in round 1
      if (roundIndex === 0) {
        const slot = firstRoundSlots[slotIndex];
        if (slot.team1Id && !slot.team2Id) {
          // Bye - mark team to auto-advance to next round
          const nextRoundIndex = 1;
          const nextSlotIndex = Math.floor(slotIndex / 2);
          const nextMatchKey = `${nextRoundIndex}_${nextSlotIndex}`;
          const position = slotIndex % 2 === 0 ? 'team1' : 'team2';
          byeAdvances[`${nextMatchKey}_${position}`] = slot.team1Id!;
          continue;
        }
      }
      
      matchIdMap[matchKey] = matchCounter++;
    }
  }
  
  // Now generate all matches with correct advancement IDs and bye teams
  for (let roundIndex = 0; roundIndex < numRounds; roundIndex++) {
    const roundName = roundNames[roundIndex];
    rounds.push(roundName);
    
    const matchesInRound = Math.pow(2, numRounds - roundIndex - 1);
    
    for (let slotIndex = 0; slotIndex < matchesInRound; slotIndex++) {
      const matchKey = `${roundIndex}_${slotIndex}`;
      const matchNumber = matchIdMap[matchKey];
      
      if (!matchNumber) continue; // Skip byes
      
      // Determine advancement
      const nextRoundIndex = roundIndex + 1;
      const nextSlotIndex = Math.floor(slotIndex / 2);
      const nextMatchKey = `${nextRoundIndex}_${nextSlotIndex}`;
      const nextMatchNumber = matchIdMap[nextMatchKey];
      const advancesToMatchId = nextMatchNumber ? `match_${nextMatchNumber}` : null;
      
      // First round: use actual teams
      if (roundIndex === 0) {
        const slot = firstRoundSlots[slotIndex];
        
        matches.push({
          tournamentId,
          gameId: null,
          round: roundName,
          matchNumber,
          bracketType: null,
          team1Id: slot.team1Id,
          team2Id: slot.team2Id,
          winnerId: null,
          team1Score: null,
          team2Score: null,
          advancesToMatchId,
          scheduledTime: null,
          location: null,
          status: 'scheduled',
          notes: null
        });
      } else {
        // Future rounds: check for bye advances, otherwise TBD
        const byeTeam1 = byeAdvances[`${matchKey}_team1`];
        const byeTeam2 = byeAdvances[`${matchKey}_team2`];
        
        const prevMatch1Key = `${roundIndex - 1}_${slotIndex * 2}`;
        const prevMatch2Key = `${roundIndex - 1}_${slotIndex * 2 + 1}`;
        const prevMatch1Num = matchIdMap[prevMatch1Key];
        const prevMatch2Num = matchIdMap[prevMatch2Key];
        
        let team1Note = byeTeam1 ? 'Bye advance' : (prevMatch1Num ? `Winner of Match ${prevMatch1Num}` : 'TBD');
        let team2Note = byeTeam2 ? 'Bye advance' : (prevMatch2Num ? `Winner of Match ${prevMatch2Num}` : 'TBD');
        
        matches.push({
          tournamentId,
          gameId: null,
          round: roundName,
          matchNumber,
          bracketType: null,
          team1Id: byeTeam1 || null,
          team2Id: byeTeam2 || null,
          winnerId: null,
          team1Score: null,
          team2Score: null,
          advancesToMatchId,
          scheduledTime: null,
          location: null,
          status: 'scheduled',
          notes: `${team1Note} vs ${team2Note}`
        });
      }
    }
  }

  return { matches, rounds };
}

/**
 * Generate Double Elimination bracket
 * NOTE: Simplified implementation - creates winners bracket + placeholder losers matches
 * Full double elimination with automatic loser routing requires additional schema fields
 * (e.g., dropsToMatchId) and is marked for future enhancement
 */
export function generateDoubleElimination(
  teams: TournamentTeam[],
  tournamentId: string
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];

  // Sort teams by seed
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);
  
  // Use single elimination logic for winners bracket
  const winnersBracket = generateSingleElimination(teams, tournamentId);
  
  // Add "Winners" prefix to rounds for consistency
  winnersBracket.rounds.forEach(round => {
    rounds.push(`Winners ${round}`);
  });
  
  // Update winners bracket matches with prefixed round names and bracketType
  winnersBracket.matches.forEach(match => {
    matches.push({
      ...match,
      round: `Winners ${match.round}`, // Match the rounds array
      bracketType: 'winners'
    });
  });
  
  // Add placeholder losers bracket rounds
  // In a full implementation, these would be auto-populated as teams lose in winners bracket
  const numLosersRounds = Math.max(1, winnersBracket.rounds.length - 1);
  
  for (let i = 1; i <= numLosersRounds; i++) {
    rounds.push(`Losers Round ${i}`);
  }
  
  // Add Grand Finals
  rounds.push('Grand Finals');
  
  // Create placeholder Grand Finals match (will be filled when winners/losers finalists are known)
  matches.push({
    tournamentId,
    gameId: null,
    round: 'Grand Finals',
    matchNumber: matches.length + 1,
    bracketType: 'grand_final',
    team1Id: null, // Winner of Winners Bracket
    team2Id: null, // Winner of Losers Bracket
    winnerId: null,
    team1Score: null,
    team2Score: null,
    advancesToMatchId: null,
    scheduledTime: null,
    location: null,
    status: 'scheduled',
    notes: 'Winner of Winners Bracket vs Winner of Losers Bracket'
  });

  return { matches, rounds };
}

/**
 * Generate Round Robin schedule
 * Every team plays every other team once
 */
export function generateRoundRobin(
  teams: TournamentTeam[],
  tournamentId: string
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];

  let matchNum = 1;
  const roundName = 'Round Robin';
  rounds.push(roundName);

  // Generate all possible matchups
  for (let i = 0; i < numTeams; i++) {
    for (let j = i + 1; j < numTeams; j++) {
      matches.push({
        tournamentId,
        gameId: null,
        round: roundName,
        matchNumber: matchNum++,
        bracketType: null,
        team1Id: teams[i].id,
        team2Id: teams[j].id,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null, // No advancement in round robin
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: null
      });
    }
  }

  return { matches, rounds };
}

/**
 * Generate Round Robin with divisions (split)
 * Divide teams into divisions, round robin within divisions, then playoffs
 */
export function generateRoundRobinSplit(
  teams: TournamentTeam[],
  tournamentId: string,
  numDivisions: number = 2
): BracketGeneratorResult {
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];

  // Divide teams into divisions based on seed
  const divisions: TournamentTeam[][] = Array.from({ length: numDivisions }, () => []);
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);

  // Snake draft style division assignment for fairness
  sortedTeams.forEach((team, index) => {
    const divisionIndex = Math.floor(index / Math.ceil(teams.length / numDivisions)) % numDivisions;
    divisions[divisionIndex].push(team);
  });

  let matchNum = 1;

  // Generate round robin for each division
  divisions.forEach((divisionTeams, divIndex) => {
    const divisionName = String.fromCharCode(65 + divIndex); // A, B, C, etc.
    const roundName = `Division ${divisionName}`;
    rounds.push(roundName);

    // Round robin within division
    for (let i = 0; i < divisionTeams.length; i++) {
      for (let j = i + 1; j < divisionTeams.length; j++) {
        matches.push({
          tournamentId,
          gameId: null,
          round: roundName,
          matchNumber: matchNum++,
          bracketType: null,
          team1Id: divisionTeams[i].id,
          team2Id: divisionTeams[j].id,
          winnerId: null,
          team1Score: null,
          team2Score: null,
          advancesToMatchId: null,
          scheduledTime: null,
          location: null,
          status: 'scheduled',
          notes: null
        });
      }
    }
  });

  // Add playoff rounds (top teams from each division)
  rounds.push('Semifinals');
  rounds.push('Finals');

  // Placeholder playoff matches (will be populated after division play)
  matches.push({
    tournamentId,
    gameId: null,
    round: 'Semifinals',
    matchNumber: matchNum++,
    bracketType: null,
    team1Id: null, // Division A winner
    team2Id: null, // Division B runner-up
    winnerId: null,
    team1Score: null,
    team2Score: null,
    advancesToMatchId: `finals_match`,
    scheduledTime: null,
    location: null,
    status: 'scheduled',
    notes: 'Division A Winner vs Division B Runner-up'
  });

  matches.push({
    tournamentId,
    gameId: null,
    round: 'Semifinals',
    matchNumber: matchNum++,
    bracketType: null,
    team1Id: null, // Division B winner
    team2Id: null, // Division A runner-up
    winnerId: null,
    team1Score: null,
    team2Score: null,
    advancesToMatchId: `finals_match`,
    scheduledTime: null,
    location: null,
    status: 'scheduled',
    notes: 'Division B Winner vs Division A Runner-up'
  });

  matches.push({
    tournamentId,
    gameId: null,
    round: 'Finals',
    matchNumber: matchNum++,
    bracketType: null,
    team1Id: null, // Semifinal 1 winner
    team2Id: null, // Semifinal 2 winner
    winnerId: null,
    team1Score: null,
    team2Score: null,
    advancesToMatchId: null,
    scheduledTime: null,
    location: null,
    status: 'scheduled',
    notes: null
  });

  return { matches, rounds };
}

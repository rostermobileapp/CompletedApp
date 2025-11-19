import { TournamentTeam, TournamentMatch } from "@shared/schema";

export interface BracketGeneratorResult {
  matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[];
  rounds: string[];
}

/**
 * Build canonical seed slots using recursive pairing
 * Returns array of seed positions in bracket order (1 vs 16, 8 vs 9, etc.)
 */
function buildSeedSlots(bracketSize: number): number[] {
  if (bracketSize === 1) return [1];
  if (bracketSize === 2) return [1, 2];
  
  // Recursively build smaller bracket
  const halfSlots = buildSeedSlots(bracketSize / 2);
  const slots: number[] = [];
  
  // Interleave with complementary seeds (1,16 -> 1,16,8,9 -> ...)
  for (const seed of halfSlots) {
    slots.push(seed);
    slots.push(bracketSize + 1 - seed); // Complementary seed
  }
  
  return slots;
}

/**
 * Generate Single Elimination bracket
 * Uses canonical seeding to properly handle byes for any team count
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

  // Round names
  const roundNames: string[] = [];
  if (numRounds >= 1) roundNames.unshift('Finals');
  if (numRounds >= 2) roundNames.unshift('Semifinals');
  if (numRounds >= 3) roundNames.unshift('Quarterfinals');
  for (let i = 4; i <= numRounds; i++) {
    roundNames.unshift(`Round ${i - numRounds + 1}`);
  }

  // Sort teams by seed
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);
  
  // Build canonical seed slots (1 vs bracketSize, 2 vs bracketSize-1, etc.)
  const seedSlots = buildSeedSlots(bracketSize);
  
  // Map seeds to actual teams (or null for byes beyond numTeams)
  const slotTeams: Array<TournamentTeam | null> = seedSlots.map(seed => {
    return seed <= numTeams ? sortedTeams[seed - 1] : null;
  });

  // Build bracket tree bottom-up
  interface BracketNode {
    team: TournamentTeam | null;
    matchNumber: number | null;
    roundIndex: number;
    position: number; // position within round
  }

  // Create leaf nodes for all bracket positions
  let currentLevel: BracketNode[] = slotTeams.map((team, idx) => ({
    team,
    matchNumber: null,
    roundIndex: 0,
    position: idx
  }));

  let matchCounter = 1;
  const allMatches: Array<{
    roundIndex: number;
    roundName: string;
    position: number;
    matchNumber: number;
    team1: TournamentTeam | null;
    team2: TournamentTeam | null;
    advancesToMatchNumber: number | null;
    node1MatchNumber: number | null;
    node2MatchNumber: number | null;
  }> = [];

  // Build bracket tree level by level
  for (let roundIndex = 0; roundIndex < numRounds; roundIndex++) {
    const roundName = roundNames[roundIndex];
    rounds.push(roundName);
    
    const nextLevel: BracketNode[] = [];
    
    // Pair adjacent nodes - ALWAYS create matches, never skip
    for (let i = 0; i < currentLevel.length; i += 2) {
      const node1 = currentLevel[i];
      const node2 = currentLevel[i + 1];
      const position = Math.floor(i / 2);
      
      // Check if either slot has content (team or previous match)
      const hasContent1 = node1.team || node1.matchNumber;
      const hasContent2 = node2.team || node2.matchNumber;
      
      // Determine if this is a bye (one has a team, other has no content at all)
      const isBye = (node1.team && !hasContent2) || (node2.team && !hasContent1);
      const byeWinner = node1.team && !hasContent2 ? node1.team : 
                        node2.team && !hasContent1 ? node2.team : null;
      
      if (!hasContent1 && !hasContent2) {
        // Both empty - create TBD placeholder
        nextLevel.push({
          team: null,
          matchNumber: null,
          roundIndex: roundIndex + 1,
          position
        });
      } else {
        // At least one slot has content - create the match
        const matchNumber = matchCounter++;
        
        // If this is a bye, the winner is already known
        nextLevel.push({
          team: isBye ? byeWinner : null, // Bye recipient auto-advances
          matchNumber,
          roundIndex: roundIndex + 1,
          position
        });
        
        allMatches.push({
          roundIndex,
          roundName,
          position,
          matchNumber,
          team1: node1.team,
          team2: node2.team,
          advancesToMatchNumber: null, // Will be set below
          node1MatchNumber: node1.matchNumber,
          node2MatchNumber: node2.matchNumber
        });
      }
    }
    
    currentLevel = nextLevel;
  }

  // Set advancement pointers by walking matches in reverse
  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i];
    const nextRoundIndex = match.roundIndex + 1;
    const nextPosition = Math.floor(match.position / 2);
    
    // Find the match in the next round that this match feeds into
    const nextMatch = allMatches.find(m => 
      m.roundIndex === nextRoundIndex && m.position === nextPosition
    );
    
    match.advancesToMatchNumber = nextMatch?.matchNumber || null;
  }

  // Convert to final match format
  allMatches.forEach(match => {
    // Build descriptive notes
    let notes: string | null = null;
    
    // Build team1 description
    let team1Desc = '';
    if (match.team1) {
      team1Desc = match.team1.teamName;
    } else if (match.node1MatchNumber) {
      team1Desc = `Winner of Match ${match.node1MatchNumber}`;
    } else {
      team1Desc = 'TBD';
    }
    
    // Build team2 description
    let team2Desc = '';
    if (match.team2) {
      team2Desc = match.team2.teamName;
    } else if (match.node2MatchNumber) {
      team2Desc = `Winner of Match ${match.node2MatchNumber}`;
    } else {
      team2Desc = 'TBD';
    }
    
    // Only add notes if there's something meaningful to say
    if (!match.team1 || !match.team2) {
      notes = `${team1Desc} vs ${team2Desc}`;
    }
    
    matches.push({
      tournamentId,
      gameId: null,
      round: match.roundName,
      matchNumber: match.matchNumber,
      bracketType: null,
      team1Id: match.team1?.id || null,
      team2Id: match.team2?.id || null,
      winnerId: null,
      team1Score: null,
      team2Score: null,
      advancesToMatchId: match.advancesToMatchNumber ? `match_${match.advancesToMatchNumber}` : null,
      scheduledTime: null,
      location: null,
      status: 'scheduled',
      notes
    });
  });

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

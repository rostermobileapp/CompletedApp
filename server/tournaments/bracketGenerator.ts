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
  tournamentId: string,
  settings: any = {}
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];

  // Sort teams by seed
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);
  
  // Check bye policy from settings (default to top seed bye)
  const byePolicy = settings.byePolicy || 'top_seed_bye';
  const needsBye = numTeams % 2 === 1;
  const firstRoundMatchCount = Math.floor(numTeams / 2);
  
  let matchCounter = 1;
  const matchLookup = new Map<string, number>(); // Round/position key -> match number
  
  // ============ WINNERS BRACKET ============
  
  // Handle play-in game if needed (treated as preliminary round before Winners Round 1)
  if (needsBye && byePolicy === 'play_in_game') {
    rounds.push('Play-In Round');
    const playInMatchNum = matchCounter++;
    matchLookup.set(`PLAY_IN`, playInMatchNum);
    
    // Play-in game: Bottom 2 seeds play for the last spot
    matches.push({
      tournamentId,
      gameId: null,
      round: 'Play-In Round',
      matchNumber: playInMatchNum,
      bracketType: 'winners',
      team1Id: sortedTeams[numTeams - 2].id, // Second to last seed
      team2Id: sortedTeams[numTeams - 1].id, // Last seed
      winnerId: null,
      team1Score: null,
      team2Score: null,
      advancesToMatchId: null, // Will be filled when creating Round 1
      scheduledTime: null,
      location: null,
      status: 'scheduled',
      notes: 'Play-in game for final spot in Winners Round 1'
    });
  }
  
  // Winners Round 1: Exactly 4 matches for 9 teams
  rounds.push('Winners Round 1');
  
  const winnersR1Matches: Array<{
    matchNumber: number;
    team1: TournamentTeam | null;
    team2: TournamentTeam | null;
    position: number;
  }> = [];
  
  for (let i = 0; i < firstRoundMatchCount; i++) {
    const matchNum = matchCounter++;
    matchLookup.set(`WR1-${i}`, matchNum);
    
    let team1: TournamentTeam | null = null;
    let team2: TournamentTeam | null = null;
    
    if (needsBye && byePolicy === 'play_in_game') {
      // Play-in scenario: First match is #1 seed vs play-in winner
      if (i === 0) {
        team1 = sortedTeams[0]; // Top seed
        team2 = null; // Play-in winner (TBD)
      } else {
        // Pair remaining teams: 2v7, 3v6, 4v5
        const idx = i - 1;
        team1 = sortedTeams[idx + 1];
        team2 = sortedTeams[numTeams - 2 - idx];
      }
    } else {
      // Top seed bye OR even teams: Standard pairing
      if (needsBye) {
        // Skip top seed (they get bye to Round 2)
        team1 = sortedTeams[i + 1];
        team2 = sortedTeams[numTeams - 1 - i];
      } else {
        // Even teams: Normal pairing
        team1 = sortedTeams[i];
        team2 = sortedTeams[numTeams - 1 - i];
      }
    }
    
    matches.push({
      tournamentId,
      gameId: null,
      round: 'Winners Round 1',
      matchNumber: matchNum,
      bracketType: 'winners',
      team1Id: team1?.id || null,
      team2Id: team2?.id || null,
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
  
  // Calculate winners bracket structure
  const winnersRounds = Math.ceil(Math.log2(numTeams));
  const winnersMatchCounts = [firstRoundMatchCount];
  for (let i = 1; i < winnersRounds; i++) {
    const prevCount = winnersMatchCounts[i - 1];
    const byeInPrevRound = needsBye && i === 1;
    winnersMatchCounts.push(Math.ceil((prevCount + (byeInPrevRound ? 1 : 0)) / 2));
  }
  
  // Create remaining winners bracket rounds
  const winnerRoundNames = ['Winners Round 1'];
  for (let roundIdx = 1; roundIdx < winnersRounds; roundIdx++) {
    const matchCount = winnersMatchCounts[roundIdx];
    let roundName: string;
    
    if (winnersRounds - roundIdx === 1) roundName = 'Winners Finals';
    else if (winnersRounds - roundIdx === 2) roundName = 'Winners Semifinals';
    else if (winnersRounds - roundIdx === 3) roundName = 'Winners Quarterfinals';
    else roundName = `Winners Round ${roundIdx + 1}`;
    
    rounds.push(roundName);
    winnerRoundNames.push(roundName);
    
    for (let matchPos = 0; matchPos < matchCount; matchPos++) {
      const matchNum = matchCounter++;
      matchLookup.set(`W-R${roundIdx + 1}-${matchPos}`, matchNum);
      
      // Determine source teams
      let team1Id: string | null = null;
      let team2Id: string | null = null;
      
      // Handle bye scenarios in round 2
      if (roundIdx === 1 && needsBye && byePolicy === 'top_seed_bye' && matchPos === 0) {
        // Top seed bye: Top seed faces winner of first R1 match
        team1Id = sortedTeams[0].id; // Top seed with bye
      }
      // For play-in policy: no byes needed, all teams already matched in Round 1
      
      matches.push({
        tournamentId,
        gameId: null,
        round: roundName,
        matchNumber: matchNum,
        bracketType: 'winners',
        team1Id,
        team2Id,
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
  
  // ============ LOSERS BRACKET ============
  
  // Losers bracket has 2*(winnersRounds - 1) rounds
  // Pattern: WB R1 losers → LB R1, WB R2 losers meet LB R1 winners → LB R2, etc.
  const losersRounds = 2 * (winnersRounds - 1);
  const losersMatchCounts: number[] = [];
  
  for (let losersRoundIdx = 0; losersRoundIdx < losersRounds; losersRoundIdx++) {
    const roundName = `Losers Round ${losersRoundIdx + 1}`;
    rounds.push(roundName);
    
    // Determine number of matches in this losers round
    // Odd-indexed rounds (0,2,4...) receive dropdowns from winners bracket
    // Even-indexed rounds (1,3,5...) are consolidation rounds
    const isDropRound = losersRoundIdx % 2 === 0;
    const winnersSourceRound = Math.floor(losersRoundIdx / 2);
    
    let matchCount: number;
    if (isDropRound) {
      // Drop round: same as corresponding winners round
      matchCount = winnersMatchCounts[winnersSourceRound] || 1;
    } else {
      // Consolidation round: half of previous losers round
      const prevLosersCount = losersMatchCounts[losersRoundIdx - 1] || firstRoundMatchCount;
      matchCount = Math.ceil(prevLosersCount / 2);
    }
    
    losersMatchCounts.push(matchCount);
    
    for (let matchPos = 0; matchPos < matchCount; matchPos++) {
      const matchNum = matchCounter++;
      matchLookup.set(`L-R${losersRoundIdx + 1}-${matchPos}`, matchNum);
      
      matches.push({
        tournamentId,
        gameId: null,
        round: roundName,
        matchNumber: matchNum,
        bracketType: 'losers',
        team1Id: null,
        team2Id: null,
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
  
  // ============ GRAND FINALS ============
  
  rounds.push('Grand Finals');
  matches.push({
    tournamentId,
    gameId: null,
    round: 'Grand Finals',
    matchNumber: matchCounter++,
    bracketType: 'grand_final',
    team1Id: null, // Winner of Winners Finals
    team2Id: null, // Winner of Losers Finals
    winnerId: null,
    team1Score: null,
    team2Score: null,
    advancesToMatchId: null,
    scheduledTime: null,
    location: null,
    status: 'scheduled',
    notes: 'Winners Finals winner vs Losers Finals winner'
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

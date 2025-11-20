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
 * Generate Double Elimination bracket using universal formulas
 * Works for ANY team count (4, 8, 9, 16, 32, etc.)
 * 
 * Core Formulas:
 * - Winners Rounds = ceil(log₂(teamCount))
 * - Winners Round 1 Matches = ceil(teamCount / 2)
 * - Winners Round N Matches = Round (N-1) Matches / 2
 * - Losers Rounds = (Winners Rounds × 2) - 1
 * - Losers alternates: Elimination rounds (odd) receive winners bracket losers
 *                      Merger rounds (even) combine with previous losers
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
  
  let matchCounter = 1;
  const matchLookup = new Map<string, number>(); // key -> match number
  
  // ============ CORE FORMULAS ============
  
  // Calculate effective team count after play-in
  const effectiveTeamCount = (needsBye && byePolicy === 'play_in_game') 
    ? numTeams - 1  // Play-in reduces field by 1
    : numTeams;
  
  const winnersRounds = Math.ceil(Math.log2(effectiveTeamCount));
  
  // Calculate Round 1 matches based on bye policy
  let winnersR1Matches: number;
  if (needsBye && byePolicy === 'top_seed_bye') {
    // Top seed bye: Only the non-bye teams play in Round 1
    winnersR1Matches = Math.floor((numTeams - 1) / 2);
  } else if (needsBye && byePolicy === 'play_in_game') {
    // Play-in: After consolidating bottom 2, effective field is even
    winnersR1Matches = Math.floor(effectiveTeamCount / 2);
  } else {
    // Even teams: Standard calculation
    winnersR1Matches = Math.ceil(numTeams / 2);
  }
  
  const losersRounds = (winnersRounds * 2) - 1;
  
  // Calculate match counts for each winners round
  const winnersMatchCounts: number[] = [winnersR1Matches];
  
  if (needsBye && byePolicy === 'top_seed_bye') {
    // Top seed bye: Track advancing teams through rounds
    // R1: winnersR1Matches winners + 1 (top seed) = winnersR1Matches + 1 teams for R2
    let teamsInRound = winnersR1Matches + 1; // Winners from R1 + top seed
    
    for (let r = 1; r < winnersRounds; r++) {
      // Each round: floor(teams/2) matches, with ceil(teams/2) advancing (includes byes)
      const matchesThisRound = Math.floor(teamsInRound / 2);
      winnersMatchCounts.push(matchesThisRound);
      // Advancing teams = winners from matches + byes
      teamsInRound = Math.ceil(teamsInRound / 2);
    }
  } else {
    // Play-in or even teams: Standard halving formula
    for (let r = 1; r < winnersRounds; r++) {
      const prevCount = winnersMatchCounts[r - 1];
      winnersMatchCounts.push(Math.ceil(prevCount / 2));
    }
  }
  
  // ============ WINNERS BRACKET ============
  
  // Handle play-in game if needed
  if (needsBye && byePolicy === 'play_in_game') {
    rounds.push('Play-In Round');
    const playInMatchNum = matchCounter++;
    matchLookup.set(`PLAY_IN`, playInMatchNum);
    
    matches.push({
      tournamentId,
      gameId: null,
      round: 'Play-In Round',
      matchNumber: playInMatchNum,
      bracketType: 'winners',
      team1Id: sortedTeams[numTeams - 2].id,
      team2Id: sortedTeams[numTeams - 1].id,
      winnerId: null,
      team1Score: null,
      team2Score: null,
      advancesToMatchId: null,
      scheduledTime: null,
      location: null,
      status: 'scheduled',
      notes: 'Play-in: Bottom 2 seeds compete for final spot'
    });
  }
  
  // Create all winners bracket rounds
  for (let roundIdx = 0; roundIdx < winnersRounds; roundIdx++) {
    const matchCount = winnersMatchCounts[roundIdx];
    let roundName: string;
    
    if (roundIdx === 0) roundName = 'Winners Round 1';
    else if (winnersRounds - roundIdx === 1) roundName = 'Winners Finals';
    else if (winnersRounds - roundIdx === 2) roundName = 'Winners Semifinals';
    else if (winnersRounds - roundIdx === 3) roundName = 'Winners Quarterfinals';
    else roundName = `Winners Round ${roundIdx + 1}`;
    
    rounds.push(roundName);
    
    for (let matchPos = 0; matchPos < matchCount; matchPos++) {
      const matchNum = matchCounter++;
      matchLookup.set(`W-R${roundIdx + 1}-M${matchPos + 1}`, matchNum);
      
      // Determine initial teams for Round 1
      let team1Id: string | null = null;
      let team2Id: string | null = null;
      let notes: string | null = null;
      
      if (roundIdx === 0) {
        // Winners Round 1 - seed teams
        if (needsBye && byePolicy === 'play_in_game') {
          if (matchPos === 0) {
            // First match: #1 seed vs play-in winner
            team1Id = sortedTeams[0].id;
            team2Id = null; // TBD from play-in
            notes = 'Top seed vs Play-in winner';
          } else {
            // Pair remaining teams (seeds 2 through numTeams-2)
            // After play-in consolidates bottom 2, we have seeds 2...(numTeams-2)
            // Pair them: 2 vs (numTeams-2), 3 vs (numTeams-3), etc.
            const lowSeedIdx = matchPos; // 1 → seed 2, 2 → seed 3, etc.
            const highSeedIdx = numTeams - 1 - matchPos; // Account for removed bottom 2
            team1Id = sortedTeams[lowSeedIdx].id;
            team2Id = sortedTeams[highSeedIdx - 1].id; // -1 to skip the play-in loser
          }
        } else if (needsBye && byePolicy === 'top_seed_bye') {
          // Top seed gets bye - pair others
          team1Id = sortedTeams[matchPos + 1].id;
          team2Id = sortedTeams[numTeams - 1 - matchPos].id;
        } else {
          // Even teams - canonical pairing
          team1Id = sortedTeams[matchPos].id;
          team2Id = sortedTeams[numTeams - 1 - matchPos].id;
        }
      } else if (roundIdx === 1 && needsBye && byePolicy === 'top_seed_bye' && matchPos === 0) {
        // Round 2, first match with top seed bye
        team1Id = sortedTeams[0].id;
        notes = 'Top seed (bye) vs R1 winner';
      }
      
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
        advancesToMatchId: null, // Will be set after all matches created
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes
      });
    }
  }
  
  // ============ LOSERS BRACKET ============
  
  // Losers Rounds = (Winners Rounds × 2) - 1
  // Alternates between Elimination (odd: 1,3,5...) and Merger (even: 2,4,6...) rounds
  const losersMatchCounts: number[] = [];
  
  for (let losersRoundIdx = 0; losersRoundIdx < losersRounds; losersRoundIdx++) {
    const roundNumber = losersRoundIdx + 1;
    const isEliminationRound = roundNumber % 2 === 1; // Odd rounds (1, 3, 5...)
    
    let roundName: string;
    if (losersRoundIdx === losersRounds - 1) {
      roundName = 'Losers Finals';
    } else {
      roundName = `Losers Round ${roundNumber}`;
    }
    
    rounds.push(roundName);
    
    // Calculate match count
    let matchCount: number;
    if (isEliminationRound) {
      // Elimination round: receives losers from winners bracket
      // Number of losers dropping = winners matches played
      // These losers need to be paired up: ceil(losers / 2)
      const winnersSourceRoundIdx = Math.floor(losersRoundIdx / 2);
      const droppingTeams = winnersMatchCounts[winnersSourceRoundIdx] || 1;
      matchCount = Math.ceil(droppingTeams / 2);
    } else {
      // Merger round: combines with previous losers round
      // Use Math.ceil to preserve odd-match rounds
      const prevLosersCount = losersMatchCounts[losersRoundIdx - 1] || winnersR1Matches;
      matchCount = Math.ceil(prevLosersCount / 2);
    }
    
    losersMatchCounts.push(matchCount);
    
    for (let matchPos = 0; matchPos < matchCount; matchPos++) {
      const matchNum = matchCounter++;
      matchLookup.set(`L-R${roundNumber}-M${matchPos + 1}`, matchNum);
      
      let notes: string | null = null;
      if (isEliminationRound) {
        const wRound = Math.floor(losersRoundIdx / 2) + 1;
        notes = `Receives losers from Winners Round ${wRound}`;
      } else {
        notes = `Merger round: Previous losers combine`;
      }
      
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
        notes
      });
    }
  }
  
  // ============ GRAND FINALS ============
  
  rounds.push('Grand Finals');
  const grandFinalsNum = matchCounter++;
  matchLookup.set('GRAND_FINALS', grandFinalsNum);
  
  matches.push({
    tournamentId,
    gameId: null,
    round: 'Grand Finals',
    matchNumber: grandFinalsNum,
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

  // ============ SET ADVANCEMENT POINTERS ============
  
  // Winners bracket advancement (blue arrows →)
  for (let roundIdx = 0; roundIdx < winnersRounds - 1; roundIdx++) {
    const matchCount = winnersMatchCounts[roundIdx];
    
    for (let matchPos = 0; matchPos < matchCount; matchPos++) {
      const currentMatchNum = matchLookup.get(`W-R${roundIdx + 1}-M${matchPos + 1}`);
      if (!currentMatchNum) continue;
      
      // Winner advances to next round
      const nextRoundMatchPos = Math.floor(matchPos / 2);
      const nextMatchNum = matchLookup.get(`W-R${roundIdx + 2}-M${nextRoundMatchPos + 1}`);
      
      if (nextMatchNum) {
        const match = matches.find(m => m.matchNumber === currentMatchNum);
        if (match) {
          match.advancesToMatchId = `match_${nextMatchNum}`;
        }
      }
    }
  }
  
  // Winners Finals → Grand Finals
  const winnersFinalsNum = matchLookup.get(`W-R${winnersRounds}-M1`);
  if (winnersFinalsNum) {
    const match = matches.find(m => m.matchNumber === winnersFinalsNum);
    if (match) {
      match.advancesToMatchId = `match_${grandFinalsNum}`;
    }
  }
  
  // Losers bracket advancement
  for (let roundIdx = 0; roundIdx < losersRounds - 1; roundIdx++) {
    const matchCount = losersMatchCounts[roundIdx];
    
    for (let matchPos = 0; matchPos < matchCount; matchPos++) {
      const currentMatchNum = matchLookup.get(`L-R${roundIdx + 1}-M${matchPos + 1}`);
      if (!currentMatchNum) continue;
      
      // Winner advances to next losers round
      const nextRoundMatchPos = Math.floor(matchPos / 2);
      const nextMatchNum = matchLookup.get(`L-R${roundIdx + 2}-M${nextRoundMatchPos + 1}`);
      
      if (nextMatchNum) {
        const match = matches.find(m => m.matchNumber === currentMatchNum);
        if (match) {
          match.advancesToMatchId = `match_${nextMatchNum}`;
        }
      }
    }
  }
  
  // Losers Finals → Grand Finals
  const losersFinalsNum = matchLookup.get(`L-R${losersRounds}-M1`);
  if (losersFinalsNum) {
    const match = matches.find(m => m.matchNumber === losersFinalsNum);
    if (match) {
      match.advancesToMatchId = `match_${grandFinalsNum}`;
    }
  }
  
  // Play-in → Winners R1 M1 (if exists)
  if (needsBye && byePolicy === 'play_in_game') {
    const playInNum = matchLookup.get('PLAY_IN');
    const wr1m1Num = matchLookup.get('W-R1-M1');
    if (playInNum && wr1m1Num) {
      const match = matches.find(m => m.matchNumber === playInNum);
      if (match) {
        match.advancesToMatchId = `match_${wr1m1Num}`;
      }
    }
  }

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

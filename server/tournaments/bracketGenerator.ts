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
 * Supports play-in games for odd team counts
 */
export function generateSingleElimination(
  teams: TournamentTeam[],
  tournamentId: string,
  settings: any = {}
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];

  // Sort teams by seed
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);

  let matchCounter = 1;
  
  // Check if we need a play-in game (odd teams with play_in_game policy)
  const byePolicy = settings.byePolicy || 'top_seed_bye';
  const needsPlayIn = numTeams % 2 === 1 && byePolicy === 'play_in_game';
  
  // If we have a play-in game, reduce effective team count by 1
  const effectiveTeamCount = needsPlayIn ? numTeams - 1 : numTeams;
  const numRounds = Math.ceil(Math.log2(effectiveTeamCount));
  const bracketSize = Math.pow(2, numRounds);

  // Build round names based on effective team count
  const roundNames: string[] = [];
  if (numRounds >= 1) roundNames.unshift('Finals');
  if (numRounds >= 2) roundNames.unshift('Semifinals');
  if (numRounds >= 3) roundNames.unshift('Quarterfinals');
  for (let i = 4; i <= numRounds; i++) {
    roundNames.unshift(`Round ${i - numRounds + 1}`);
  }

  // Add play-in round if needed
  if (needsPlayIn) {
    rounds.push('Play-In Round');
    const playInMatchNum = matchCounter++;
    
    matches.push({
      tournamentId,
      gameId: null,
      round: 'Play-In Round',
      matchNumber: playInMatchNum,
      bracketType: null,
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

  // Build canonical seed slots for effective team count
  const seedSlots = buildSeedSlots(bracketSize);
  
  // Map seeds to teams for Round 1
  // For play-in: use top (numTeams-2) seeds, then add null for play-in winner spot
  let round1Teams: Array<TournamentTeam | null> = [];
  if (needsPlayIn) {
    round1Teams = sortedTeams.slice(0, numTeams - 2) as Array<TournamentTeam | null>;
    // Add null for play-in winner spot (will be determined after play-in match)
    round1Teams.push(null);
  } else {
    round1Teams = sortedTeams as Array<TournamentTeam | null>;
  }
  
  // Map seed slots to teams (or null for byes/play-in winner if bracketSize > effectiveTeamCount)
  const slotTeams: Array<TournamentTeam | null> = seedSlots.map(seed => {
    return seed <= effectiveTeamCount ? (round1Teams[seed - 1] || null) : null;
  });

  // Build bracket tree using canonical seeding
  interface BracketNode {
    team: TournamentTeam | null;
    matchNumber: number | null;
  }

  let currentLevel: BracketNode[] = slotTeams.map(team => ({
    team,
    matchNumber: null
  }));

  const allMatches: Array<{
    roundIndex: number;
    roundName: string;
    position: number;
    matchNumber: number;
    team1: TournamentTeam | null;
    team2: TournamentTeam | null;
    isBye: boolean;
    byeWinner: TournamentTeam | null;
    sourceMatch1: number | null;
    sourceMatch2: number | null;
  }> = [];

  // Build bracket tree level by level
  for (let roundIndex = 0; roundIndex < numRounds; roundIndex++) {
    const roundName = roundNames[roundIndex];
    rounds.push(roundName);
    
    const nextLevel: BracketNode[] = [];
    
    // Pair adjacent teams
    for (let i = 0; i < currentLevel.length; i += 2) {
      const node1 = currentLevel[i];
      const node2 = currentLevel[i + 1];
      const position = Math.floor(i / 2);
      
      const hasContent1 = node1.team || node1.matchNumber !== null;
      const hasContent2 = node2.team || node2.matchNumber !== null;
      
      // Bye logic: only true bye if one has DIRECT team (not from match) and other is completely empty
      const isTrueBye = (node1.team && !hasContent2) || (node2.team && !hasContent1);
      const byeWinner = node1.team && !hasContent2 ? node1.team :
                        node2.team && !hasContent1 ? node2.team : null;
      
      if (!hasContent1 && !hasContent2) {
        // Both empty - skip
        nextLevel.push({ team: null, matchNumber: null });
      } else {
        // Create match
        const matchNumber = matchCounter++;
        
        allMatches.push({
          roundIndex,
          roundName,
          position,
          matchNumber,
          team1: node1.team || null,
          team2: node2.team || null,
          isBye: isTrueBye,
          byeWinner,
          sourceMatch1: node1.matchNumber,
          sourceMatch2: node2.matchNumber
        });
        
        // Winner advances to next level
        nextLevel.push({
          team: isTrueBye ? byeWinner : null,
          matchNumber
        });
      }
    }
    
    currentLevel = nextLevel;
  }

  // Set advancement pointers
  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i];
    const nextRoundIndex = match.roundIndex + 1;
    const nextPosition = Math.floor(match.position / 2);
    
    const nextMatch = allMatches.find(m => 
      m.roundIndex === nextRoundIndex && m.position === nextPosition
    );
    
    const advancesTo = nextMatch?.matchNumber || null;
    
    // Convert to final format
    let notes: string | null = null;
    if (match.team1 && match.team2) {
      // Normal match - no notes needed
    } else if (match.isBye && match.byeWinner) {
      notes = `${match.byeWinner.teamName} gets a bye`;
    } else {
      const team1Desc = match.team1?.teamName || (match.sourceMatch1 ? `Winner of Match ${match.sourceMatch1}` : 'TBD');
      const team2Desc = match.team2?.teamName || (match.sourceMatch2 ? `Winner of Match ${match.sourceMatch2}` : 'TBD');
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
      advancesToMatchId: advancesTo ? `match_${advancesTo}` : null,
      scheduledTime: null,
      location: null,
      status: 'scheduled',
      notes
    });
  }

  return { matches, rounds };
}

// Helper type for tracking entrants in each round
interface RoundEntrant {
  teamId: string | null;
  seed: number;
  sourceMatchId?: number; // Which match this team came from (if not initial seed)
  isBye?: boolean; // Auto-advanced without playing
}

/**
 * Generate Double Elimination bracket using state machine approach
 * Works for ANY team count (4, 8, 9, 16, 32, etc.)
 * 
 * Key Design:
 * - Explicitly track entrants for each round (with seeds and source matches)
 * - Reseed and pair entrants each round (high vs low)
 * - Handle odd entrants by giving highest seed a bye to next round
 * - Only create match objects for actual pairings
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
  const isEvenWithPlayIn = (numTeams % 2 === 0) && (byePolicy === 'play_in_game');
  
  let matchCounter = 1;
  const matchLookup = new Map<string, number>(); // key -> match number
  
  // Calculate effective team count and rounds
  // For play-in games (odd teams OR even teams with play_in_game option), reduce by 1
  const effectiveTeamCount = ((needsBye && byePolicy === 'play_in_game') || isEvenWithPlayIn)
    ? numTeams - 1
    : numTeams;
  
  const winnersRounds = Math.ceil(Math.log2(effectiveTeamCount));
  const losersRounds = (winnersRounds * 2) - 1;
  
  // Track actual match counts per round (will be built as we go)
  const winnersMatchCounts: number[] = [];
  
  // ============ WINNERS BRACKET ============
  
  // Initialize Round 1 entrants
  let currentRoundEntrants: RoundEntrant[] = [];
  
  // Handle play-in game if needed (for odd teams OR even teams with play_in_game option)
  if ((needsBye && byePolicy === 'play_in_game') || isEvenWithPlayIn) {
    rounds.push('Play-In Round');
    const playInMatchNum = matchCounter++;
    matchLookup.set(`PLAY_IN`, playInMatchNum);
    
    const noteText = needsBye 
      ? 'Play-in: Bottom 2 seeds compete for final spot'
      : 'Play-in: Lowest 2 seeds compete for entry into main bracket';
    
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
      notes: noteText
    });
    
    // R1 entrants: Top seeds + play-in winner
    for (let i = 0; i < numTeams - 2; i++) {
      currentRoundEntrants.push({
        teamId: sortedTeams[i].id,
        seed: i + 1
      });
    }
    // Play-in winner (TBD)
    currentRoundEntrants.push({
      teamId: null,
      seed: numTeams - 1, // Use 2nd-to-last seed (winner will be better than last)
      sourceMatchId: playInMatchNum
    });
  } else if (needsBye && byePolicy === 'top_seed_bye') {
    // Top seed sits out R1, others compete
    for (let i = 1; i < numTeams; i++) {
      currentRoundEntrants.push({
        teamId: sortedTeams[i].id,
        seed: i + 1
      });
    }
  } else {
    // Even teams - all compete in R1
    for (let i = 0; i < numTeams; i++) {
      currentRoundEntrants.push({
        teamId: sortedTeams[i].id,
        seed: i + 1
      });
    }
  }
  
  // Generate winners bracket rounds using state machine
  for (let roundIdx = 0; roundIdx < winnersRounds; roundIdx++) {
    let roundName: string;
    if (roundIdx === 0) roundName = 'Winners Round 1';
    else if (winnersRounds - roundIdx === 1) roundName = 'Winners Finals';
    else if (winnersRounds - roundIdx === 2) roundName = 'Winners Semifinals';
    else if (winnersRounds - roundIdx === 3) roundName = 'Winners Quarterfinals';
    else roundName = `Winners Round ${roundIdx + 1}`;
    
    rounds.push(roundName);
    
    // For Round 2 with top_seed_bye, add the top seed to entrants
    if (roundIdx === 1 && needsBye && byePolicy === 'top_seed_bye') {
      currentRoundEntrants.unshift({
        teamId: sortedTeams[0].id,
        seed: 1,
        isBye: true
      });
    }
    
    // Sort entrants by seed (best to worst)
    currentRoundEntrants.sort((a, b) => a.seed - b.seed);
    
    const numEntrants = currentRoundEntrants.length;
    const hasOddEntrants = numEntrants % 2 === 1;
    
    // If odd entrants, best seed (that doesn't already have a bye) gets bye to next round
    let byeEntrant: RoundEntrant | null = null;
    if (hasOddEntrants && roundIdx < winnersRounds - 1) {
      // Find the best seed that isn't already marked as having a bye
      const eligibleForBye = currentRoundEntrants.filter(e => !e.isBye);
      if (eligibleForBye.length > 0) {
        byeEntrant = eligibleForBye[0];
        // Remove bye team from pairings
        currentRoundEntrants = currentRoundEntrants.filter(e => e !== byeEntrant);
      } else {
        // All entrants already have byes (shouldn't happen, but handle gracefully)
        byeEntrant = currentRoundEntrants[0];
        currentRoundEntrants = currentRoundEntrants.slice(1);
      }
    }
    
    // Pair remaining entrants: high vs low (1 vs last, 2 vs 2nd-last, etc.)
    const matchesThisRound = Math.floor(currentRoundEntrants.length / 2);
    winnersMatchCounts.push(matchesThisRound);
    
    const nextRoundEntrants: RoundEntrant[] = [];
    
    // Add bye team to next round if exists
    if (byeEntrant) {
      nextRoundEntrants.push({
        ...byeEntrant,
        isBye: true
      });
    }
    
    for (let matchPos = 0; matchPos < matchesThisRound; matchPos++) {
      const matchNum = matchCounter++;
      matchLookup.set(`W-R${roundIdx + 1}-M${matchPos + 1}`, matchNum);
      
      const highSeedEntrant = currentRoundEntrants[matchPos];
      const lowSeedEntrant = currentRoundEntrants[currentRoundEntrants.length - 1 - matchPos];
      
      matches.push({
        tournamentId,
        gameId: null,
        round: roundName,
        matchNumber: matchNum,
        bracketType: 'winners',
        team1Id: highSeedEntrant.teamId,
        team2Id: lowSeedEntrant.teamId,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null, // Will be set after all matches created
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: null
      });
      
      // Winner advances to next round (use lower seed number for tracking)
      if (roundIdx < winnersRounds - 1) {
        nextRoundEntrants.push({
          teamId: null,
          seed: Math.min(highSeedEntrant.seed, lowSeedEntrant.seed),
          sourceMatchId: matchNum
        });
      }
    }
    
    currentRoundEntrants = nextRoundEntrants;
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
      const prevLosersCount = losersMatchCounts[losersRoundIdx - 1] || winnersMatchCounts[0];
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

  // ============ POPULATE LOSERS BRACKET WITH SOURCE MATCHES ============
  
  // For each elimination round in losers bracket, pair up losers from the corresponding winners round
  for (let losersRoundIdx = 0; losersRoundIdx < losersRounds; losersRoundIdx++) {
    const roundNumber = losersRoundIdx + 1;
    const isEliminationRound = roundNumber % 2 === 1; // Odd rounds (1, 3, 5...)
    
    if (isEliminationRound) {
      // This losers round receives losers from a winners round
      const winnersSourceRoundIdx = Math.floor(losersRoundIdx / 2);
      const winnersSourceRoundNum = winnersSourceRoundIdx + 1;
      
      // Get all winners matches from the source round
      const winnersSourceMatches: number[] = [];
      for (let matchPos = 1; matchPos <= winnersMatchCounts[winnersSourceRoundIdx]; matchPos++) {
        const matchNum = matchLookup.get(`W-R${winnersSourceRoundNum}-M${matchPos}`);
        if (matchNum) {
          winnersSourceMatches.push(matchNum);
        }
      }
      
      // Pair up losers: (M1 loser & M2 loser) → L-M1, (M3 loser & M4 loser) → L-M2, etc.
      for (let losersMatchIdx = 0; losersMatchIdx < winnersSourceMatches.length / 2; losersMatchIdx++) {
        const sourceMatch1Num = winnersSourceMatches[losersMatchIdx * 2];
        const sourceMatch2Num = winnersSourceMatches[losersMatchIdx * 2 + 1];
        
        const losersMatchNum = matchLookup.get(`L-R${roundNumber}-M${losersMatchIdx + 1}`);
        if (losersMatchNum) {
          const losersMatch = matches.find(m => m.matchNumber === losersMatchNum);
          if (losersMatch) {
            // Store source match info in notes for later processing
            losersMatch.notes = `Loser of match_${sourceMatch1Num} vs Loser of match_${sourceMatch2Num}`;
          }
        }
      }
    }
  }

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

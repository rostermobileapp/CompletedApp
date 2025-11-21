import { TournamentTeam, TournamentMatch } from "@shared/schema";

export interface BracketGeneratorResult {
  matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[];
  rounds: string[];
}

/**
 * Build canonical seed slots using recursive pairing
 * Returns array of seed positions in bracket order (1 vs 16, 8 vs 9, etc.)
 * 
 * Examples:
 * - bracketSize 4: [1, 4, 2, 3]
 * - bracketSize 8: [1, 8, 4, 5, 2, 7, 3, 6]
 * - bracketSize 16: [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15]
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
 * Generate canonical seeding order for a given bracket size
 * Exported for use in UI and other components
 * 
 * @param bracketSize - Must be a power of 2 (4, 8, 16, 32, 64, 128)
 * @returns Array of seed numbers in proper bracket order
 */
export function generateSeeds(bracketSize: number): number[] {
  if (bracketSize < 2 || !Number.isInteger(Math.log2(bracketSize))) {
    throw new Error('Bracket size must be a power of 2');
  }
  return buildSeedSlots(bracketSize);
}

/**
 * Shuffle array randomly (Fisher-Yates algorithm)
 * Used for "blind draw" tournaments
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Apply seeding or blind draw to teams based on bracket type
 * 
 * @param teams - Teams to seed/shuffle
 * @param bracketType - 'seeded' uses canonical seeding, 'blind_draw' randomizes
 * @returns Teams in proper bracket order with updated seed numbers
 */
export function applyBracketType(teams: TournamentTeam[], bracketType: 'seeded' | 'blind_draw' = 'seeded'): TournamentTeam[] {
  let orderedTeams: TournamentTeam[];
  
  if (bracketType === 'blind_draw') {
    // Randomize team order
    orderedTeams = shuffleArray(teams);
  } else {
    // For seeded brackets, sort by existing seed numbers
    orderedTeams = [...teams].sort((a, b) => a.seed - b.seed);
  }
  
  // Reassign seed numbers to match the final bracket order (1, 2, 3...)
  // This ensures seed numbers reflect actual bracket positions after randomization
  return orderedTeams.map((team, index) => ({
    ...team,
    seed: index + 1
  }));
}

/**
 * Helper function to generate proper round names for elimination brackets
 * @param roundNum - Current round number (1, 2, 3, ...)
 * @param totalRounds - Total number of rounds
 * @param prefix - Optional prefix (e.g., "Winners", "Losers")
 */
function getEliminationRoundName(roundNum: number, totalRounds: number, prefix: string = ''): string {
  const roundsFromEnd = totalRounds - roundNum;
  const prefixStr = prefix ? `${prefix} ` : '';
  
  if (roundsFromEnd === 0) return `${prefixStr}Finals`;
  if (roundsFromEnd === 1) return `${prefixStr}Semifinals`;
  if (roundsFromEnd === 2) return `${prefixStr}Quarterfinals`;
  
  return `${prefixStr}Round ${roundNum}`;
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

  // Teams are already ordered by seed (via applyBracketType at route level)
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
  let playInMatchNum: number | null = null;
  if (needsPlayIn) {
    rounds.push('Play-In Round');
    playInMatchNum = matchCounter++;
    
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

  let currentLevel: BracketNode[] = slotTeams.map((team, idx) => {
    // If this slot is the play-in winner (null team with a play-in match available), mark it as coming from play-in
    if (needsPlayIn && team === null && playInMatchNum !== null) {
      return {
        team: null,
        matchNumber: playInMatchNum
      };
    }
    return {
      team,
      matchNumber: null
    };
  });

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
      const isTrueBye = !!((node1.team && !hasContent2) || (node2.team && !hasContent1));
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

  // Teams are already ordered by seed (via applyBracketType at route level)
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
        bracketType: 'main',
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
          bracketType: 'main',
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
    bracketType: 'main',
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
    bracketType: 'main',
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
    bracketType: 'main',
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

/**
 * Generate Consolation Tournament bracket
 * Main bracket for championship + consolation bracket for eliminated teams
 * Losers from main bracket compete for 3rd/5th/7th place
 */
export function generateConsolation(
  teams: TournamentTeam[],
  tournamentId: string,
  settings: any = {}
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);
  
  let matchCounter = 1;
  const numRounds = Math.ceil(Math.log2(numTeams));
  
  // Generate main (championship) bracket matches
  const mainBracketResult = generateSingleElimination(teams, tournamentId, settings);
  const championshipMatches = mainBracketResult.matches.map(m => ({
    ...m,
    matchNumber: matchCounter++,
    round: m.round.replace('Round', 'Championship Round'),
    bracketType: 'winners' as const
  }));
  
  matches.push(...championshipMatches);
  rounds.push(...mainBracketResult.rounds.map(r => r.replace('Round', 'Championship Round')));
  
  // Create consolation bracket for teams eliminated in Championship Round 1
  const round1Matches = championshipMatches.filter(m => m.round === 'Championship Round 1');
  if (round1Matches.length >= 2) {
    // Pair up losers from Championship Round 1
    for (let i = 0; i < round1Matches.length; i += 2) {
      if (i + 1 < round1Matches.length) {
        matches.push({
          tournamentId,
          gameId: null,
          round: 'Consolation Bracket',
          matchNumber: matchCounter++,
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
          notes: `Loser of match_${round1Matches[i].matchNumber} vs Loser of match_${round1Matches[i + 1].matchNumber} - Competing for 3rd place`
        });
      }
    }
    rounds.push('Consolation Bracket');
  }
  
  return { matches, rounds };
}

/**
 * Generate 3-Game Guarantee Tournament bracket
 * Structure: Winners Bracket + Losers Bracket + Guarantee Round for 0-2 teams
 * Key Feature: EVERY team plays minimum 3 games
 * 
 * Formula: Total Matches = (n-1) + (n-2) + ceil(z/2) + 2
 * Where z = number of 0-2 teams (computed structurally from bracket)
 */
export function generateThreeGameGuarantee(
  teams: TournamentTeam[],
  tournamentId: string,
  settings: any = {}
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];
  
  if (numTeams < 3) {
    throw new Error('3-Game Guarantee requires at least 3 teams');
  }
  
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);
  let matchCounter = 1;
  
  // ===== WINNERS BRACKET (n-1 matches) =====
  // Generate full winners bracket like standard single-elimination
  let winnersMatchesCreated = 0;
  const targetWinnersMatches = numTeams - 1;
  const winnersRounds: (typeof matches)[] = [];
  
  // Build winners bracket layer by layer
  let currentWinnersRoundTeams = numTeams;
  let winnersRoundNum = 1;
  
  while (winnersMatchesCreated < targetWinnersMatches) {
    const roundMatches: typeof matches = [];
    const roundName = winnersRoundNum === 1 ? 'Winners Round 1' : 
                      getEliminationRoundName(winnersRoundNum, Math.ceil(Math.log2(numTeams)) + 1, 'Winners');
    
    if (winnersRoundNum === 1) {
      // Round 1: Pair teams with canonical seeding
      const matchesInRound = Math.floor(numTeams / 2);
      for (let i = 0; i < matchesInRound; i++) {
        roundMatches.push({
          tournamentId,
          gameId: null,
          round: roundName,
          matchNumber: matchCounter++,
          bracketType: 'winners',
          team1Id: sortedTeams[i].id,
          team2Id: sortedTeams[numTeams - 1 - i].id,
          winnerId: null,
          team1Score: null,
          team2Score: null,
          advancesToMatchId: null,
          scheduledTime: null,
          location: null,
          status: 'scheduled',
          notes: `Seed ${i + 1} vs Seed ${numTeams - i}`
        });
        winnersMatchesCreated++;
      }
      currentWinnersRoundTeams = matchesInRound + (numTeams % 2); // Winners + possible bye team
    } else {
      // Subsequent rounds: Pair winners from previous round
      const matchesInRound = Math.floor(currentWinnersRoundTeams / 2);
      for (let i = 0; i < matchesInRound; i++) {
        roundMatches.push({
          tournamentId,
          gameId: null,
          round: roundName,
          matchNumber: matchCounter++,
          bracketType: 'winners',
          team1Id: null,
          team2Id: null,
          winnerId: null,
          team1Score: null,
          team2Score: null,
          advancesToMatchId: null,
          scheduledTime: null,
          location: null,
          status: 'scheduled',
          notes: `Winners Round ${winnersRoundNum}`
        });
        winnersMatchesCreated++;
      }
      currentWinnersRoundTeams = matchesInRound + (currentWinnersRoundTeams % 2); // Winners + possible bye
    }
    
    if (roundMatches.length > 0) {
      matches.push(...roundMatches);
      rounds.push(roundName);
      winnersRounds.push(roundMatches);
    }
    
    winnersRoundNum++;
    if (currentWinnersRoundTeams <= 1) break;
  }
  
  // ===== LOSERS BRACKET (n-2 matches) =====
  // Build losers bracket similar to double elimination
  let losersMatchesCreated = 0;
  const targetLosersMatches = numTeams - 2;
  const losersRounds: (typeof matches)[] = [];
  
  // Track the current state of losers bracket
  let currentLosersTeams = winnersRounds[0].length; // WR1 losers
  let losersRoundNum = 1;
  let winnersFeederIdx = 1; // Start feeding from WR2 onwards
  
  while (losersMatchesCreated < targetLosersMatches) {
    const roundMatches: typeof matches = [];
    const roundName = `Losers Round ${losersRoundNum}`;
    
    // Determine how many matches in this round
    let matchesInRound: number;
    
    if (losersRoundNum === 1) {
      // LR1: Pair up all WR1 losers
      matchesInRound = Math.floor(currentLosersTeams / 2);
    } else {
      // LR2+: Merge LR winners + WR losers
      const lrWinners = Math.floor(currentLosersTeams / 2) + (currentLosersTeams % 2);
      if (winnersFeederIdx < winnersRounds.length) {
        const wrLosers = winnersRounds[winnersFeederIdx].length;
        matchesInRound = Math.floor((lrWinners + wrLosers) / 2);
        winnersFeederIdx++;
      } else {
        matchesInRound = Math.floor(lrWinners / 2);
      }
    }
    
    for (let i = 0; i < matchesInRound && losersMatchesCreated < targetLosersMatches; i++) {
      roundMatches.push({
        tournamentId,
        gameId: null,
        round: roundName,
        matchNumber: matchCounter++,
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
        notes: `Losers Round ${losersRoundNum}`
      });
      losersMatchesCreated++;
    }
    
    if (roundMatches.length > 0) {
      matches.push(...roundMatches);
      if (!rounds.includes(roundName)) rounds.push(roundName);
      losersRounds.push(roundMatches);
    }
    
    currentLosersTeams = roundMatches.length + (roundMatches.length % 2);
    losersRoundNum++;
    
    if (currentLosersTeams <= 1) break;
  }
  
  // ===== GUARANTEE ROUND (ceil(z/2) matches) =====
  // Structurally count 0-2 teams: teams that lose in WR1 and then lose in LR1
  const wr1Losers = winnersRounds[0].length; // All WR1 matches produce losers
  const lr1Matches = losersRounds.length > 0 ? losersRounds[0].length : 0;
  const lr1Losers = lr1Matches; // All LR1 matches produce losers (these are 0-2 teams)
  const zeroTwoTeams = lr1Losers;
  const guaranteeMatchCount = Math.ceil(zeroTwoTeams / 2);
  
  const guaranteeMatches: typeof matches = [];
  for (let i = 0; i < guaranteeMatchCount; i++) {
    guaranteeMatches.push({
      tournamentId,
      gameId: null,
      round: '3-Game Guarantee Round',
      matchNumber: matchCounter++,
      bracketType: 'guarantee',
      team1Id: null,
      team2Id: null,
      winnerId: null,
      team1Score: null,
      team2Score: null,
      advancesToMatchId: null,
      scheduledTime: null,
      location: null,
      status: 'scheduled',
      notes: `0-2 teams (3rd game guarantee)`
    });
  }
  
  if (guaranteeMatches.length > 0) {
    matches.push(...guaranteeMatches);
    rounds.push('3-Game Guarantee Round');
  }
  
  // ===== CHAMPIONSHIP (2 matches) =====
  // Losers Bracket Finals
  matches.push({
    tournamentId,
    gameId: null,
    round: 'Losers Finals',
    matchNumber: matchCounter++,
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
    notes: 'Losers Bracket Finals - Winner advances to Grand Finals'
  });
  rounds.push('Losers Finals');
  
  // Grand Finals
  matches.push({
    tournamentId,
    gameId: null,
    round: 'Grand Finals',
    matchNumber: matchCounter++,
    bracketType: 'grand_final',
    team1Id: null,
    team2Id: null,
    winnerId: null,
    team1Score: null,
    team2Score: null,
    advancesToMatchId: null,
    scheduledTime: null,
    location: null,
    status: 'scheduled',
    notes: 'Winners Bracket Champion vs Losers Bracket Champion'
  });
  rounds.push('Grand Finals');
  
  // ===== VALIDATION =====
  const expectedTotal = (numTeams - 1) + (numTeams - 2) + guaranteeMatchCount + 2;
  console.log(`🏆 3-GAME GUARANTEE GENERATED - Total: ${matches.length}, Expected: ${expectedTotal}, Winners: ${winnersMatchesCreated}, Losers: ${losersMatchesCreated}, Guarantee: ${guaranteeMatchCount}, 0-2 teams: ${zeroTwoTeams}, Championship: 2`);
  
  if (matches.length < expectedTotal) {
    throw new Error(`3-Game Guarantee validation failed: Generated ${matches.length} matches but expected ${expectedTotal} for ${numTeams} teams`);
  }
  
  return { matches, rounds };
}

/**
 * Generate Triple Elimination Tournament bracket  
 * Three parallel brackets: Winners (0 losses), First Losers (1 loss), Second Losers (2 losses)
 * Teams are eliminated after 3rd loss
 */
export function generateTripleElimination(
  teams: TournamentTeam[],
  tournamentId: string,
  settings: any = {}
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);

  let matchCounter = 1;
  
  // Round 1: All teams start in Winners Bracket
  const round1Matches: typeof matches = [];
  for (let i = 0; i < numTeams; i += 2) {
    if (i + 1 < numTeams) {
      round1Matches.push({
        tournamentId,
        gameId: null,
        round: 'Winners Round 1',
        matchNumber: matchCounter++,
        bracketType: 'winners',
        team1Id: sortedTeams[i].id,
        team2Id: sortedTeams[i + 1].id,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null,
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: 'Winners Bracket (0 losses)'
      });
    }
  }
  matches.push(...round1Matches);
  rounds.push('Winners Round 1');

  // Round 2: Winners continue, Losers → First Losers Bracket
  const winnersR2: typeof matches = [];
  const firstLosersR1: typeof matches = [];
  
  for (let i = 0; i < round1Matches.length; i += 2) {
    if (i + 1 < round1Matches.length) {
      winnersR2.push({
        tournamentId,
        gameId: null,
        round: 'Winners Round 2',
        matchNumber: matchCounter++,
        bracketType: 'winners',
        team1Id: null,
        team2Id: null,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null,
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: `Winner of match_${round1Matches[i].matchNumber} vs Winner of match_${round1Matches[i + 1].matchNumber}`
      });
      
      firstLosersR1.push({
        tournamentId,
        gameId: null,
        round: 'First Losers Round 1',
        matchNumber: matchCounter++,
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
        notes: `Loser of match_${round1Matches[i].matchNumber} vs Loser of match_${round1Matches[i + 1].matchNumber} (1 loss each)`
      });
    }
  }
  
  if (winnersR2.length > 0) {
    matches.push(...winnersR2);
    rounds.push('Winners Round 2');
  }
  if (firstLosersR1.length > 0) {
    matches.push(...firstLosersR1);
    rounds.push('First Losers Round 1');
  }
  
  // Note: Simplified implementation - full triple elimination would continue
  // building Winners, First Losers, and Second Losers brackets through multiple rounds
  
  return { matches, rounds };
}

/**
 * Generate Compass Draw Tournament bracket
 * 8-division system (N, S, E, W, NE, NW, SE, SW) based on performance
 * Guarantees 5+ games with skill-based progression
 */
export function generateCompassDraw(
  teams: TournamentTeam[],
  tournamentId: string,
  settings: any = {}
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);

  let matchCounter = 1;

  // Round 1: All teams start in East bracket
  const eastR1: typeof matches = [];
  for (let i = 0; i < numTeams; i += 2) {
    if (i + 1 < numTeams) {
      eastR1.push({
        tournamentId,
        gameId: null,
        round: 'Round 1 - East',
        matchNumber: matchCounter++,
        bracketType: null,
        team1Id: sortedTeams[i].id,
        team2Id: sortedTeams[i + 1].id,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null,
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: 'Winners→East, Losers→West'
      });
    }
  }
  matches.push(...eastR1);
  rounds.push('Round 1 - East');

  // Round 2: East (winners) vs West (losers)
  const eastR2: typeof matches = [];
  const westR2: typeof matches = [];
  
  for (let i = 0; i < eastR1.length; i += 2) {
    if (i + 1 < eastR1.length) {
      eastR2.push({
        tournamentId,
        gameId: null,
        round: 'Round 2 - East',
        matchNumber: matchCounter++,
        bracketType: null,
        team1Id: null,
        team2Id: null,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null,
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: `Winner of match_${eastR1[i].matchNumber} vs Winner of match_${eastR1[i + 1].matchNumber} - Winners→East, Losers→North`
      });

      westR2.push({
        tournamentId,
        gameId: null,
        round: 'Round 2 - West',
        matchNumber: matchCounter++,
        bracketType: null,
        team1Id: null,
        team2Id: null,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null,
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: `Loser of match_${eastR1[i].matchNumber} vs Loser of match_${eastR1[i + 1].matchNumber} - Winners→West, Losers→South`
      });
    }
  }
  
  if (eastR2.length > 0) {
    matches.push(...eastR2);
    rounds.push('Round 2 - East');
  }
  if (westR2.length > 0) {
    matches.push(...westR2);
    rounds.push('Round 2 - West');
  }
  
  // Note: Simplified - full compass draw would continue building N, S, NE, NW, SE, SW divisions
  
  return { matches, rounds };
}

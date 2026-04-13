import { TournamentTeam, TournamentMatch } from "@shared/schema";

export interface BracketGeneratorResult {
  matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[];
  rounds: string[];
}

// Helper interface for Round Robin standings
export interface TeamStanding {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifferential: number;
}

/**
 * Calculate team standings from completed Round Robin matches
 * Returns teams sorted by record (wins DESC), then by goals scored (goalsFor DESC)
 */
export function calculateStandings(
  matches: TournamentMatch[],
  teams: TournamentTeam[]
): TeamStanding[] {
  const standings = new Map<string, TeamStanding>();
  
  // Initialize standings for all teams
  teams.forEach(team => {
    standings.set(team.id, {
      teamId: team.id,
      teamName: team.teamName,
      wins: 0,
      losses: 0,
      ties: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifferential: 0
    });
  });
  
  // Calculate standings from completed matches
  matches.forEach(match => {
    if (match.status === 'completed' && match.team1Id && match.team2Id && 
        match.team1Score !== null && match.team2Score !== null) {
      const team1 = standings.get(match.team1Id);
      const team2 = standings.get(match.team2Id);
      
      if (team1 && team2) {
        team1.goalsFor += match.team1Score;
        team1.goalsAgainst += match.team2Score;
        team2.goalsFor += match.team2Score;
        team2.goalsAgainst += match.team1Score;
        
        if (match.winnerId === match.team1Id) {
          team1.wins++;
          team2.losses++;
        } else if (match.winnerId === match.team2Id) {
          team2.wins++;
          team1.losses++;
        } else {
          // Tie
          team1.ties++;
          team2.ties++;
        }
        
        team1.goalDifferential = team1.goalsFor - team1.goalsAgainst;
        team2.goalDifferential = team2.goalsFor - team2.goalsAgainst;
      }
    }
  });
  
  // Sort by wins (DESC), then by goals scored (DESC)
  return Array.from(standings.values()).sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    return b.goalsFor - a.goalsFor; // Tiebreaker: goals scored
  });
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
    
    // For standalone tournaments, leave teams null so commissioner can manually assign
    // For league tournaments, auto-assign the bottom 2 seeds
    const isStandalone = settings.tournamentType === 'standalone';
    
    matches.push({
      tournamentId,
      gameId: null,
      round: 'Play-In Round',
      matchNumber: playInMatchNum,
      bracketType: null,
      team1Id: isStandalone ? null : sortedTeams[numTeams - 2].id,
      team2Id: isStandalone ? null : sortedTeams[numTeams - 1].id,
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
  // For standalone tournaments, leave all teams null for manual assignment
  // For league tournaments with play-in: use top (numTeams-2) seeds, then add null for play-in winner spot
  // For league tournaments without play-in: use all teams
  const isStandalone = settings.tournamentType === 'standalone';
  
  let round1Teams: Array<TournamentTeam | null> = [];
  if (isStandalone) {
    // Standalone: all slots are null for manual assignment
    round1Teams = new Array(effectiveTeamCount).fill(null);
  } else if (needsPlayIn) {
    // League with play-in: use top seeds, add null for play-in winner
    round1Teams = sortedTeams.slice(0, numTeams - 2) as Array<TournamentTeam | null>;
    round1Teams.push(null);
  } else {
    // League without play-in: use all teams
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
    /** True if this slot represents a real team position (even if TBD for standalone) vs a pure bye slot */
    isRealSlot: boolean;
  }

  let currentLevel: BracketNode[] = slotTeams.map((team, idx) => {
    const seed = seedSlots[idx];
    const isRealSlot = seed <= effectiveTeamCount;

    // If this slot is the play-in winner (null team with a play-in match available), mark it as coming from play-in
    if (needsPlayIn && team === null && playInMatchNum !== null && isRealSlot) {
      return {
        team: null,
        matchNumber: playInMatchNum,
        isRealSlot: true
      };
    }
    return {
      team,
      matchNumber: null,
      isRealSlot
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
      const isTrueBye = !!((node1.team && !hasContent2 && !node2.isRealSlot) || (node2.team && !hasContent1 && !node1.isRealSlot));
      const byeWinner = node1.team && !hasContent2 && !node2.isRealSlot ? node1.team :
                        node2.team && !hasContent1 && !node1.isRealSlot ? node2.team : null;
      
      if (!hasContent1 && !hasContent2 && !node1.isRealSlot && !node2.isRealSlot) {
        // Both are pure bye slots (no real team will ever play here) - skip
        nextLevel.push({ team: null, matchNumber: null, isRealSlot: false });
      } else {
        // Create match (either has real content, or at least one slot is a real team position)
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
          matchNumber,
          isRealSlot: true
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

  // Link play-in match to its destination match
  if (needsPlayIn && playInMatchNum !== null) {
    // Find the match that receives the play-in winner
    const destinationMatch = allMatches.find(m => 
      m.sourceMatch1 === playInMatchNum || m.sourceMatch2 === playInMatchNum
    );
    
    if (destinationMatch) {
      const playInMatch = matches.find(m => m.matchNumber === playInMatchNum);
      if (playInMatch) {
        playInMatch.advancesToMatchId = `match_${destinationMatch.matchNumber}`;
      }
    }
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
    
    // For standalone tournaments, leave teams null so commissioner can manually assign
    // For league tournaments, auto-assign the bottom 2 seeds
    const isStandalone = settings.tournamentType === 'standalone';
    
    matches.push({
      tournamentId,
      gameId: null,
      round: 'Play-In Round',
      matchNumber: playInMatchNum,
      bracketType: 'winners',
      team1Id: isStandalone ? null : sortedTeams[numTeams - 2].id,
      team2Id: isStandalone ? null : sortedTeams[numTeams - 1].id,
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
    // For standalone tournaments, set all teamIds to null for manual assignment
    for (let i = 0; i < numTeams - 2; i++) {
      currentRoundEntrants.push({
        teamId: isStandalone ? null : sortedTeams[i].id,
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
    // For standalone tournaments, set all teamIds to null for manual assignment
    const isStandalone = settings.tournamentType === 'standalone';
    for (let i = 1; i < numTeams; i++) {
      currentRoundEntrants.push({
        teamId: isStandalone ? null : sortedTeams[i].id,
        seed: i + 1
      });
    }
  } else {
    // Even teams - all compete in R1
    // For standalone tournaments, set all teamIds to null for manual assignment
    const isStandalone = settings.tournamentType === 'standalone';
    for (let i = 0; i < numTeams; i++) {
      currentRoundEntrants.push({
        teamId: isStandalone ? null : sortedTeams[i].id,
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
      const isStandalone = settings.tournamentType === 'standalone';
      currentRoundEntrants.unshift({
        teamId: isStandalone ? null : sortedTeams[0].id,
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
 * Generate Round Robin + Playoffs format
 * All teams play round robin, then top teams advance to single elimination playoffs
 * Seeding based on record (wins/losses), with goals scored as tiebreaker
 * If odd number of teams, lowest seed does not make playoffs
 */
export function generateRoundRobinSplit(
  teams: TournamentTeam[],
  tournamentId: string
): BracketGeneratorResult {
  const numTeams = teams.length;
  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];

  let matchNum = 1;

  // Phase 1: Round Robin for all teams
  const roundRobinRound = 'Round Robin';
  rounds.push(roundRobinRound);

  // Generate all possible matchups in round robin
  for (let i = 0; i < numTeams; i++) {
    for (let j = i + 1; j < numTeams; j++) {
      matches.push({
        tournamentId,
        gameId: null,
        round: roundRobinRound,
        matchNumber: matchNum++,
        bracketType: 'main',
        team1Id: teams[i].id,
        team2Id: teams[j].id,
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

  // Phase 2: Single Elimination Playoffs
  // Determine number of playoff teams (even number, exclude lowest seed if odd)
  let numPlayoffTeams = numTeams;
  if (numPlayoffTeams % 2 === 1) {
    numPlayoffTeams = numTeams - 1; // Exclude lowest seed
  }

  // Generate playoff bracket rounds
  const numPlayoffRounds = Math.ceil(Math.log2(numPlayoffTeams));
  const playoffRoundNames: string[] = [];
  
  for (let i = numPlayoffRounds; i >= 1; i--) {
    if (i === 1) {
      playoffRoundNames.push('Finals');
    } else if (i === 2) {
      playoffRoundNames.push('Semifinals');
    } else if (i === 3) {
      playoffRoundNames.push('Quarterfinals');
    } else {
      playoffRoundNames.push(`Playoff Round ${numPlayoffRounds - i + 1}`);
    }
  }
  
  rounds.push(...playoffRoundNames);

  // Generate playoff matches as TBD (to be determined after round robin)
  // Teams will be seeded 1 to numPlayoffTeams based on their round robin record
  const playoffMatches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  
  // Round 1 of playoffs
  const round1Matches = Math.floor(numPlayoffTeams / 2);
  const hasRound1Bye = numPlayoffTeams % 2 === 1;
  
  for (let i = 0; i < round1Matches; i++) {
    const highSeed = i + 1;
    const lowSeed = numPlayoffTeams - i;
    
    playoffMatches.push({
      tournamentId,
      gameId: null,
      round: playoffRoundNames[0],
      matchNumber: matchNum++,
      bracketType: 'main',
      team1Id: null,
      team2Id: null,
      winnerId: null,
      team1Score: null,
      team2Score: null,
      advancesToMatchId: null, // Will be set later
      scheduledTime: null,
      location: null,
      status: 'scheduled',
      notes: `Seed #${highSeed} vs Seed #${lowSeed} (based on Round Robin record)`
    });
  }

  // Generate subsequent playoff rounds
  let currentRoundSize = round1Matches;
  for (let round = 1; round < numPlayoffRounds; round++) {
    const nextRoundSize = Math.ceil(currentRoundSize / 2);
    
    for (let i = 0; i < nextRoundSize; i++) {
      playoffMatches.push({
        tournamentId,
        gameId: null,
        round: playoffRoundNames[round],
        matchNumber: matchNum++,
        bracketType: 'main',
        team1Id: null,
        team2Id: null,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null,
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: playoffRoundNames[round] === 'Finals' 
          ? 'Championship Game - Winner of previous round' 
          : 'Winner of previous round'
      });
    }
    
    currentRoundSize = nextRoundSize;
  }

  matches.push(...playoffMatches);

  return { matches, rounds };
}

/**
 * Helper: Track team records through bracket simulation
 */
interface TeamRecord {
  teamId: string;
  seed: number;
  wins: number;
  losses: number;
}

/**
 * Simulate complete double-elimination bracket flow with full losers bracket
 * Returns z = number of teams that reach 0-2 (two losses before any wins)
 * Adapted from generateDoubleElimination state machine
 */
function simulateBracketForZeroTwoCount(numTeams: number): number {
  // Track team records (wins/losses) using seed-based deterministic outcomes
  const teamRecords = new Map<number, TeamRecord>();
  for (let seed = 1; seed <= numTeams; seed++) {
    teamRecords.set(seed, {
      teamId: `team${seed}`,
      seed,
      wins: 0,
      losses: 0
    });
  }
  
  let zeroTwoCount = 0;
  const flaggedAsZeroTwo = new Set<number>();
  
  const checkZeroTwo = (seed: number) => {
    const rec = teamRecords.get(seed)!;
    if (rec.losses === 2 && rec.wins === 0 && !flaggedAsZeroTwo.has(seed)) {
      zeroTwoCount++;
      flaggedAsZeroTwo.add(seed);
    }
  };
  
  // Simulate Winners Bracket
  const winnersRounds = Math.ceil(Math.log2(numTeams));
  let currentWinners: number[] = Array.from({length: numTeams}, (_, i) => i + 1);
  const winnersMatchCounts: number[] = [];
  const winnersLosersPerRound: number[][] = []; // Track losers from each winners round
  
  for (let round = 0; round < winnersRounds; round++) {
    currentWinners.sort((a, b) => a - b);
    
    let byeSeed: number | null = null;
    if (currentWinners.length % 2 === 1 && round < winnersRounds - 1) {
      byeSeed = currentWinners[0];
      currentWinners = currentWinners.slice(1);
    }
    
    const nextWinners: number[] = [];
    if (byeSeed !== null) nextWinners.push(byeSeed);
    
    const matchCount = Math.floor(currentWinners.length / 2);
    winnersMatchCounts.push(matchCount);
    const roundLosers: number[] = [];
    
    for (let i = 0; i < matchCount; i++) {
      const highSeed = currentWinners[i];
      const lowSeed = currentWinners[currentWinners.length - 1 - i];
      
      const winner = highSeed;
      const loser = lowSeed;
      
      teamRecords.get(winner)!.wins++;
      teamRecords.get(loser)!.losses++;
      
      nextWinners.push(winner);
      roundLosers.push(loser);
      
      checkZeroTwo(loser);
    }
    
    winnersLosersPerRound.push(roundLosers);
    currentWinners = nextWinners;
  }
  
  // Simulate Losers Bracket (alternating elimination/merger rounds)
  const losersRounds = (winnersRounds * 2) - 1;
  let losersPool: number[] = [];
  
  for (let losersRoundIdx = 0; losersRoundIdx < losersRounds; losersRoundIdx++) {
    const roundNumber = losersRoundIdx + 1;
    const isEliminationRound = roundNumber % 2 === 1;
    
    if (isEliminationRound) {
      // Elimination round: receives losers from winners bracket
      const winnersSourceRoundIdx = Math.floor(losersRoundIdx / 2);
      const droppingTeams = winnersLosersPerRound[winnersSourceRoundIdx] || [];
      losersPool.push(...droppingTeams);
    }
    
    // Pair up teams in losers pool
    losersPool.sort((a, b) => a - b);
    const matchCount = Math.floor(losersPool.length / 2);
    const nextLosersPool: number[] = [];
    
    // Handle bye if odd
    if (losersPool.length % 2 === 1) {
      nextLosersPool.push(losersPool[0]);
      losersPool = losersPool.slice(1);
    }
    
    for (let i = 0; i < matchCount; i++) {
      const highSeed = losersPool[i];
      const lowSeed = losersPool[losersPool.length - 1 - i];
      
      const winner = highSeed;
      const loser = lowSeed;
      
      teamRecords.get(winner)!.wins++;
      teamRecords.get(loser)!.losses++;
      
      nextLosersPool.push(winner);
      
      checkZeroTwo(loser);
    }
    
    losersPool = nextLosersPool;
  }
  
  return zeroTwoCount;
}

/**
 * Generate 3-Game Guarantee Tournament bracket
 * 
 * Uses double-elimination state machine + guarantee round for 0-2 teams
 * Every team guaranteed minimum 3 games before elimination
 * 
 * Formula: Total = (n-1) + (n-2) + ceil(z/2) + 2
 * Where z = floor(floor((n - byes) / 2) / 2), byes = bracketSize - n
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
  
  // Use helper to simulate bracket and count 0-2 teams
  const z = simulateBracketForZeroTwoCount(numTeams);
  
  // Apply user's formula structure: (n-1) + (n-2) + ceil(z/2) + 2
  const winnersTarget = numTeams - 1;
  const losersTarget = numTeams - 2;
  const guaranteeTarget = Math.ceil(z / 2);
  const championshipMatches = 2;
  
  // ===== WINNERS BRACKET (using state machine from double-elim) =====
  const winnersRounds = Math.ceil(Math.log2(numTeams));
  let currentRoundEntrants: RoundEntrant[] = [];
  
  // Initialize Round 1 entrants (all teams)
  for (let i = 0; i < numTeams; i++) {
    currentRoundEntrants.push({
      teamId: sortedTeams[i].id,
      seed: i + 1
    });
  }
  
  for (let roundIdx = 0; roundIdx < winnersRounds; roundIdx++) {
    let roundName: string;
    if (roundIdx === 0) roundName = 'Winners Round 1';
    else if (winnersRounds - roundIdx === 1) roundName = 'Winners Finals';
    else if (winnersRounds - roundIdx === 2) roundName = 'Winners Semifinals';
    else if (winnersRounds - roundIdx === 3) roundName = 'Winners Quarterfinals';
    else roundName = `Winners Round ${roundIdx + 1}`;
    
    rounds.push(roundName);
    
    // Sort entrants by seed
    currentRoundEntrants.sort((a, b) => a.seed - b.seed);
    
    const numEntrants = currentRoundEntrants.length;
    const hasOddEntrants = numEntrants % 2 === 1;
    
    // Handle bye if odd entrants
    let byeEntrant: RoundEntrant | null = null;
    if (hasOddEntrants && roundIdx < winnersRounds - 1) {
      byeEntrant = currentRoundEntrants[0]; // Best seed gets bye
      currentRoundEntrants = currentRoundEntrants.slice(1);
    }
    
    // Pair remaining entrants: high vs low
    const matchesThisRound = Math.floor(currentRoundEntrants.length / 2);
    const nextRoundEntrants: RoundEntrant[] = [];
    
    // Add bye team to next round if exists
    if (byeEntrant) {
      nextRoundEntrants.push({ ...byeEntrant, isBye: true });
    }
    
    for (let matchPos = 0; matchPos < matchesThisRound; matchPos++) {
      const highSeedEntrant = currentRoundEntrants[matchPos];
      const lowSeedEntrant = currentRoundEntrants[currentRoundEntrants.length - 1 - matchPos];
      
      matches.push({
        tournamentId,
        gameId: null,
        round: roundName,
        matchNumber: matchCounter++,
        bracketType: 'winners',
        team1Id: highSeedEntrant.teamId,
        team2Id: lowSeedEntrant.teamId,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null,
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: null
      });
      
      // Winner advances to next round
      if (roundIdx < winnersRounds - 1) {
        nextRoundEntrants.push({
          teamId: null,
          seed: Math.min(highSeedEntrant.seed, lowSeedEntrant.seed),
          sourceMatchId: matchCounter - 1
        });
      }
    }
    
    currentRoundEntrants = nextRoundEntrants;
  }
  
  // ===== LOSERS BRACKET =====
  const losersRounds = Math.max(1, (winnersRounds * 2) - 2);
  for (let roundIdx = 0; roundIdx < losersRounds; roundIdx++) {
    const roundName = losersRounds - roundIdx === 1 ? 'Losers Finals' : `Losers Round ${roundIdx + 1}`;
    const matchesThisRound = roundIdx < losersRounds - 1 ? 
      Math.max(1, Math.floor(numTeams / Math.pow(2, Math.floor(roundIdx / 2) + 2))) :
      1;
    
    for (let i = 0; i < matchesThisRound; i++) {
      matches.push({
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
        notes: null
      });
    }
    
    if (!rounds.includes(roundName)) rounds.push(roundName);
  }
  
  // ===== GUARANTEE ROUND =====
  if (guaranteeTarget > 0) {
    for (let i = 0; i < guaranteeTarget; i++) {
      matches.push({
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
        notes: '0-2 teams play 3rd game'
      });
    }
    rounds.push('3-Game Guarantee Round');
  }
  
  // ===== CHAMPIONSHIP (2 matches) =====
  // Match 1: Losers Finals (if not already in losers bracket)
  const hasLosersFinals = matches.some(m => m.round === 'Losers Finals');
  if (!hasLosersFinals) {
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
      notes: 'Losers Bracket Finals'
    });
    if (!rounds.includes('Losers Finals')) rounds.push('Losers Finals');
  }
  
  // Match 2: Grand Finals
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
    notes: 'Winners Champion vs Losers Champion'
  });
  rounds.push('Grand Finals');
  
  const actualTotal = matches.length;
  const expectedTotal = winnersTarget + losersTarget + guaranteeTarget + championshipMatches;
  
  console.log(`🏆 3-GAME GUARANTEE: ${numTeams} teams → ${actualTotal} matches`);
  console.log(`   Breakdown: ${winnersTarget}W + ${losersTarget}L + ${guaranteeTarget}G + ${championshipMatches}C (z=${z})`);
  console.log(`   Expected: ${expectedTotal}, Actual: ${actualTotal}`);
  
  return { matches, rounds };
}

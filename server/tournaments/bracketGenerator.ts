import { TournamentTeam, TournamentMatch } from "@shared/schema";

export interface BracketGeneratorResult {
  matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[];
  rounds: string[];
}

/**
 * Generate Single Elimination bracket
 * Works with any number of teams (handles byes for non-power-of-2)
 */
export function generateSingleElimination(
  teams: TournamentTeam[],
  tournamentId: string
): BracketGeneratorResult {
  const numTeams = teams.length;
  const numRounds = Math.ceil(Math.log2(numTeams));
  const bracketSize = Math.pow(2, numRounds);
  const numByes = bracketSize - numTeams;

  const matches: Omit<TournamentMatch, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const rounds: string[] = [];

  // Round names
  const roundNames = ['Finals', 'Semifinals', 'Quarterfinals'];
  for (let i = roundNames.length; i < numRounds; i++) {
    roundNames.push(`Round ${numRounds - i}`);
  }
  roundNames.reverse();

  // Sort teams by seed
  const sortedTeams = [...teams].sort((a, b) => a.seed - b.seed);
  
  // Round 1 matchups with byes
  let currentRoundMatches: Array<{ team1Id: string | null; team2Id: string | null; matchId: string }> = [];
  let matchNumber = 1;

  // Create first round
  for (let i = 0; i < bracketSize / 2; i++) {
    const team1 = sortedTeams[i];
    const team2 = sortedTeams[bracketSize - 1 - i];
    
    const matchId = `match_r1_${matchNumber}`;
    
    if (team1 && team2) {
      // Regular match
      currentRoundMatches.push({
        team1Id: team1.id,
        team2Id: team2.id,
        matchId
      });
      matchNumber++;
    } else if (team1) {
      // Bye - team1 advances automatically
      currentRoundMatches.push({
        team1Id: team1.id,
        team2Id: null,
        matchId
      });
    }
  }

  // Generate all rounds
  for (let round = 0; round < numRounds; round++) {
    const roundName = roundNames[round];
    rounds.push(roundName);

    const nextRoundMatches: Array<{ team1Id: string | null; team2Id: string | null; matchId: string }> = [];

    for (let i = 0; i < currentRoundMatches.length; i += 2) {
      const match1 = currentRoundMatches[i];
      const match2 = currentRoundMatches[i + 1];

      const nextMatchId = round < numRounds - 1 ? `match_r${round + 2}_${Math.floor(i / 2) + 1}` : null;

      // Create match 1
      if (match1.team2Id) {
        matches.push({
          tournamentId,
          gameId: null,
          round: roundName,
          matchNumber: matches.length + 1,
          bracketType: null,
          team1Id: match1.team1Id,
          team2Id: match1.team2Id,
          winnerId: null,
          team1Score: null,
          team2Score: null,
          advancesToMatchId: nextMatchId,
          scheduledTime: null,
          location: null,
          status: 'scheduled',
          notes: null
        });
      }

      // Create match 2 if exists
      if (match2 && match2.team2Id) {
        matches.push({
          tournamentId,
          gameId: null,
          round: roundName,
          matchNumber: matches.length + 1,
          bracketType: null,
          team1Id: match2.team1Id,
          team2Id: match2.team2Id,
          winnerId: null,
          team1Score: null,
          team2Score: null,
          advancesToMatchId: nextMatchId,
          scheduledTime: null,
          location: null,
          status: 'scheduled',
          notes: null
        });
      }

      // Add to next round
      if (round < numRounds - 1) {
        nextRoundMatches.push({
          team1Id: null, // TBD from match1 winner
          team2Id: null, // TBD from match2 winner
          matchId: nextMatchId!
        });
      }
    }

    currentRoundMatches = nextRoundMatches;
  }

  return { matches, rounds };
}

/**
 * Generate Double Elimination bracket
 * Winners bracket + Losers bracket + Grand Finals
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

  // Winners Bracket (same as single elimination for round 1)
  const winnersRounds = Math.ceil(Math.log2(numTeams));
  
  // Create winners bracket round 1
  rounds.push('Winners Round 1');
  let matchNum = 1;

  for (let i = 0; i < Math.ceil(numTeams / 2); i++) {
    const team1 = sortedTeams[i * 2];
    const team2 = sortedTeams[i * 2 + 1];

    if (team1 && team2) {
      matches.push({
        tournamentId,
        gameId: null,
        round: 'Winners Round 1',
        matchNumber: matchNum++,
        bracketType: 'winners',
        team1Id: team1.id,
        team2Id: team2.id,
        winnerId: null,
        team1Score: null,
        team2Score: null,
        advancesToMatchId: null, // Will be set when creating next round
        scheduledTime: null,
        location: null,
        status: 'scheduled',
        notes: null
      });
    }
  }

  // Create losers bracket (will receive losers from winners bracket)
  rounds.push('Losers Round 1');
  rounds.push('Winners Finals');
  rounds.push('Losers Finals');
  rounds.push('Grand Finals');

  // Note: In a real implementation, you'd create the full losers bracket structure
  // For MVP, we'll create placeholders that get filled as winners/losers are determined

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

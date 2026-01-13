import type { TournamentMatch, TournamentTeam, TournamentSettings } from "@shared/schema";

interface CustomBracketMatchup {
  id: string;
  gameNumber: string;
  team1: string;
  team2: string;
  type?: string;
}

interface ResolveGameNameParams {
  match: TournamentMatch;
  format: string;
  settings?: TournamentSettings & { customBracket?: { matchups?: CustomBracketMatchup[] } };
}

export function resolveGameName({
  match,
  format,
  settings
}: ResolveGameNameParams): string {
  if (format === 'custom_bracket' && settings?.customBracket?.matchups) {
    const matchup = settings.customBracket.matchups.find(
      (m: CustomBracketMatchup) => m.id === match.id
    );
    if (matchup?.gameNumber) {
      return matchup.gameNumber;
    }
  }
  return match.round;
}

interface ResolveTeamDisplayParams {
  teamId: string | null;
  match: TournamentMatch;
  position: 'team1' | 'team2';
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  format: string;
  settings?: TournamentSettings & { customBracket?: { matchups?: CustomBracketMatchup[] } };
}

export function resolveTeamDisplay({
  teamId,
  match,
  position,
  teams,
  matches,
  format,
  settings
}: ResolveTeamDisplayParams): string {
  if (teamId) {
    const team = teams.find(t => t.id === teamId);
    const teamName = team?.teamName || "TBD";
    
    if (settings?.showSeedNumbers && team?.seed) {
      return `#${team.seed} ${teamName}`;
    }
    
    return teamName;
  }
  
  if (format === 'custom_bracket' && settings?.customBracket?.matchups) {
    const matchup = settings.customBracket.matchups.find(
      (m: CustomBracketMatchup) => m.id === match.id
    );
    if (matchup) {
      const teamValue = position === 'team1' ? matchup.team1 : matchup.team2;
      if (teamValue) {
        if (teamValue.startsWith('winner:') || teamValue.startsWith('loser:')) {
          const [type, gameRef] = teamValue.split(':');
          return `${type.charAt(0).toUpperCase() + type.slice(1)} of ${gameRef}`;
        }
        return teamValue;
      }
    }
  }
  
  if (match.notes) {
    const seedPattern = /Seed #(\d+) vs Seed #(\d+)/;
    const seedMatch = match.notes.match(seedPattern);
    if (seedMatch) {
      const seed1 = seedMatch[1];
      const seed2 = seedMatch[2];
      return position === 'team1' ? `Seed #${seed1}` : `Seed #${seed2}`;
    }
    
    const matchRefPattern = /(winner|loser)\s+(?:of|from)\s+match[_\s]?(\d+)/gi;
    const matchRefs = Array.from(match.notes.matchAll(matchRefPattern));
    const inboundMatchRefs = matchRefs.filter(ref => parseInt(ref[2]) !== match.matchNumber);
    
    if (inboundMatchRefs.length >= 1) {
      if (position === 'team1' && inboundMatchRefs[0]) {
        const prefix = inboundMatchRefs[0][1];
        const matchNum = inboundMatchRefs[0][2];
        return `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} of Match ${matchNum}`;
      } else if (position === 'team2' && inboundMatchRefs[1]) {
        const prefix = inboundMatchRefs[1][1];
        const matchNum = inboundMatchRefs[1][2];
        return `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} of Match ${matchNum}`;
      } else if (position === 'team2' && inboundMatchRefs.length === 1) {
        const prefix = inboundMatchRefs[0][1];
        const matchNum = parseInt(inboundMatchRefs[0][2]) + 1;
        return `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} of Match ${matchNum}`;
      }
    }
    
    const losersRoundMatch = match.notes.match(/receives\s+losers\s+from\s+winners\s+round\s+(\d+)/i);
    if (losersRoundMatch) {
      return `Loser from WR ${losersRoundMatch[1]}`;
    }
    
    if (/merger\s+round|previous\s+losers/i.test(match.notes)) {
      return 'TBD';
    }
  }
  
  const sourceMatches = matches.filter(m => 
    m.advancesToMatchId === match.id || 
    m.advancesToMatchId === `match_${match.matchNumber}`
  );
  
  if (sourceMatches.length === 1) {
    const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
    return `${prefix} Match ${sourceMatches[0].matchNumber}`;
  } else if (sourceMatches.length === 2) {
    const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
    if (position === 'team1') {
      return `${prefix} Match ${sourceMatches[0].matchNumber}`;
    } else {
      return `${prefix} Match ${sourceMatches[1].matchNumber}`;
    }
  } else if (sourceMatches.length > 0) {
    const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
    return `${prefix} Match ${sourceMatches[0].matchNumber}`;
  }
  
  if (match.notes) {
    if (match.notes.toLowerCase().includes('play-in')) {
      return "Winner of Play-In";
    }
    if (match.notes.toLowerCase().includes('winners round') && match.bracketType === 'losers') {
      const winnersRoundMatch = match.notes.match(/Winners Round (\d+)/);
      if (winnersRoundMatch) {
        const winnersRound = parseInt(winnersRoundMatch[1]);
        const winnersRoundMatches = matches.filter(m => 
          m.bracketType === 'winners' && m.round.includes(`Winners Round ${winnersRound}`)
        );
        
        const losersRoundMatches = matches.filter(m => 
          m.bracketType === 'losers' && m.round === match.round
        );
        const matchIndex = losersRoundMatches.findIndex(m => m.id === match.id);
        
        if (matchIndex >= 0) {
          const parent1Index = matchIndex * 2;
          const parent2Index = matchIndex * 2 + 1;
          
          if (position === 'team1' && winnersRoundMatches[parent1Index]) {
            return `Loser of Match ${winnersRoundMatches[parent1Index].matchNumber}`;
          } else if (position === 'team2' && winnersRoundMatches[parent2Index]) {
            return `Loser of Match ${winnersRoundMatches[parent2Index].matchNumber}`;
          }
        }
      }
      return "Loser from Winners";
    }
    if (match.notes.toLowerCase().includes('winners round')) {
      return "Winner from Winners";
    }
    if (match.notes.toLowerCase().includes('losers round')) {
      return "Winner from Losers";
    }
  }
  
  return "TBD";
}

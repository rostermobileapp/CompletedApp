import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Download } from "lucide-react";
import type { TournamentMatch, TournamentTeam, TournamentSettings } from "@shared/schema";
import { format as formatDate } from "date-fns";
import { jsPDF } from "jspdf";
import "svg2pdf.js";

interface BracketViewProps {
  matches: TournamentMatch[];
  teams: TournamentTeam[];
  format: string;
  settings?: TournamentSettings;
  tournamentName?: string;
}

export default function BracketView({ matches, teams, format, settings, tournamentName }: BracketViewProps) {
  const [zoom, setZoom] = useState(0.5); // Start zoomed out to show full bracket
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "TBD";
    const team = teams.find(t => t.id === teamId);
    return team?.teamName || "TBD";
  };

  // Helper to get descriptive text for TBD teams
  const getTeamDisplay = (teamId: string | null, match: TournamentMatch, position: 'team1' | 'team2') => {
    if (teamId) {
      const team = teams.find(t => t.id === teamId);
      const teamName = team?.teamName || "TBD";
      
      // Show seed numbers if enabled in settings
      if (settings?.showSeedNumbers && team?.seed) {
        return `#${team.seed} ${teamName}`;
      }
      
      return teamName;
    }
    
    // For TBD teams, check notes for source match info
    if (match.notes) {
      // Check for Round Robin + Playoffs seeding pattern (e.g., "Seed #1 vs Seed #2 (based on Round Robin record)")
      const seedPattern = /Seed #(\d+) vs Seed #(\d+)/;
      const seedMatch = match.notes.match(seedPattern);
      if (seedMatch) {
        const seed1 = seedMatch[1];
        const seed2 = seedMatch[2];
        if (position === 'team1') {
          return `Seed #${seed1}`;
        } else {
          return `Seed #${seed2}`;
        }
      }
      
      // Try to extract explicit match references from notes
      const matchNumbers = match.notes.match(/match_(\d+)/g);
      if (matchNumbers && matchNumbers.length >= 1) {
        if (position === 'team1' && matchNumbers.length >= 1) {
          const num = matchNumbers[0].replace('match_', '');
          const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
          return `${prefix} Match ${num}`;
        } else if (position === 'team2' && matchNumbers.length >= 2) {
          const num = matchNumbers[1].replace('match_', '');
          const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
          return `${prefix} Match ${num}`;
        } else if (position === 'team2' && matchNumbers.length === 1) {
          // For losers bracket with single match number in notes, need to calculate second parent
          const firstNum = parseInt(matchNumbers[0].replace('match_', ''));
          const secondNum = firstNum + 1; // Assume sequential parents
          const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
          return `${prefix} Match ${secondNum}`;
        }
      }
    }
    
    // For TBD teams, find matches that advance to this match
    const sourceMatches = matches.filter(m => m.advancesToMatchId === `match_${match.matchNumber}`);
    
    if (sourceMatches.length === 1) {
      const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
      return `${prefix} Match ${sourceMatches[0].matchNumber}`;
    } else if (sourceMatches.length === 2) {
      // Two matches feed into this one (common in brackets)
      // Distinguish based on position or match numbers
      const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
      if (position === 'team1') {
        return `${prefix} Match ${sourceMatches[0].matchNumber}`;
      } else {
        return `${prefix} Match ${sourceMatches[1].matchNumber}`;
      }
    } else if (sourceMatches.length > 0) {
      // Multiple sources - just show first for now
      const prefix = match.bracketType === 'losers' ? 'Loser of' : 'Winner of';
      return `${prefix} Match ${sourceMatches[0].matchNumber}`;
    }
    
    // Fallback to notes-based description
    if (match.notes) {
      if (match.notes.toLowerCase().includes('play-in')) {
        return "Winner of Play-In";
      }
      if (match.notes.toLowerCase().includes('winners round') && match.bracketType === 'losers') {
        // Extract which winners round by looking at match notes
        const winnersRoundMatch = match.notes.match(/Winners Round (\d+)/);
        if (winnersRoundMatch) {
          const winnersRound = parseInt(winnersRoundMatch[1]);
          // Find all Winners Round matches of that round
          const winnersRoundMatches = matches.filter(m => m.bracketType === 'winners' && m.round.includes(`Winners Round ${winnersRound}`));
          
          // Determine which position this losers match is in its round
          const losersRoundMatches = matches.filter(m => m.bracketType === 'losers' && m.round === match.round);
          const matchIndex = losersRoundMatches.findIndex(m => m.id === match.id);
          
          if (matchIndex >= 0) {
            // This losers match pairs winners matches: [matchIndex*2, matchIndex*2+1]
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
  };

  // Organize matches by round and bracket type with stable ordering
  const organizeMatches = () => {
    // Dynamic bracket organization: group by bracketType
    const bracketMaps: { [bracketType: string]: { [key: string]: TournamentMatch[] } } = {};
    
    console.log('🔍 BracketView received matches:', matches.length);
    console.log('🔍 Match rounds:', matches.map(m => `${m.matchNumber}: ${m.round} (${m.bracketType})`));
    
    matches.forEach(match => {
      const roundName = match.round;
      const bracketType = match.bracketType || 'main';
      
      if (!bracketMaps[bracketType]) {
        bracketMaps[bracketType] = {};
      }
      
      if (!bracketMaps[bracketType][roundName]) {
        bracketMaps[bracketType][roundName] = [];
      }
      bracketMaps[bracketType][roundName].push(match);
    });

    // Sort matches within each round by match number
    const sortRounds = (map: { [key: string]: TournamentMatch[] }) => {
      Object.keys(map).forEach(round => {
        map[round].sort((a, b) => a.matchNumber - b.matchNumber);
      });
    };
    
    Object.values(bracketMaps).forEach(sortRounds);

    // Create stable round ordering based on typical bracket progression
    const sortRoundNames = (rounds: string[]) => {
      const roundOrder = [
        'Round Robin',
        'Play-In Round',
        'Playoff Round 1', 'Playoff Round 2', 'Playoff Round 3', 'Playoff Round 4',
        'Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5',
        'Quarterfinals', 'Semifinals', 'Finals',
        'Winners Round 1', 'Winners Round 2', 'Winners Round 3', 'Winners Round 4',
        'Winners Quarterfinals', 'Winners Semifinals', 'Winners Finals',
        'Losers Round 1', 'Losers Round 2', 'Losers Round 3', 'Losers Round 4',
        'Losers Round 5', 'Losers Round 6', 'Losers Round 7', 'Losers Round 8',
        'Losers Quarterfinals', 'Losers Semifinals', 'Losers Finals',
        '3-Game Guarantee Round',
        'Losers1 Round 1', 'Losers1 Round 2', 'Losers1 Finals',
        'Losers2 Round 1', 'Losers2 Round 2', 'Losers2 Finals',
        'Consolation Round 1', 'Consolation Semifinals', 'Consolation Finals',
        'Championship Round 1', 'Championship Semifinals', 'Championship Finals',
        'Grand Finals', 'True Finals'
      ];
      
      return rounds.sort((a, b) => {
        const aIndex = roundOrder.indexOf(a);
        const bIndex = roundOrder.indexOf(b);
        
        // If both found in order array, use that order
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        
        // If only one found, prioritize the found one
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        
        // Otherwise alphabetical
        return a.localeCompare(b);
      });
    };

    // For backward compatibility, map to winners/losers
    const winnersMap = bracketMaps['winners'] || bracketMaps['championship'] || bracketMaps['main'] || {};
    const losersMap = bracketMaps['losers'] || bracketMaps['consolation'] || {};

    console.log('🔍 Bracket types found:', Object.keys(bracketMaps));
    console.log('🔍 Winners rounds:', Object.keys(winnersMap));
    console.log('🔍 Losers rounds:', Object.keys(losersMap));

    return {
      bracketMaps,
      winners: winnersMap,
      losers: losersMap,
      winnersRounds: sortRoundNames(Object.keys(winnersMap)),
      losersRounds: sortRoundNames(Object.keys(losersMap))
    };
  };

  const { bracketMaps, winners, losers, winnersRounds, losersRounds } = organizeMatches();
  const hasLosers = losersRounds.length > 0;
  const bracketTypes = Object.keys(bracketMaps);

  // Calculate match positions using center-based algorithm
  const MATCH_WIDTH = 240; // Reduced by 40px
  const MATCH_HEIGHT = 140; // Increased to contain both teams
  const ROUND_GAP = 200;
  const MATCH_GAP = 40; // Gap between game cards
  const BASE_VERTICAL_GAP = MATCH_HEIGHT + MATCH_GAP; // Uniform gap for both brackets
  const BRACKET_VERTICAL_GAP = MATCH_GAP; // Space between winners and losers brackets (same as between game cards)

  // Build match maps for parent lookup
  const matchById = new Map<string, TournamentMatch>();
  matches.forEach(m => matchById.set(m.id, m));

  // Memoize match centers and positions
  const matchCenters = new Map<string, number>();
  const matchPositions = new Map<string, { x: number; y: number }>();

  // Recursively calculate the center Y position of a match
  const getMatchCenter = (
    match: TournamentMatch, 
    roundIndex: number, 
    matchIndexInRound: number, 
    bracketMap: { [key: string]: TournamentMatch[] },
    roundNames: string[]
  ): number => {
    if (matchCenters.has(match.id)) {
      return matchCenters.get(match.id)!;
    }

    let centerY: number;

    // Base case: first round matches get evenly spaced
    if (roundIndex === 0) {
      centerY = matchIndexInRound * BASE_VERTICAL_GAP + MATCH_HEIGHT / 2;
    } else {
      // For Round 2+: calculate parent positions by index
      // Each match pairs with 2 matches from previous round
      // Match 0 in Round 2 has parents at indices 0,1 in Round 1
      // Match 1 in Round 2 has parents at indices 2,3 in Round 1, etc.
      const parentRound = roundIndex - 1;
      const parent1Index = matchIndexInRound * 2;
      const parent2Index = matchIndexInRound * 2 + 1;
      
      if (roundIndex > 0 && parentRound >= 0 && parentRound < roundNames.length) {
        const parentRoundName = roundNames[parentRound];
        const parentMatches = bracketMap[parentRoundName] || [];
        
        if (parentMatches[parent1Index] && parentMatches[parent2Index]) {
          // Both parents found: center between them
          const parent1Center = getMatchCenter(parentMatches[parent1Index], parentRound, parent1Index, bracketMap, roundNames);
          const parent2Center = getMatchCenter(parentMatches[parent2Index], parentRound, parent2Index, bracketMap, roundNames);
          centerY = (parent1Center + parent2Center) / 2;
        } else if (parentMatches[parent1Index]) {
          // Only first parent: use its center
          centerY = getMatchCenter(parentMatches[parent1Index], parentRound, parent1Index, bracketMap, roundNames);
        } else {
          // Fallback: evenly spaced
          centerY = matchIndexInRound * BASE_VERTICAL_GAP + MATCH_HEIGHT / 2;
        }
      } else {
        // Fallback: evenly spaced
        centerY = matchIndexInRound * BASE_VERTICAL_GAP + MATCH_HEIGHT / 2;
      }
    }

    matchCenters.set(match.id, centerY);
    return centerY;
  };


  // Helper to calculate positions for a single bracket
  const calculateBracketPositions = (
    bracketMap: { [key: string]: TournamentMatch[] },
    roundNames: string[],
    startY: number,
    xOffset: number = 0
  ): number => {
    let maxBottomY = startY;
    
    roundNames.forEach((roundName, roundIndex) => {
      const roundMatches = bracketMap[roundName] || [];
      roundMatches.forEach((match, matchIndex) => {
        // Pass bracket-specific map and round names to getMatchCenter
        const centerY = getMatchCenter(match, roundIndex, matchIndex, bracketMap, roundNames);
        const x = xOffset + (roundIndex * (MATCH_WIDTH + ROUND_GAP));
        const y = startY + centerY - MATCH_HEIGHT / 2;
        matchPositions.set(match.id, { x, y });
        
        const bottomY = y + MATCH_HEIGHT;
        if (bottomY > maxBottomY) {
          maxBottomY = bottomY;
        }
      });
    });
    
    return maxBottomY;
  };

  // Calculate positions for all matches - dynamically handle all bracket types
  const calculateAllPositions = () => {
    const sortRoundNames = (rounds: string[]) => {
      const roundOrder = [
        'Round Robin',
        'Play-In Round',
        'Playoff Round 1', 'Playoff Round 2', 'Playoff Round 3', 'Playoff Round 4',
        'Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5',
        'Quarterfinals', 'Semifinals', 'Finals',
        'Winners Round 1', 'Winners Round 2', 'Winners Round 3', 'Winners Round 4',
        'Winners Quarterfinals', 'Winners Semifinals', 'Winners Finals',
        'Losers Round 1', 'Losers Round 2', 'Losers Round 3', 'Losers Round 4',
        'Losers Round 5', 'Losers Round 6', 'Losers Round 7', 'Losers Round 8',
        'Losers Quarterfinals', 'Losers Semifinals', 'Losers Finals',
        '3-Game Guarantee Round',
        'Losers1 Round 1', 'Losers1 Round 2', 'Losers1 Finals',
        'Losers2 Round 1', 'Losers2 Round 2', 'Losers2 Finals',
        'Consolation Round 1', 'Consolation Semifinals', 'Consolation Finals',
        'Championship Round 1', 'Championship Semifinals', 'Championship Finals',
        'Grand Finals', 'True Finals'
      ];
      
      return rounds.sort((a, b) => {
        const aIndex = roundOrder.indexOf(a);
        const bIndex = roundOrder.indexOf(b);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b);
      });
    };
    
    let currentY = 0;
    
    // Handle different formats
    const bracketNames = Object.keys(bracketMaps).sort();
    
    // Special handling for known multi-bracket formats
    if (bracketNames.includes('winners') && bracketNames.includes('losers') && !bracketNames.includes('losers1')) {
      // Standard Double Elimination or 3-Game Guarantee
      const winnersBottomY = calculateBracketPositions(winners, winnersRounds, 0, 0);
      const losersStartY = winnersBottomY + BRACKET_VERTICAL_GAP;
      const losersXOffset = (MATCH_WIDTH + ROUND_GAP); // Align losers with Round 2 of winners
      calculateBracketPositions(losers, losersRounds, losersStartY, losersXOffset);
    } else if (bracketNames.includes('winners') && bracketNames.includes('losers1') && bracketNames.includes('losers2')) {
      // Triple Elimination - 3 brackets stacked vertically
      const winnersBottomY = calculateBracketPositions(winners, winnersRounds, 0, 0);
      
      const losers1Rounds = sortRoundNames(Object.keys(bracketMaps['losers1'] || {}));
      const losers1StartY = winnersBottomY + BRACKET_VERTICAL_GAP;
      const losers1BottomY = calculateBracketPositions(bracketMaps['losers1'], losers1Rounds, losers1StartY, 0);
      
      const losers2Rounds = sortRoundNames(Object.keys(bracketMaps['losers2'] || {}));
      const losers2StartY = losers1BottomY + BRACKET_VERTICAL_GAP;
      calculateBracketPositions(bracketMaps['losers2'], losers2Rounds, losers2StartY, 0);
    } else if (bracketNames.includes('championship') && bracketNames.includes('consolation')) {
      // Consolation Tournament - championship + consolation brackets
      const championshipRounds = sortRoundNames(Object.keys(bracketMaps['championship'] || {}));
      const championshipBottomY = calculateBracketPositions(bracketMaps['championship'], championshipRounds, 0, 0);
      
      const consolationRounds = sortRoundNames(Object.keys(bracketMaps['consolation'] || {}));
      const consolationStartY = championshipBottomY + BRACKET_VERTICAL_GAP;
      calculateBracketPositions(bracketMaps['consolation'], consolationRounds, consolationStartY, 0);
    } else if (bracketNames.some(name => name.includes('east') || name.includes('west') || name.includes('north') || name.includes('south'))) {
      // Compass Draw - 8 divisions in a grid (2 rows x 4 columns)
      const compassBrackets = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
      const foundCompassBrackets = compassBrackets.filter(name => bracketNames.includes(name));
      
      // Arrange in 2 rows x 4 columns
      foundCompassBrackets.forEach((bracketName, index) => {
        const row = Math.floor(index / 4);
        const col = index % 4;
        const startY = row * (MATCH_HEIGHT * 4 + BRACKET_VERTICAL_GAP);
        const xOffset = col * (MATCH_WIDTH * 2 + ROUND_GAP * 3);
        
        const bracketRounds = sortRoundNames(Object.keys(bracketMaps[bracketName] || {}));
        calculateBracketPositions(bracketMaps[bracketName], bracketRounds, startY, xOffset);
      });
    } else {
      // Fallback: Single Elimination or unknown format - use main/winners bracket
      const mainBracket = bracketMaps['main'] || bracketMaps['winners'] || bracketMaps['championship'] || {};
      const mainRounds = sortRoundNames(Object.keys(mainBracket));
      calculateBracketPositions(mainBracket, mainRounds, 0, 0);
    }
  };

  calculateAllPositions();

  const renderMatch = (match: TournamentMatch, x: number, y: number, bracketColorType?: string) => {
    const isCompleted = match.status === 'completed';
    // Only highlight if there's an actual winner (avoid null === null bug)
    const team1Wins = match.winnerId != null && match.winnerId === match.team1Id;
    const team2Wins = match.winnerId != null && match.winnerId === match.team2Id;

    // Determine bracket type for color coding
    const isGrandFinal = match.round === 'Grand Finals' || match.round === 'True Finals';
    const bracketType = bracketColorType || match.bracketType || 'main';
    
    // Visual hierarchy with 4px borders
    // Blue for winners/championship/main, Red for losers/consolation, 
    // Purple for losers1, Orange for losers2, Gold for grand finals,
    // Green/Teal/Indigo/Pink for compass directions
    let borderClass: string;
    let cardBgClass: string;
    let headerClass: string;
    let titleClass: string;
    let badgeClass: string;
    let winnerBgClass: string;
    
    if (isGrandFinal) {
      borderClass = 'border-[4px] border-yellow-500 dark:border-yellow-400';
      cardBgClass = 'bg-yellow-500/50 dark:bg-yellow-400/50';
      headerClass = 'bg-yellow-500/10';
      titleClass = 'text-yellow-600 dark:text-yellow-400';
      badgeClass = isCompleted ? 'bg-yellow-500' : 'border-yellow-500 text-yellow-600 dark:text-yellow-400';
      winnerBgClass = 'bg-yellow-500 text-white';
    } else if (bracketType === 'losers' || bracketType === 'consolation') {
      borderClass = 'border-[4px] border-red-500 dark:border-red-400';
      cardBgClass = 'bg-red-500/50 dark:bg-red-400/50';
      headerClass = 'bg-red-500/10';
      titleClass = 'text-red-600 dark:text-red-400';
      badgeClass = isCompleted ? 'bg-red-500' : 'border-red-500 text-red-600 dark:text-red-400';
      winnerBgClass = 'bg-red-500 text-white';
    } else if (bracketType === 'losers1') {
      borderClass = 'border-[4px] border-purple-500 dark:border-purple-400';
      cardBgClass = 'bg-purple-500/50 dark:bg-purple-400/50';
      headerClass = 'bg-purple-500/10';
      titleClass = 'text-purple-600 dark:text-purple-400';
      badgeClass = isCompleted ? 'bg-purple-500' : 'border-purple-500 text-purple-600 dark:text-purple-400';
      winnerBgClass = 'bg-purple-500 text-white';
    } else if (bracketType === 'losers2') {
      borderClass = 'border-[4px] border-orange-500 dark:border-orange-400';
      cardBgClass = 'bg-orange-500/50 dark:bg-orange-400/50';
      headerClass = 'bg-orange-500/10';
      titleClass = 'text-orange-600 dark:text-orange-400';
      badgeClass = isCompleted ? 'bg-orange-500' : 'border-orange-500 text-orange-600 dark:text-orange-400';
      winnerBgClass = 'bg-orange-500 text-white';
    } else if (bracketType === 'guarantee') {
      // Cyan/aqua for guarantee bracket
      borderClass = 'border-[4px] border-cyan-500 dark:border-cyan-400';
      cardBgClass = 'bg-cyan-500/50 dark:bg-cyan-400/50';
      headerClass = 'bg-cyan-500/10';
      titleClass = 'text-cyan-600 dark:text-cyan-400';
      badgeClass = isCompleted ? 'bg-cyan-500' : 'border-cyan-500 text-cyan-600 dark:text-cyan-400';
      winnerBgClass = 'bg-cyan-500 text-white';
    } else if (bracketType.includes('east') || bracketType.includes('west')) {
      borderClass = 'border-[4px] border-green-500 dark:border-green-400';
      cardBgClass = 'bg-green-500/50 dark:bg-green-400/50';
      headerClass = 'bg-green-500/10';
      titleClass = 'text-green-600 dark:text-green-400';
      badgeClass = isCompleted ? 'bg-green-500' : 'border-green-500 text-green-600 dark:text-green-400';
      winnerBgClass = 'bg-green-500 text-white';
    } else if (bracketType.includes('north') || bracketType.includes('south')) {
      borderClass = 'border-[4px] border-teal-500 dark:border-teal-400';
      cardBgClass = 'bg-teal-500/50 dark:bg-teal-400/50';
      headerClass = 'bg-teal-500/10';
      titleClass = 'text-teal-600 dark:text-teal-400';
      badgeClass = isCompleted ? 'bg-teal-500' : 'border-teal-500 text-teal-600 dark:text-teal-400';
      winnerBgClass = 'bg-teal-500 text-white';
    } else {
      // Default: winners/championship/main
      borderClass = 'border-[4px] border-blue-500 dark:border-blue-400';
      cardBgClass = 'bg-blue-500/50 dark:bg-blue-400/50';
      headerClass = 'bg-blue-500/10';
      titleClass = 'text-blue-600 dark:text-blue-400';
      badgeClass = isCompleted ? 'bg-blue-500' : 'border-blue-500 text-blue-600 dark:text-blue-400';
      winnerBgClass = 'bg-blue-500 text-white';
    }

    return (
      <g key={match.id} transform={`translate(${x}, ${y})`}>
        <foreignObject width={MATCH_WIDTH} height={MATCH_HEIGHT}>
          <Card className={`h-full shadow-lg ${cardBgClass} ${borderClass}`} data-testid={`card-match-${match.matchNumber}`}>
            <CardHeader className={`p-2 ${headerClass}`}>
              <div className="space-y-1">
                <CardTitle className={`text-xs font-semibold text-white`}>
                  {match.round}
                </CardTitle>
                {(settings?.showGameNumbers || match.scheduledTime) && (
                  <div className={`text-[10px] font-medium text-white opacity-80 flex items-center gap-1.5`}>
                    {settings?.showGameNumbers && <span>Game #{match.matchNumber}</span>}
                    {match.scheduledTime && (
                      <span className="text-[9px] opacity-70">
                        {settings?.showGameNumbers && '• '}{formatDate(new Date(match.scheduledTime), "MMM d, h:mm a")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-1">
              {/* Team 1 */}
              <div
                className={`flex items-center justify-between p-2 rounded-md text-sm transition-colors ${
                  team1Wins
                    ? `${winnerBgClass} font-bold shadow-sm`
                    : 'bg-muted'
                }`}
              >
                <span className="truncate text-xs text-white" data-testid={`text-team1-${match.matchNumber}`}>
                  {getTeamDisplay(match.team1Id, match, 'team1')}
                </span>
                {match.team1Score !== null && (
                  <span className="font-bold ml-2 text-lg text-white" data-testid={`text-score1-${match.matchNumber}`}>
                    {match.team1Score}
                  </span>
                )}
              </div>

              {/* Team 2 */}
              <div
                className={`flex items-center justify-between p-2 rounded-md text-sm transition-colors ${
                  team2Wins
                    ? `${winnerBgClass} font-bold shadow-sm`
                    : 'bg-muted'
                }`}
              >
                <span className="truncate text-xs text-white" data-testid={`text-team2-${match.matchNumber}`}>
                  {getTeamDisplay(match.team2Id, match, 'team2')}
                </span>
                {match.team2Score !== null && (
                  <span className="font-bold ml-2 text-lg text-white" data-testid={`text-score2-${match.matchNumber}`}>
                    {match.team2Score}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </foreignObject>
      </g>
    );
  };

  const renderConnector = (fromMatchId: string, toMatchId: string, isLoserPath = false) => {
    const fromPos = matchPositions.get(fromMatchId);
    const toPos = matchPositions.get(toMatchId);
    if (!fromPos || !toPos) return null;
    
    // Calculate centers from positions
    const fromCenterY = fromPos.y + MATCH_HEIGHT / 2;
    const toCenterY = toPos.y + MATCH_HEIGHT / 2;
    
    const startX = fromPos.x + MATCH_WIDTH;
    const startY = fromCenterY;
    const endX = toPos.x;
    const endY = toCenterY;
    
    const midX = (startX + endX) / 2;
    
    // Blue arrows (→) for winner advancement, Red arrows (↓) for loser drops
    const strokeColor = isLoserPath ? '#ef4444' : '#3b82f6'; // Red for losers, Blue for winners
    const strokeDash = isLoserPath ? '5,5' : 'none';
    const markerEnd = isLoserPath ? 'url(#arrowhead-loser)' : 'url(#arrowhead-winner)';
    
    return (
      <path
        d={`M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`}
        stroke={strokeColor}
        strokeWidth="3"
        strokeDasharray={strokeDash}
        fill="none"
        opacity="0.7"
        markerEnd={markerEnd}
      />
    );
  };

  const renderBracket = () => {
    const elements: JSX.Element[] = [];

    // Get bracket label mappings
    const bracketLabels: { [key: string]: string } = {
      'winners': 'Winners Bracket',
      'losers': 'Losers Bracket',
      'guarantee': '3-Game Guarantee Round',
      'losers1': 'Losers 1 Bracket',
      'losers2': 'Losers 2 Bracket',
      'championship': 'Championship Bracket',
      'consolation': 'Consolation Bracket',
      'east': 'East Division',
      'northeast': 'Northeast Division',
      'north': 'North Division',
      'northwest': 'Northwest Division',
      'west': 'West Division',
      'southwest': 'Southwest Division',
      'south': 'South Division',
      'southeast': 'Southeast Division'
    };

    // Render all matches (they've been positioned by calculateAllPositions)
    matches.forEach((match) => {
      const pos = matchPositions.get(match.id);
      if (pos) {
        elements.push(renderMatch(match, pos.x, pos.y, match.bracketType || undefined));
      }
    });

    // Add bracket labels for multi-bracket formats
    Object.keys(bracketMaps).forEach((bracketType, bracketIndex) => {
      const bracketRounds = Object.keys(bracketMaps[bracketType]);
      if (bracketRounds.length === 0) return;
      
      // Find the top-left position of this bracket
      let minY = Infinity;
      let minX = Infinity;
      
      bracketRounds.forEach((roundName) => {
        const roundMatches = bracketMaps[bracketType][roundName] || [];
        roundMatches.forEach((match) => {
          const pos = matchPositions.get(match.id);
          if (pos) {
            if (pos.y < minY) minY = pos.y;
            if (pos.x < minX) minX = pos.x;
          }
        });
      });
      
      // Only show bracket label for non-main brackets or when there are multiple brackets
      const showLabel = Object.keys(bracketMaps).length > 1 && bracketType !== 'main';
      
      if (showLabel && minY !== Infinity && minX !== Infinity) {
        const labelY = minY - 60;
        const labelText = bracketLabels[bracketType] || bracketType;
        
        elements.push(
          <g key={`label-bracket-${bracketType}`} transform={`translate(${minX}, ${labelY})`}>
            <foreignObject width={250} height={40}>
              <div className={`font-bold text-lg ${
                bracketType === 'losers' || bracketType === 'consolation' ? 'text-destructive' : 
                bracketType === 'losers1' ? 'text-purple-600 dark:text-purple-400' :
                bracketType === 'losers2' ? 'text-orange-600 dark:text-orange-400' :
                'text-primary'
              }`}>
                {labelText}
              </div>
            </foreignObject>
          </g>
        );
      }
    });

    // Draw connectors based on advancesToMatchId
    matches.forEach(match => {
      if (match.advancesToMatchId) {
        // Determine if this is a losers bracket connection by checking the notes
        const isLosersConnection = match.notes?.toLowerCase().includes('loser') || false;
        
        const connector = renderConnector(match.id, match.advancesToMatchId, isLosersConnection);
        if (connector) {
          elements.push(
            <g key={`connector-${match.id}`}>
              {connector}
            </g>
          );
        }
      }
    });

    return elements;
  };

  // Calculate SVG dimensions based on actual match positions
  const calculateDimensions = () => {
    let maxX = 0;
    let maxY = 0;
    
    // Find the maximum X and Y positions from all matches
    matchPositions.forEach((pos) => {
      if (pos.x + MATCH_WIDTH > maxX) {
        maxX = pos.x + MATCH_WIDTH;
      }
      if (pos.y + MATCH_HEIGHT > maxY) {
        maxY = pos.y + MATCH_HEIGHT;
      }
    });
    
    // Add padding
    const width = maxX + 200;
    const height = maxY + 200;
    
    return { width, height };
  };

  const { width: svgWidth, height: svgHeight } = calculateDimensions();
  
  console.log('🔍 SVG Dimensions:', { width: svgWidth, height: svgHeight, hasLosers, losersRounds: losersRounds.length });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const delta = -e.deltaY * 0.001;
      setZoom(prev => Math.min(Math.max(0.3, prev + delta), 3));
    } else {
      // Pan
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(0.5);
    setPan({ x: 0, y: 0 });
  };

  const exportToPDF = async () => {
    if (!svgRef.current) return;
    
    setIsExporting(true);
    
    try {
      // Create PDF in landscape mode, 8.5x11 inches
      // jsPDF uses points (72 points = 1 inch)
      const pageWidth = 11 * 72; // 11 inches in points
      const pageHeight = 8.5 * 72; // 8.5 inches in points
      const margin = 0.5 * 72; // 0.5 inch margins in points
      
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: [pageWidth, pageHeight]
      });

      // Calculate available space after margins
      const availableWidth = pageWidth - (2 * margin);
      const availableHeight = pageHeight - (2 * margin) - 50; // Extra space for title
      
      // Clone the SVG to avoid modifying the original
      const svgClone = svgRef.current.cloneNode(true) as SVGElement;
      
      // Get SVG dimensions
      const svgWidth = parseFloat(svgClone.getAttribute('width') || '0');
      const svgHeight = parseFloat(svgClone.getAttribute('height') || '0');
      
      // Calculate scale to fit within available space
      const scaleX = availableWidth / svgWidth;
      const scaleY = availableHeight / svgHeight;
      const scale = Math.min(scaleX, scaleY);
      
      const scaledWidth = svgWidth * scale;
      const scaledHeight = svgHeight * scale;
      
      // Center the bracket on the page
      const xOffset = margin + (availableWidth - scaledWidth) / 2;
      const yOffset = margin + 50; // Leave space for title
      
      // Add title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const title = tournamentName || 'Tournament Bracket';
      const titleWidth = doc.getTextWidth(title);
      doc.text(title, (pageWidth - titleWidth) / 2, margin + 20);
      
      // Convert SVG to PDF
      await doc.svg(svgClone, {
        x: xOffset,
        y: yOffset,
        width: scaledWidth,
        height: scaledHeight
      });
      
      // Save the PDF
      const filename = tournamentName 
        ? `${tournamentName.replace(/[^a-z0-9]/gi, '_')}_bracket.pdf`
        : 'tournament_bracket.pdf';
      doc.save(filename);
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={exportToPDF}
          disabled={isExporting}
          data-testid="button-download-pdf"
        >
          <Download className="h-4 w-4 mr-1" />
          {isExporting ? 'Exporting...' : 'Download PDF'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setZoom(prev => Math.min(prev + 0.2, 3))}
          data-testid="button-zoom-in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.3))}
          data-testid="button-zoom-out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={resetView}
          data-testid="button-reset-view"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Bracket Container */}
      <div
        ref={containerRef}
        className="overflow-hidden border rounded-lg bg-muted/20"
        style={{ 
          height: '70vh',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none'
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          width={svgWidth * zoom}
          height={svgHeight * zoom}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transition: isDragging ? 'none' : 'transform 0.1s'
          }}
        >
          {/* Arrow marker definitions */}
          <defs>
            <marker
              id="arrowhead-winner"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="hsl(var(--primary))" />
            </marker>
            <marker
              id="arrowhead-loser"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="hsl(var(--destructive))" />
            </marker>
          </defs>
          
          <g transform="translate(50, 80)">
            {renderBracket()}
          </g>
        </svg>
      </div>
    </div>
  );
}

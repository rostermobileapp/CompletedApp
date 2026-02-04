import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Edit } from "lucide-react";
import type { TournamentMatch, TournamentTeam, TournamentSettings } from "@shared/schema";
import { format as formatDate } from "date-fns";
import TournamentMatchScoreModal from "./TournamentMatchScoreModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { resolveTeamDisplay } from "@/utils/tournamentMatchDisplay";

interface BracketViewProps {
  matches: TournamentMatch[];
  teams: TournamentTeam[];
  format: string;
  settings?: TournamentSettings;
  tournamentName?: string;
  tournamentId: string;
  isCommissioner?: boolean;
  tournamentType?: 'standalone' | 'season_playoff';
}

export default function BracketView({ matches, teams, format, settings, tournamentName, tournamentId, isCommissioner = false, tournamentType }: BracketViewProps) {
  const [zoom, setZoom] = useState(0.5); // Start zoomed out to show full bracket
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { toast } = useToast();

  // Mutation to update match team assignments
  const updateMatchTeamMutation = useMutation({
    mutationFn: async ({ matchId, team1Id, team2Id }: { matchId: string; team1Id?: string | null; team2Id?: string | null }) => {
      const updates: any = {};
      if (team1Id !== undefined) updates.team1Id = team1Id;
      if (team2Id !== undefined) updates.team2Id = team2Id;
      
      return await apiRequest('PATCH', `/api/tournament-matches/${matchId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'matches'] });
      toast({
        title: "Team assigned",
        description: "The team has been successfully assigned to this match.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign team to match.",
        variant: "destructive",
      });
    },
  });

  // Check if a team is already selected in the same round
  const isTeamAlreadyInRound = (teamId: string, currentMatch: TournamentMatch): boolean => {
    const matchesInRound = matches.filter(m => m.round === currentMatch.round && m.id !== currentMatch.id);
    return matchesInRound.some(m => m.team1Id === teamId || m.team2Id === teamId);
  };

  // Get available teams for a specific match slot (excluding teams already in this round or same match)
  const getAvailableTeams = (currentMatch: TournamentMatch, position: 'team1' | 'team2'): TournamentTeam[] => {
    // Get the team ID in the other slot of the same match
    const otherSlotTeamId = position === 'team1' ? currentMatch.team2Id : currentMatch.team1Id;
    
    const available = teams.filter(team => {
      // Exclude if team is in the other slot of this match
      if (otherSlotTeamId && team.id === otherSlotTeamId) {
        return false;
      }
      // Exclude if team is already in another match in this round
      return !isTeamAlreadyInRound(team.id, currentMatch);
    });
    
    console.log('🔍 Available teams for match:', currentMatch.matchNumber, 'position:', position, available.map(t => ({ id: t.id, name: t.teamName, seed: t.seed })));
    return available;
  };

  // Handle team selection
  const handleTeamSelect = (matchId: string, position: 'team1' | 'team2', teamId: string, currentMatch: TournamentMatch) => {
    // Handle clear selection
    if (teamId === '__clear__') {
      if (position === 'team1') {
        updateMatchTeamMutation.mutate({ matchId, team1Id: null });
      } else {
        updateMatchTeamMutation.mutate({ matchId, team2Id: null });
      }
      return;
    }

    // Check if team is being selected for the other slot in the same match
    const otherSlotTeamId = position === 'team1' ? currentMatch.team2Id : currentMatch.team1Id;
    if (otherSlotTeamId === teamId) {
      toast({
        title: "Team already scheduled",
        description: "This team has already been scheduled in this round.",
        variant: "destructive",
      });
      return;
    }

    // Check if team is already in this round
    if (isTeamAlreadyInRound(teamId, currentMatch)) {
      toast({
        title: "Team already scheduled",
        description: "This team has already been scheduled in this round.",
        variant: "destructive",
      });
      return;
    }

    // Update the match
    if (position === 'team1') {
      updateMatchTeamMutation.mutate({ matchId, team1Id: teamId });
    } else {
      updateMatchTeamMutation.mutate({ matchId, team2Id: teamId });
    }
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "TBD";
    const team = teams.find(t => t.id === teamId);
    return team?.teamName || "TBD";
  };

  // Helper to check if a specific team slot receives a team from another match
  // Returns true ONLY if there's an actual advancement relationship (advancesToMatchId)
  const hasUpstreamMatch = (match: TournamentMatch, position: 'team1' | 'team2'): boolean => {
    // Check if any match has advancesToMatchId pointing to this match
    // This indicates an actual structural relationship, not just descriptive notes
    const parentMatches = matches.filter(m => 
      m.advancesToMatchId === match.id || 
      m.advancesToMatchId === `match_${match.matchNumber}`
    );
    
    // If there are 2 parent matches, both slots have upstream matches
    if (parentMatches.length >= 2) {
      return true;
    }
    
    // If there's 1 parent match, determine which slot it feeds
    // Check notes to see which position receives the upstream match
    if (parentMatches.length === 1 && match.notes) {
      const parentMatchNum = parentMatches[0].matchNumber;
      const matchRefPattern = new RegExp(`(winner|loser)\\s+(?:of|from)\\s+match[_\\s]?${parentMatchNum}`, 'i');
      const noteMatch = match.notes.match(matchRefPattern);
      
      // If the note mentions the parent match, check which position it's in
      // Typically the first mention is team1, second mention is team2
      if (noteMatch) {
        const firstMention = match.notes.indexOf(noteMatch[0]);
        const remainingNotes = match.notes.substring(firstMention + noteMatch[0].length);
        const hasSecondMention = remainingNotes.match(matchRefPattern);
        
        // If only one mention, it's typically for team1 position
        if (!hasSecondMention && position === 'team1') {
          return true;
        }
        // If there's a second mention in the remaining notes, team2 position
        if (hasSecondMention && position === 'team2') {
          return true;
        }
      }
    }
    
    // No structural parent matches found for this position
    return false;
  };

  // Helper to get descriptive text for TBD teams - uses shared utility
  const getTeamDisplay = (teamId: string | null, match: TournamentMatch, position: 'team1' | 'team2') => {
    return resolveTeamDisplay({
      teamId,
      match,
      position,
      teams,
      matches,
      format,
      settings: settings as any
    });
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

  // Render match card as absolutely positioned div (NOT inside SVG foreignObject)
  const renderMatchCard = (match: TournamentMatch, x: number, y: number, bracketColorType?: string) => {
    const isCompleted = match.status === 'completed';
    // Only highlight if there's an actual winner (avoid null === null bug)
    const team1Wins = match.winnerId != null && match.winnerId === match.team1Id;
    const team2Wins = match.winnerId != null && match.winnerId === match.team2Id;

    // Determine bracket type for color coding
    const isGrandFinal = match.round === 'Grand Finals' || match.round === 'True Finals';
    const bracketType = bracketColorType || match.bracketType || 'main';
    
    // Clean card styling matching CustomBracketBuilder design
    // Green (#32CD32) for winners/main brackets, Red for losers brackets, Yellow for grand finals
    let borderColor: string;
    let winnerBgClass: string;
    
    if (isGrandFinal) {
      borderColor = 'border-[#FFD700]'; // Gold for grand finals
      winnerBgClass = 'bg-[#FFD700] text-black';
    } else if (bracketType === 'losers' || bracketType === 'consolation' || bracketType === 'losers1' || bracketType === 'losers2') {
      borderColor = 'border-destructive'; // Red for losers brackets
      winnerBgClass = 'bg-destructive text-white';
    } else {
      // Default: winners/championship/main - use green like CustomBracketBuilder
      borderColor = 'border-[#32CD32]';
      winnerBgClass = 'bg-[#32CD32] text-black';
    }

    // Calculate position and size with zoom (add 50, 80 offset like the SVG g transform)
    const cardX = (x + 50) * zoom;
    const cardY = (y + 80) * zoom;
    const cardWidth = MATCH_WIDTH * zoom;
    const cardHeight = MATCH_HEIGHT * zoom;

    return (
      <Card 
        key={match.id}
        className={`match-card absolute bg-card ${borderColor} border-[4px] cursor-pointer hover:opacity-90 transition-opacity group`} 
        style={{
          width: cardWidth,
          height: cardHeight,
          left: cardX,
          top: cardY,
          fontSize: `${zoom * 100}%`
        }}
        data-testid={`card-match-${match.matchNumber}`}
        onClick={() => setSelectedMatchId(match.id)}
      >
            {/* Edit Icon - Always visible for commissioners */}
            {isCommissioner && (
              <div className="absolute top-1 right-1 z-10 bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-md opacity-80 group-hover:opacity-100 transition-opacity">
                <Edit className="h-3.5 w-3.5 text-muted-foreground" data-testid={`icon-edit-${match.matchNumber}`} />
              </div>
            )}
            <div className="h-full p-3 flex flex-col gap-1">
              {/* Header - clean but with round context */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-black dark:text-white truncate" data-testid={`label-match-${match.matchNumber}`}>
                    Game {match.matchNumber}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {match.round}
                  </span>
                </div>
                {match.scheduledTime && (
                  <span className="text-[9px] font-bold text-black dark:text-white whitespace-nowrap">
                    {formatDate(new Date(match.scheduledTime), "MMM d")}
                  </span>
                )}
              </div>

              {/* Teams section */}
              <div className="flex-1 flex flex-col gap-1">
                {/* Team 1 */}
                <div
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-sm ${
                    team1Wins
                      ? `${winnerBgClass} font-bold`
                      : 'bg-muted'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {tournamentType === 'standalone' && !hasUpstreamMatch(match, 'team1') ? (
                    <Select
                      value={match.team1Id || ""}
                      onValueChange={(value) => handleTeamSelect(match.id, 'team1', value, match)}
                      disabled={updateMatchTeamMutation.isPending}
                    >
                      <SelectTrigger className="h-6 text-xs bg-background border-0 font-bold text-black dark:text-white" data-testid={`select-team1-${match.matchNumber}`}>
                        <SelectValue placeholder="Select Team">
                          {match.team1Id ? getTeamName(match.team1Id) : "Select Team"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {match.team1Id && (
                          <SelectItem value="__clear__" className="text-destructive font-medium">
                            ✕ Clear Selection
                          </SelectItem>
                        )}
                        {getAvailableTeams(match, 'team1').map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.teamName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`truncate text-xs font-bold text-black dark:text-white`} data-testid={`text-team1-${match.matchNumber}`}>
                      {getTeamDisplay(match.team1Id, match, 'team1')}
                    </span>
                  )}
                  {match.team1Score != null && (
                    <span className={`font-bold ml-2 flex-shrink-0 text-black dark:text-white`} data-testid={`text-score1-${match.matchNumber}`}>
                      {match.team1Score}
                    </span>
                  )}
                </div>

                {/* VS divider like CustomBracketBuilder */}
                <div className="text-center text-xs font-bold text-black dark:text-white">vs</div>

                {/* Team 2 */}
                <div
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-sm ${
                    team2Wins
                      ? `${winnerBgClass} font-bold`
                      : 'bg-muted'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {tournamentType === 'standalone' && !hasUpstreamMatch(match, 'team2') ? (
                    <Select
                      value={match.team2Id || ""}
                      onValueChange={(value) => handleTeamSelect(match.id, 'team2', value, match)}
                      disabled={updateMatchTeamMutation.isPending}
                    >
                      <SelectTrigger className="h-6 text-xs bg-background border-0 font-bold text-black dark:text-white" data-testid={`select-team2-${match.matchNumber}`}>
                        <SelectValue placeholder="Select Team">
                          {match.team2Id ? getTeamName(match.team2Id) : "Select Team"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {match.team2Id && (
                          <SelectItem value="__clear__" className="text-destructive font-medium">
                            ✕ Clear Selection
                          </SelectItem>
                        )}
                        {getAvailableTeams(match, 'team2').map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.teamName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`truncate text-xs font-bold text-black dark:text-white`} data-testid={`text-team2-${match.matchNumber}`}>
                      {getTeamDisplay(match.team2Id, match, 'team2')}
                    </span>
                  )}
                  {match.team2Score != null && (
                    <span className={`font-bold ml-2 flex-shrink-0 text-black dark:text-white`} data-testid={`text-score2-${match.matchNumber}`}>
                      {match.team2Score}
                    </span>
                  )}
                </div>
              </div>
            </div>
      </Card>
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

  // Render only SVG connectors (match cards are rendered separately as HTML divs)
  const renderConnectors = () => {
    const elements: JSX.Element[] = [];

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

  // Render match cards as HTML divs (outside SVG)
  const renderMatchCards = () => {
    return matches.map((match) => {
      const pos = matchPositions.get(match.id);
      if (pos) {
        return renderMatchCard(match, pos.x, pos.y, match.bracketType || undefined);
      }
      return null;
    });
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

  const resetZoom = () => {
    setZoom(0.5);
  };

  // Calculate effective dimensions - ensure minimum size for scrolling
  const effectiveWidth = Math.max(svgWidth * zoom + 100, 1200);
  const effectiveHeight = Math.max(svgHeight * zoom + 100, 800);
  
  console.log('🔍 BracketView Dimensions:', { 
    svgWidth, 
    svgHeight, 
    zoom, 
    effectiveWidth, 
    effectiveHeight,
    matchCount: matches.length 
  });

  return (
    <div className="relative" style={{ overflow: 'visible' }}>
      {/* Controls - positioned at top with better visibility */}
      <div className="flex gap-2 mb-3 justify-end">
        <Button
          size="sm"
          variant="default"
          onClick={() => setZoom(prev => Math.min(prev + 0.2, 3))}
          data-testid="button-zoom-in"
        >
          <ZoomIn className="h-4 w-4 mr-1" />
          Zoom In
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.3))}
          data-testid="button-zoom-out"
        >
          <ZoomOut className="h-4 w-4 mr-1" />
          Zoom Out
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={resetZoom}
          data-testid="button-reset-view"
        >
          <Maximize2 className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>

      {/* Bracket Container - scrollable with standard scrollbars */}
      <div
        ref={containerRef}
        className="border rounded-lg bg-muted/20"
        style={{ 
          height: '70vh',
          overflowX: 'auto',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Inner container with actual bracket size */}
        <div 
          className="relative"
          style={{
            width: effectiveWidth,
            height: effectiveHeight,
            minWidth: effectiveWidth,
            minHeight: effectiveHeight
          }}
        >
          {/* SVG for connections only - pointer-events: none so clicks go through */}
          <svg
            ref={svgRef}
            className="absolute inset-0 pointer-events-none"
            style={{
              width: effectiveWidth,
              height: effectiveHeight
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
            
            {/* Connectors with zoom transform */}
            <g transform={`translate(50, 80) scale(${zoom})`}>
              {renderConnectors()}
            </g>
          </svg>

          {/* Match cards as HTML divs (positioned absolutely) */}
          {renderMatchCards()}
        </div>
      </div>

      {/* Score Modal */}
      {selectedMatchId && (
        <TournamentMatchScoreModal
          tournamentId={tournamentId}
          matchId={selectedMatchId}
          open={!!selectedMatchId}
          onOpenChange={(open) => !open && setSelectedMatchId(null)}
          isCommissioner={isCommissioner}
        />
      )}
    </div>
  );
}

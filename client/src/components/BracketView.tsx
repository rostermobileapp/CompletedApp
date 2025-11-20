import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import type { TournamentMatch, TournamentTeam } from "@shared/schema";

interface BracketViewProps {
  matches: TournamentMatch[];
  teams: TournamentTeam[];
  format: string;
}

export default function BracketView({ matches, teams, format }: BracketViewProps) {
  const [zoom, setZoom] = useState(0.5); // Start zoomed out to show full bracket
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "TBD";
    const team = teams.find(t => t.id === teamId);
    return team?.teamName || "TBD";
  };

  // Helper to get descriptive text for TBD teams
  const getTeamDisplay = (teamId: string | null, match: TournamentMatch, position: 'team1' | 'team2') => {
    if (teamId) {
      const team = teams.find(t => t.id === teamId);
      return team?.teamName || "TBD";
    }
    
    // For TBD teams, find matches that advance to this match
    const sourceMatches = matches.filter(m => m.advancesToMatchId === `match_${match.matchNumber}`);
    
    if (sourceMatches.length === 1) {
      return `Winner of Match ${sourceMatches[0].matchNumber}`;
    } else if (sourceMatches.length === 2) {
      // Two matches feed into this one (common in brackets)
      // Distinguish based on position or match numbers
      if (position === 'team1') {
        return `Winner of Match ${sourceMatches[0].matchNumber}`;
      } else {
        return `Winner of Match ${sourceMatches[1].matchNumber}`;
      }
    } else if (sourceMatches.length > 0) {
      // Multiple sources - just show first for now
      return `Winner of Match ${sourceMatches[0].matchNumber}`;
    }
    
    // Fallback to notes-based description
    if (match.notes) {
      if (match.notes.toLowerCase().includes('play-in')) {
        return "Winner of Play-In";
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
    const winnersMap: { [key: string]: TournamentMatch[] } = {};
    const losersMap: { [key: string]: TournamentMatch[] } = {};
    
    console.log('🔍 BracketView received matches:', matches.length);
    console.log('🔍 Match rounds:', matches.map(m => `${m.matchNumber}: ${m.round} (${m.bracketType})`));
    
    matches.forEach(match => {
      const roundName = match.round;
      // Use bracketType field for accurate categorization
      const isLosers = match.bracketType === 'losers';
      const targetMap = isLosers ? losersMap : winnersMap;
      
      if (!targetMap[roundName]) {
        targetMap[roundName] = [];
      }
      targetMap[roundName].push(match);
    });

    // Sort matches within each round by match number
    const sortRounds = (map: { [key: string]: TournamentMatch[] }) => {
      Object.keys(map).forEach(round => {
        map[round].sort((a, b) => a.matchNumber - b.matchNumber);
      });
    };
    
    sortRounds(winnersMap);
    sortRounds(losersMap);

    console.log('🔍 Winners rounds:', Object.keys(winnersMap));
    console.log('🔍 Losers rounds:', Object.keys(losersMap));

    // Create stable round ordering based on typical bracket progression
    const sortRoundNames = (rounds: string[]) => {
      const roundOrder = [
        'Play-In Round',
        'Round 1', 'Round 2', 'Round 3', 'Round 4',
        'Quarterfinals', 'Semifinals', 'Finals',
        'Winners Round 1', 'Winners Round 2', 'Winners Round 3', 'Winners Round 4',
        'Winners Quarterfinals', 'Winners Semifinals', 'Winners Finals',
        'Losers Round 1', 'Losers Round 2', 'Losers Round 3', 'Losers Round 4',
        'Losers Round 5', 'Losers Round 6', 'Losers Round 7', 'Losers Round 8',
        'Losers Quarterfinals', 'Losers Semifinals', 'Losers Finals',
        'Grand Finals'
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

    return {
      winners: winnersMap,
      losers: losersMap,
      winnersRounds: sortRoundNames(Object.keys(winnersMap)),
      losersRounds: sortRoundNames(Object.keys(losersMap))
    };
  };

  const { winners, losers, winnersRounds, losersRounds } = organizeMatches();
  const hasLosers = losersRounds.length > 0;

  // Calculate match positions
  const MATCH_WIDTH = 280;
  const MATCH_HEIGHT = 120;
  const ROUND_GAP = 200;
  const MATCH_GAP = 40;
  const BRACKET_VERTICAL_GAP = 50; // Space between winners and losers brackets

  const calculateMatchPosition = (roundIndex: number, matchIndex: number, totalMatches: number, isLosersBracket = false) => {
    // Universal spacing formulas with caps to prevent runaway heights
    const BASE_GAP = MATCH_HEIGHT + MATCH_GAP;
    const MAX_GAP_MULTIPLIER = 8; // Cap maximum gap to prevent excessive heights
    
    // Losers bracket: align with Round 2 of winners bracket (1 round offset)
    const losersXOffset = isLosersBracket ? (MATCH_WIDTH + ROUND_GAP) : 0;
    const x = roundIndex * (MATCH_WIDTH + ROUND_GAP) + losersXOffset;
    
    // Winners: gap = baseGap × min(2^roundIndex, MAX_GAP_MULTIPLIER)
    // Losers: gap = baseGap × min(1.5^floor(roundIndex/2), MAX_GAP_MULTIPLIER)
    let verticalGap: number;
    if (isLosersBracket) {
      const multiplier = Math.pow(1.5, Math.floor(roundIndex / 2));
      verticalGap = BASE_GAP * Math.min(multiplier, MAX_GAP_MULTIPLIER);
    } else {
      const multiplier = Math.pow(2, roundIndex);
      verticalGap = BASE_GAP * Math.min(multiplier, MAX_GAP_MULTIPLIER);
    }
    
    // Calculate winners bracket height
    const winnersHeight = Math.max(...winnersRounds.map((r, idx) => {
      const roundMatches = winners[r] || [];
      const multiplier = Math.pow(2, idx);
      const gap = BASE_GAP * Math.min(multiplier, MAX_GAP_MULTIPLIER);
      const offset = (idx > 0) ? gap / 2 : 0;
      return roundMatches.length * gap + offset;
    }));
    
    // Losers bracket positioned below winners bracket
    const startY = isLosersBracket ? winnersHeight + BRACKET_VERTICAL_GAP : 0;
    
    // Center the matches vertically with progressive spacing
    const offset = (roundIndex > 0) ? verticalGap / 2 : 0;
    const y = startY + matchIndex * verticalGap + offset;
    
    return { x, y };
  };

  const renderMatch = (match: TournamentMatch, x: number, y: number, isLosersBracket = false) => {
    const isCompleted = match.status === 'completed';
    // Only highlight if there's an actual winner (avoid null === null bug)
    const team1Wins = match.winnerId != null && match.winnerId === match.team1Id;
    const team2Wins = match.winnerId != null && match.winnerId === match.team2Id;

    // Determine bracket type for color coding
    const isGrandFinal = match.round === 'Grand Finals';
    const isPlayIn = match.round === 'Play-In Round';
    
    // Visual hierarchy with 4px borders
    // Blue for winners, Red for losers, Gold for grand finals
    let borderClass: string;
    let headerClass: string;
    let titleClass: string;
    let badgeClass: string;
    let winnerBgClass: string;
    
    if (isGrandFinal) {
      borderClass = 'border-[4px] border-yellow-500 dark:border-yellow-400';
      headerClass = 'bg-yellow-500/10';
      titleClass = 'text-yellow-600 dark:text-yellow-400';
      badgeClass = isCompleted ? 'bg-yellow-500' : 'border-yellow-500 text-yellow-600 dark:text-yellow-400';
      winnerBgClass = 'bg-yellow-500 text-white';
    } else if (isLosersBracket) {
      borderClass = 'border-[4px] border-red-500 dark:border-red-400';
      headerClass = 'bg-red-500/10';
      titleClass = 'text-red-600 dark:text-red-400';
      badgeClass = isCompleted ? 'bg-red-500' : 'border-red-500 text-red-600 dark:text-red-400';
      winnerBgClass = 'bg-red-500 text-white';
    } else {
      borderClass = 'border-[4px] border-blue-500 dark:border-blue-400';
      headerClass = 'bg-blue-500/10';
      titleClass = 'text-blue-600 dark:text-blue-400';
      badgeClass = isCompleted ? 'bg-blue-500' : 'border-blue-500 text-blue-600 dark:text-blue-400';
      winnerBgClass = 'bg-blue-500 text-white';
    }

    return (
      <g key={match.id} transform={`translate(${x}, ${y})`}>
        <foreignObject width={MATCH_WIDTH} height={MATCH_HEIGHT}>
          <Card className={`h-full shadow-lg bg-card ${borderClass}`} data-testid={`card-match-${match.matchNumber}`}>
            <CardHeader className={`p-2 ${headerClass}`}>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <CardTitle className={`text-xs font-semibold ${titleClass}`}>
                    {match.round}
                  </CardTitle>
                  <Badge
                    variant={isCompleted ? 'default' : 'outline'}
                    className={`text-xs ${badgeClass}`}
                  >
                    {match.status}
                  </Badge>
                </div>
                <div className={`text-[10px] font-medium ${titleClass} opacity-80`}>
                  Match #{match.matchNumber}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-1">
              {/* Team 1 */}
              <div
                className={`flex items-center justify-between p-2 rounded-md text-sm transition-colors ${
                  team1Wins
                    ? `${winnerBgClass} font-bold shadow-sm`
                    : 'bg-muted/50 hover:bg-muted'
                }`}
              >
                <span className="truncate text-xs" data-testid={`text-team1-${match.matchNumber}`}>
                  {getTeamDisplay(match.team1Id, match, 'team1')}
                </span>
                {match.team1Score !== null && (
                  <span className="font-bold ml-2 text-lg" data-testid={`text-score1-${match.matchNumber}`}>
                    {match.team1Score}
                  </span>
                )}
              </div>

              {/* Team 2 */}
              <div
                className={`flex items-center justify-between p-2 rounded-md text-sm transition-colors ${
                  team2Wins
                    ? `${winnerBgClass} font-bold shadow-sm`
                    : 'bg-muted/50 hover:bg-muted'
                }`}
              >
                <span className="truncate text-xs" data-testid={`text-team2-${match.matchNumber}`}>
                  {getTeamDisplay(match.team2Id, match, 'team2')}
                </span>
                {match.team2Score !== null && (
                  <span className="font-bold ml-2 text-lg" data-testid={`text-score2-${match.matchNumber}`}>
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

  const renderConnector = (fromX: number, fromY: number, toX: number, toY: number, fromBottom = false, isLoserPath = false) => {
    const startX = fromX + MATCH_WIDTH;
    const startY = fromY + (fromBottom ? MATCH_HEIGHT : MATCH_HEIGHT / 2);
    const endX = toX;
    const endY = toY + MATCH_HEIGHT / 2;
    
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
    const matchPositions = new Map<string, { x: number; y: number }>();

    // Render Winners Bracket
    winnersRounds.forEach((roundName, roundIndex) => {
      const roundMatches = winners[roundName] || [];
      
      roundMatches.forEach((match, matchIndex) => {
        const { x, y } = calculateMatchPosition(roundIndex, matchIndex, roundMatches.length, false);
        matchPositions.set(match.id, { x, y });
        elements.push(renderMatch(match, x, y, false));
      });

      // Add round label
      const labelX = roundIndex * (MATCH_WIDTH + ROUND_GAP);
      elements.push(
        <g key={`label-w-${roundName}`} transform={`translate(${labelX}, ${-40})`}>
          <foreignObject width={MATCH_WIDTH} height={30}>
            <div className="font-bold text-sm text-primary bg-primary/10 border border-primary/30 px-3 py-1 rounded-md">
              {roundName}
            </div>
          </foreignObject>
        </g>
      );
    });

    // Render Losers Bracket
    if (hasLosers) {
      const losersXOffset = (winnersRounds.length) * (MATCH_WIDTH + ROUND_GAP) + ROUND_GAP;
      const winnersHeight = Math.max(400, ...winnersRounds.map((r, idx) => {
        const roundMatches = winners[r] || [];
        const verticalSpacing = MATCH_HEIGHT + MATCH_GAP;
        const offset = (idx > 0) ? verticalSpacing * Math.pow(2, idx - 1) / 2 : 0;
        return roundMatches.length * verticalSpacing * Math.pow(2, idx) + offset;
      }));

      // Add "Losers Bracket" label
      elements.push(
        <g key="losers-title" transform={`translate(${losersXOffset}, ${winnersHeight + 20})`}>
          <foreignObject width={200} height={30}>
            <div className="font-bold text-base text-destructive">
              Losers Bracket
            </div>
          </foreignObject>
        </g>
      );

      losersRounds.forEach((roundName, roundIndex) => {
        const roundMatches = losers[roundName] || [];
        
        roundMatches.forEach((match, matchIndex) => {
          const { x, y } = calculateMatchPosition(roundIndex, matchIndex, roundMatches.length, true);
          matchPositions.set(match.id, { x, y });
          elements.push(renderMatch(match, x, y, true));
        });

        // Add round label
        const labelX = losersXOffset + roundIndex * (MATCH_WIDTH + ROUND_GAP);
        const labelY = winnersHeight + 60;
        elements.push(
          <g key={`label-l-${roundName}`} transform={`translate(${labelX}, ${labelY})`}>
            <foreignObject width={MATCH_WIDTH} height={30}>
              <div className="font-bold text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-1 rounded-md">
                {roundName}
              </div>
            </foreignObject>
          </g>
        );
      });
    }

    // Draw connectors based on advancesToMatchId
    matches.forEach(match => {
      const fromPos = matchPositions.get(match.id);
      if (!fromPos) return;

      if (match.advancesToMatchId) {
        const toPos = matchPositions.get(match.advancesToMatchId);
        if (toPos) {
          // Determine if this is a losers bracket connection by checking the notes
          const isLosersConnection = match.notes?.toLowerCase().includes('loser') || false;
          
          elements.push(
            <g key={`connector-${match.id}`}>
              {renderConnector(fromPos.x, fromPos.y, toPos.x, toPos.y, isLosersConnection, isLosersConnection)}
            </g>
          );
        }
      }
    });

    return elements;
  };

  // Calculate SVG dimensions based on bracket size (vertical stacking layout)
  const calculateDimensions = () => {
    // Width: Max of winners rounds or (losers rounds + 1 offset for alignment)
    const winnersWidth = winnersRounds.length * (MATCH_WIDTH + ROUND_GAP) + ROUND_GAP;
    const losersWidth = hasLosers ? (losersRounds.length * (MATCH_WIDTH + ROUND_GAP) + ROUND_GAP + (MATCH_WIDTH + ROUND_GAP)) : 0;
    const width = Math.max(winnersWidth, losersWidth) + 200;
    
    const BASE_GAP = MATCH_HEIGHT + MATCH_GAP;
    const MAX_GAP_MULTIPLIER = 8; // Same cap as in calculateMatchPosition
    
    const winnersHeight = Math.max(400, ...winnersRounds.map((r, idx) => {
      const roundMatches = winners[r] || [];
      const multiplier = Math.pow(2, idx);
      const gap = BASE_GAP * Math.min(multiplier, MAX_GAP_MULTIPLIER);
      const offset = (idx > 0) ? gap / 2 : 0;
      return roundMatches.length * gap + offset + MATCH_HEIGHT;
    }));
    
    const losersHeight = hasLosers ? Math.max(400, ...losersRounds.map((r, idx) => {
      const roundMatches = losers[r] || [];
      const multiplier = Math.pow(1.5, Math.floor(idx / 2));
      const gap = BASE_GAP * Math.min(multiplier, MAX_GAP_MULTIPLIER);
      const offset = (idx > 0) ? gap / 2 : 0;
      return roundMatches.length * gap + offset + MATCH_HEIGHT;
    })) : 0;
    
    // Vertical stacking: height is SUM of both brackets
    const height = winnersHeight + losersHeight + (hasLosers ? BRACKET_VERTICAL_GAP + 200 : 200);
    
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

  return (
    <div className="relative">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
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

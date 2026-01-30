import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, ZoomIn, ZoomOut, Grid3x3, Move, Save, Download, Check } from "lucide-react";
import dragIconPath from "@/assets/drag-icon.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { nanoid } from "nanoid";

interface TournamentTeam {
  id: string;
  teamName: string;
}

const GRID_SIZE = 100;
const CARD_WIDTH = 280;
const CARD_HEIGHT = 140;

type MatchupType = 'standard' | 'losers';

interface Matchup {
  id: string;
  type: MatchupType;
  position: { x: number; y: number };
  gameNumber: string;
  team1: string;
  team2: string;
  score1: number | null;
  score2: number | null;
  winner: 'team1' | 'team2' | null;
  winnerDestination: string | 'final' | null;
  loserDestination: string | 'eliminated' | null;
  scheduledTime?: string | null;
}

interface Connection {
  id: string;
  source: string;
  destination: string;
  type: 'winner' | 'loser';
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function formatScheduledTime(scheduledTime: string | null | undefined): string | null {
  if (!scheduledTime) return null;
  try {
    const date = new Date(scheduledTime);
    if (isNaN(date.getTime())) return null;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${month}/${day}    ${displayHours}:${displayMinutes}${ampm}`;
  } catch {
    return null;
  }
}

function calculateConnectionPath(
  sourceMatchup: Matchup,
  destMatchup: Matchup,
  type: 'winner' | 'loser'
): string {
  const sourceX = sourceMatchup.position.x + CARD_WIDTH;
  const sourceY = sourceMatchup.position.y + (type === 'winner' ? CARD_HEIGHT / 3 : (2 * CARD_HEIGHT) / 3);
  
  const destX = destMatchup.position.x;
  const destY = destMatchup.position.y + CARD_HEIGHT / 2;

  const controlPoint1X = sourceX + (destX - sourceX) * 0.5;
  const controlPoint1Y = sourceY;
  const controlPoint2X = sourceX + (destX - sourceX) * 0.5;
  const controlPoint2Y = destY;

  return `M ${sourceX} ${sourceY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${destX} ${destY}`;
}

interface TournamentMatch {
  id: string;
  matchNumber: number;
  round: string;
  team1Id: string | null;
  team2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  status: string | null;
  advancesToMatchId?: string | null;
  scheduledTime?: string | null;
}

interface CustomBracketBuilderProps {
  teams?: TournamentTeam[];
  tournamentId?: string;
  tournament?: any;
  onGenerateMatches?: () => void;
  embeddable?: boolean;
  locked?: boolean;
  onSave?: (data: any) => void;
  onLock?: () => void;
  initialMatches?: TournamentMatch[];
}

// Convert existing tournament matches to matchup format for editing
function convertMatchesToMatchups(matches: TournamentMatch[], teams: TournamentTeam[]): { matchups: Matchup[], connections: Connection[] } {
  const teamMap = new Map(teams.map(t => [t.id, t.teamName]));
  const matchMap = new Map(matches.map(m => [m.id, m]));
  
  // Build reverse lookup: which matches feed into which match slots
  // Key: destinationMatchId, Value: { sourceMatchId, type: 'winner' | 'loser', slot: 'team1' | 'team2' }
  const feedsInto = new Map<string, { sourceMatchId: string; type: 'winner' | 'loser'; slot: 'team1' | 'team2' }[]>();
  
  // For each match, if it has advancesToMatchId, the winner feeds into that match
  matches.forEach(m => {
    if (m.advancesToMatchId) {
      const existing = feedsInto.get(m.advancesToMatchId) || [];
      // Determine which slot (team1 or team2) this feeds into
      // We'll assign slots based on order of feeding matches
      const slot = existing.length === 0 ? 'team1' : 'team2';
      existing.push({ sourceMatchId: m.id, type: 'winner', slot });
      feedsInto.set(m.advancesToMatchId, existing);
    }
  });
  
  // Group matches by round for positioning
  const roundGroups = new Map<string, TournamentMatch[]>();
  matches.forEach(m => {
    const existing = roundGroups.get(m.round) || [];
    existing.push(m);
    roundGroups.set(m.round, existing);
  });
  
  const rounds = Array.from(roundGroups.keys());
  const matchups: Matchup[] = [];
  const connections: Connection[] = [];
  
  let roundX = 100;
  rounds.forEach((round, roundIndex) => {
    const roundMatches = roundGroups.get(round) || [];
    roundMatches.forEach((match, matchIndex) => {
      const isLosers = round.toLowerCase().includes('loser');
      
      // Get feeding matches for this match
      const feedingMatches = feedsInto.get(match.id) || [];
      const team1Feed = feedingMatches.find(f => f.slot === 'team1');
      const team2Feed = feedingMatches.find(f => f.slot === 'team2');
      
      // Determine team values
      // Priority: 1) Assigned team, 2) Winner/Loser reference, 3) Empty
      let team1Value = '';
      let team2Value = '';
      
      if (match.team1Id) {
        // Actual team assigned
        team1Value = teamMap.get(match.team1Id) || match.team1Id;
      } else if (team1Feed) {
        // Routing from another match - use game number format that CustomBracketBuilder expects
        const sourceMatch = matchMap.get(team1Feed.sourceMatchId);
        if (sourceMatch) {
          team1Value = `${team1Feed.type}:Game ${sourceMatch.matchNumber}`;
        }
      }
      
      if (match.team2Id) {
        // Actual team assigned
        team2Value = teamMap.get(match.team2Id) || match.team2Id;
      } else if (team2Feed) {
        // Routing from another match - use game number format that CustomBracketBuilder expects
        const sourceMatch = matchMap.get(team2Feed.sourceMatchId);
        if (sourceMatch) {
          team2Value = `${team2Feed.type}:Game ${sourceMatch.matchNumber}`;
        }
      }
      
      const matchup: Matchup = {
        id: match.id,
        type: isLosers ? 'losers' : 'standard',
        position: { 
          x: roundX + (roundIndex * 350), 
          y: 100 + (matchIndex * 180) 
        },
        gameNumber: `Game ${match.matchNumber}`,
        team1: team1Value,
        team2: team2Value,
        score1: match.team1Score,
        score2: match.team2Score,
        winner: match.team1Score !== null && match.team2Score !== null 
          ? (match.team1Score > match.team2Score ? 'team1' : 'team2') 
          : null,
        winnerDestination: null,
        loserDestination: null
      };
      
      matchups.push(matchup);
      
      // Create connections for advancement
      if (match.advancesToMatchId) {
        connections.push({
          id: nanoid(),
          source: match.id,
          destination: match.advancesToMatchId,
          type: 'winner'
        });
      }
    });
  });
  
  return { matchups, connections };
}

export function CustomBracketBuilder({ 
  teams = [], 
  tournamentId, 
  tournament, 
  onGenerateMatches,
  embeddable = false,
  locked = false,
  onSave,
  onLock,
  initialMatches
}: CustomBracketBuilderProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [draggingMatchup, setDraggingMatchup] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const addMatchup = (type: MatchupType) => {
    const centerX = -pan.x / zoom + 400;
    const centerY = -pan.y / zoom + 300;
    
    const newMatchup: Matchup = {
      id: nanoid(),
      type,
      position: { 
        x: snapToGrid(centerX), 
        y: snapToGrid(centerY) 
      },
      gameNumber: `Game ${matchups.length + 1}`,
      team1: '',
      team2: '',
      score1: null,
      score2: null,
      winner: null,
      winnerDestination: null,
      loserDestination: null
    };
    
    setMatchups([...matchups, newMatchup]);
    toast({
      title: "Matchup added",
      description: `${type === 'standard' ? 'Standard' : 'Losers'} matchup card created`
    });
  };

  const deleteMatchup = (id: string) => {
    setMatchups(matchups.filter(m => m.id !== id));
    setConnections(connections.filter(c => c.source !== id && c.destination !== id));
    toast({
      title: "Matchup deleted",
      description: "Matchup and its connections removed"
    });
  };

  const updateMatchup = (id: string, updates: Partial<Matchup>) => {
    setMatchups(matchups.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleDragHandleMouseDown = (e: React.MouseEvent, matchupId: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    const matchup = matchups.find(m => m.id === matchupId);
    if (!matchup) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const canvasX = (e.clientX - rect.left - pan.x) / zoom;
    const canvasY = (e.clientY - rect.top - pan.y) / zoom;

    setDraggingMatchup(matchupId);
    setDragOffset({
      x: canvasX - matchup.position.x,
      y: canvasY - matchup.position.y
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    if (!draggingMatchup) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const canvasX = (e.clientX - rect.left - pan.x) / zoom;
    const canvasY = (e.clientY - rect.top - pan.y) / zoom;

    const newX = snapToGrid(canvasX - dragOffset.x);
    const newY = snapToGrid(canvasY - dragOffset.y);

    updateMatchup(draggingMatchup, { position: { x: newX, y: newY } });
  };

  const handleMouseUp = () => {
    setDraggingMatchup(null);
    setIsPanning(false);
  };

  const handleZoomIn = () => setZoom(Math.min(zoom * 1.2, 3));
  const handleZoomOut = () => setZoom(Math.max(zoom * 0.8, 0.3));

  const setWinnerDestination = (matchupId: string, destination: string | null) => {
    const matchup = matchups.find(m => m.id === matchupId);
    if (!matchup) return;

    // Remove old connection
    setConnections(connections.filter(c => c.source !== matchupId || c.type !== 'winner'));

    updateMatchup(matchupId, { winnerDestination: destination });

    // Add new connection if destination is another matchup
    if (destination && destination !== 'final') {
      setConnections([...connections, {
        id: nanoid(),
        source: matchupId,
        destination,
        type: 'winner'
      }]);
    }
  };

  const setLoserDestination = (matchupId: string, destination: string | null) => {
    const matchup = matchups.find(m => m.id === matchupId);
    if (!matchup) return;

    // Remove old connection
    setConnections(connections.filter(c => c.source !== matchupId || c.type !== 'loser'));

    updateMatchup(matchupId, { loserDestination: destination });

    // Add new connection if destination is another matchup
    if (destination && destination !== 'eliminated') {
      setConnections([...connections, {
        id: nanoid(),
        source: matchupId,
        destination,
        type: 'loser'
      }]);
    }
  };

  const saveBracket = async () => {
    const bracketData = {
      matchups,
      connections,
      zoom,
      pan
    };
    localStorage.setItem('customBracket', JSON.stringify(bracketData));
    
    if (onSave) {
      setIsSaving(true);
      try {
        // Parent will add locked: true when saving
        await onSave(bracketData);
        
        // Only lock if save succeeded
        if (onLock) {
          onLock();
        }
      } catch (error) {
        // Error is already shown by parent's toast, keep bracket unlocked
        console.error('Failed to save bracket:', error);
      } finally {
        setIsSaving(false);
      }
    } else if (!embeddable) {
      toast({
        title: "Bracket saved",
        description: "Your custom bracket has been saved"
      });
    }
  };

  const loadBracket = () => {
    const saved = localStorage.getItem('customBracket');
    if (saved) {
      const data = JSON.parse(saved);
      setMatchups(data.matchups || []);
      setConnections(data.connections || []);
      setZoom(data.zoom || 1);
      setPan(data.pan || { x: 0, y: 0 });
      toast({
        title: "Bracket loaded",
        description: "Your saved bracket has been restored"
      });
    }
  };

  const handleGenerateMatches = async () => {
    if (!tournamentId) {
      toast({
        title: "Error",
        description: "Tournament ID not found",
        variant: "destructive"
      });
      return;
    }

    if (matchups.length === 0) {
      toast({
        title: "Error",
        description: "No matchups to generate. Add matchups first.",
        variant: "destructive"
      });
      return;
    }

    // Validate all matchups have teams assigned (including winner references like "winner:Game 1")
    const invalidMatchups = matchups.filter(m => {
      const team1Missing = !m.team1 || m.team1 === 'unassigned';
      const team2Missing = !m.team2 || m.team2 === 'unassigned';
      return team1Missing || team2Missing;
    });
    if (invalidMatchups.length > 0) {
      toast({
        title: "Incomplete Matchups",
        description: `${invalidMatchups.length} matchup(s) don't have both teams assigned. Please assign teams to all matchups.`,
        variant: "destructive"
      });
      return;
    }

    try {
      setIsGenerating(true);
      
      // Save bracket structure to tournament settings
      const bracketData = {
        matchups,
        connections,
        zoom,
        pan
      };

      const response = await apiRequest('POST', `/api/tournaments/${tournamentId}/generate-custom-matches`, { bracketData });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate matches');
      }

      toast({
        title: "Matches Generated!",
        description: "Your custom bracket has been converted to tournament matches"
      });

      // Keep bracket in localStorage for quick access (it's also saved to backend)

      // Call callback if provided
      if (onGenerateMatches) {
        onGenerateMatches();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate matches",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    // Priority 1: For custom brackets, use settings JSON but merge in scores from initialMatches
    if (tournament?.settings?.customBracket) {
      const data = tournament.settings.customBracket;
      if (data.matchups && data.matchups.length > 0) {
        // Merge scores and scheduled times from initialMatches (from DB) into settings matchups
        // Scores and times are stored in tournament_matches table, not in settings JSON
        // Match by ID since custom bracket match IDs equal the matchup IDs
        const matchupsWithScores = data.matchups.map((matchup: Matchup) => {
          const dbMatch = initialMatches?.find(m => m.id === matchup.id);
          if (dbMatch) {
            return {
              ...matchup,
              score1: dbMatch.team1Score,
              score2: dbMatch.team2Score,
              scheduledTime: dbMatch.scheduledTime,
              winner: dbMatch.team1Score !== null && dbMatch.team2Score !== null
                ? (dbMatch.team1Score > dbMatch.team2Score ? 'team1' : 'team2')
                : matchup.winner
            };
          }
          return matchup;
        });
        setMatchups(matchupsWithScores);
        setConnections(data.connections || []);
        setZoom(data.zoom || 1);
        setPan(data.pan || { x: 0, y: 0 });
        // Also sync to localStorage for offline editing
        localStorage.setItem('customBracket', JSON.stringify(data));
        return;
      }
    }

    // Priority 2: For non-custom brackets, convert initialMatches to matchups
    if (initialMatches && initialMatches.length > 0 && !tournament?.settings?.customBracket) {
      const { matchups: converted, connections: convertedConnections } = convertMatchesToMatchups(initialMatches, teams);
      setMatchups(converted);
      setConnections(convertedConnections);
      return;
    }

    // Priority 3: Fall back to localStorage if no tournament settings
    const saved = localStorage.getItem('customBracket');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.matchups && data.matchups.length > 0) {
        setMatchups(data.matchups);
        setConnections(data.connections || []);
        setZoom(data.zoom || 1);
        setPan(data.pan || { x: 0, y: 0 });
      }
    }
  }, [tournament, initialMatches, teams]);

  const containerClass = embeddable ? "flex flex-col bg-background w-full" : "h-screen flex flex-col bg-background";

  return (
    <div className={containerClass}>
      {/* Zoom controls - always visible (even when locked) */}
      <div className="border-b bg-card p-3 flex items-center gap-3">
        <Button
          onClick={handleZoomIn}
          variant="default"
          size="sm"
          className="gap-2"
          data-testid="button-zoom-in"
        >
          <ZoomIn className="h-4 w-4" />
          Zoom In
        </Button>
        <Button
          onClick={handleZoomOut}
          variant="default"
          size="sm"
          className="gap-2"
          data-testid="button-zoom-out"
        >
          <ZoomOut className="h-4 w-4" />
          Zoom Out
        </Button>
        <span className="text-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
        
        {/* Additional editing controls - only when not locked */}
        {!locked && (
          <>
            <div className="h-6 w-px bg-border" />
            <Button
              onClick={() => addMatchup('standard')}
              variant="default"
              className="gap-2"
              data-testid="button-add-matchup"
            >
              <Plus className="h-4 w-4" />
              Matchup
            </Button>
            <Button
              onClick={() => addMatchup('losers')}
              variant="destructive"
              className="gap-2"
              data-testid="button-add-losers-matchup"
            >
              <Plus className="h-4 w-4" />
              Losers Matchup
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              onClick={() => setShowGrid(!showGrid)}
              variant={showGrid ? "default" : "outline"}
              size="icon"
              data-testid="button-toggle-grid"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            {!embeddable && (
              <>
                <div className="h-6 w-px bg-border" />
                <Button
                  onClick={saveBracket}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  onClick={loadBracket}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-load"
                >
                  <Download className="h-4 w-4" />
                  Load
                </Button>
              </>
            )}
            <div className="h-6 w-px bg-border" />
            <Button
              onClick={embeddable ? saveBracket : handleGenerateMatches}
              variant="default"
              className="gap-2"
              data-testid={embeddable ? "button-save-lock" : "button-generate-matches"}
              disabled={matchups.length === 0 || isGenerating || isSaving}
            >
              <Check className="h-4 w-4" />
              {embeddable 
                ? (isSaving ? "Saving..." : "Save & Lock Bracket")
                : (isGenerating ? "Generating..." : "Generate Matches")
              }
            </Button>
            <div className="ml-auto text-sm text-muted-foreground">
              {matchups.length} matchup{matchups.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>

      {/* Canvas - use scrollbars when locked, drag-to-pan when editing */}
      <div
        ref={canvasRef}
        className={`flex-1 relative ${locked ? 'overflow-auto cursor-default' : 'overflow-hidden cursor-move'}`}
        onMouseDown={locked ? undefined : handleCanvasMouseDown}
        onMouseMove={locked ? undefined : handleMouseMove}
        onMouseUp={locked ? undefined : handleMouseUp}
        onMouseLeave={locked ? undefined : handleMouseUp}
        data-testid="canvas"
        style={embeddable ? { minHeight: '70vh' } : undefined}
      >
        {/* Inner content wrapper - needs explicit dimensions for scrolling when locked */}
        <div
          className="relative"
          style={{
            width: locked 
              ? Math.max(1200, ...matchups.map(m => (m.position.x + CARD_WIDTH) * zoom + 100))
              : '100%',
            height: locked
              ? Math.max(800, ...matchups.map(m => (m.position.y + CARD_HEIGHT) * zoom + 100))
              : '100%',
            minWidth: locked ? '100%' : undefined,
            minHeight: locked ? '100%' : undefined
          }}
        >
        {/* Grid Background */}
        {showGrid && (
          <div
            className="absolute inset-0 canvas-bg"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(128, 128, 128, 0.1) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(128, 128, 128, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`
            }}
          />
        )}

        {/* SVG for connections */}
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{
            width: '100%',
            height: '100%'
          }}
        >
          {connections.map(conn => {
            const sourceMatchup = matchups.find(m => m.id === conn.source);
            const destMatchup = matchups.find(m => m.id === conn.destination);
            
            if (!sourceMatchup || !destMatchup) return null;

            const path = calculateConnectionPath(sourceMatchup, destMatchup, conn.type);
            
            return (
              <g key={conn.id}>
                <path
                  d={path}
                  stroke={conn.type === 'winner' ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                  strokeWidth={3 / zoom}
                  fill="none"
                  strokeDasharray={conn.type === 'loser' ? '5,5' : 'none'}
                  transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                  markerEnd={`url(#arrow-${conn.type})`}
                />
              </g>
            );
          })}
          {/* Arrow markers */}
          <defs>
            <marker
              id="arrow-winner"
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
              id="arrow-loser"
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
        </svg>

        {/* Matchup Cards */}
        {matchups.map(matchup => (
          <Card
            key={matchup.id}
            className={`absolute ${matchup.type === 'losers' ? 'border-destructive' : 'border-[#32CD32]'} ${draggingMatchup === matchup.id ? 'opacity-50' : ''}`}
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              left: matchup.position.x * zoom + pan.x,
              top: matchup.position.y * zoom + pan.y,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              borderWidth: '4px'
            }}
            data-testid={`matchup-card-${matchup.id}`}
          >
            <div className="h-full p-3 flex flex-col gap-2">
              {/* Header */}
              <div className="flex items-center justify-between gap-1">
                {/* Drag Handle - only way to drag the card */}
                {!locked && (
                  <div
                    className="cursor-grab active:cursor-grabbing flex-shrink-0 p-1 hover:bg-muted rounded"
                    onMouseDown={(e) => handleDragHandleMouseDown(e, matchup.id)}
                    data-testid={`drag-handle-${matchup.id}`}
                  >
                    <img 
                      src={dragIconPath} 
                      alt="Drag" 
                      className="h-5 w-5 pointer-events-none dark:invert" 
                    />
                  </div>
                )}
                <Input
                  value={matchup.gameNumber}
                  onChange={(e) => updateMatchup(matchup.id, { gameNumber: e.target.value })}
                  className="h-6 text-xs font-bold flex-1"
                  placeholder="Game #"
                  disabled={locked}
                  data-testid={`input-game-number-${matchup.id}`}
                />
                {matchup.scheduledTime && formatScheduledTime(matchup.scheduledTime) && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatScheduledTime(matchup.scheduledTime)}
                  </span>
                )}
                {!locked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMatchup(matchup.id);
                    }}
                    data-testid={`button-delete-${matchup.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Teams */}
              <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Select
                    value={matchup.team1 || 'unassigned'}
                    onValueChange={(value) => updateMatchup(matchup.id, { team1: value === 'unassigned' ? '' : value })}
                    disabled={locked}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1" data-testid={`select-team1-${matchup.id}`}>
                      <SelectValue placeholder="Select Team 1" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {teams.map(team => (
                        <SelectItem key={team.id} value={team.teamName}>
                          {team.teamName}
                        </SelectItem>
                      ))}
                      {matchups.filter(m => m.id !== matchup.id).map(m => (
                        <SelectItem key={`winner-${m.id}`} value={`winner:${m.gameNumber}`}>
                          Winner of {m.gameNumber}
                        </SelectItem>
                      ))}
                      {matchups.filter(m => m.id !== matchup.id).map(m => (
                        <SelectItem key={`loser-${m.id}`} value={`loser:${m.gameNumber}`}>
                          Loser of {m.gameNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {matchup.score1 != null && (
                    <span className={`font-bold text-sm flex-shrink-0 ${matchup.winner === 'team1' ? 'text-green-500' : ''}`}>
                      {matchup.score1}
                    </span>
                  )}
                </div>
                <div className="text-center text-xs text-muted-foreground">vs</div>
                <div className="flex items-center gap-2">
                  <Select
                    value={matchup.team2 || 'unassigned'}
                    onValueChange={(value) => updateMatchup(matchup.id, { team2: value === 'unassigned' ? '' : value })}
                    disabled={locked}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1" data-testid={`select-team2-${matchup.id}`}>
                      <SelectValue placeholder="Select Team 2" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {teams.map(team => (
                        <SelectItem key={team.id} value={team.teamName}>
                          {team.teamName}
                        </SelectItem>
                      ))}
                      {matchups.filter(m => m.id !== matchup.id).map(m => (
                        <SelectItem key={`winner-${m.id}`} value={`winner:${m.gameNumber}`}>
                          Winner of {m.gameNumber}
                        </SelectItem>
                      ))}
                      {matchups.filter(m => m.id !== matchup.id).map(m => (
                        <SelectItem key={`loser-${m.id}`} value={`loser:${m.gameNumber}`}>
                          Loser of {m.gameNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {matchup.score2 != null && (
                    <span className={`font-bold text-sm flex-shrink-0 ${matchup.winner === 'team2' ? 'text-green-500' : ''}`}>
                      {matchup.score2}
                    </span>
                  )}
                </div>
              </div>

              {/* Routing Controls */}
              {!locked && (
                <div className="flex gap-2 text-xs">
                  <Select
                    value={matchup.winnerDestination || 'unassigned'}
                    onValueChange={(value) => setWinnerDestination(matchup.id, value === 'unassigned' ? null : value)}
                  >
                    <SelectTrigger className="h-6 text-xs flex-1 bg-[#32CD32]" style={{ color: '#000000' }} data-testid={`select-winner-dest-${matchup.id}`}>
                      <span className="text-black">
                        {matchup.winnerDestination === 'final' 
                          ? 'Championship' 
                          : matchup.winnerDestination && matchups.find(m => m.id === matchup.winnerDestination)
                            ? matchups.find(m => m.id === matchup.winnerDestination)?.gameNumber
                            : 'Moves to'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Moves to</SelectItem>
                      <SelectItem value="final">Championship</SelectItem>
                      {matchups.filter(m => m.id !== matchup.id).map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.gameNumber || m.id.substring(0, 6)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select
                    value={matchup.loserDestination || 'unassigned'}
                    onValueChange={(value) => setLoserDestination(matchup.id, value === 'unassigned' ? null : value)}
                  >
                    <SelectTrigger className="h-6 text-xs flex-1 bg-[#c92e2f]" style={{ color: '#ffffff' }} data-testid={`select-loser-dest-${matchup.id}`}>
                      <span className="text-white">
                        {matchup.loserDestination === 'eliminated' 
                          ? 'Eliminated' 
                          : matchup.loserDestination && matchups.find(m => m.id === matchup.loserDestination)
                            ? matchups.find(m => m.id === matchup.loserDestination)?.gameNumber
                            : 'Moves to'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Moves to</SelectItem>
                      <SelectItem value="eliminated">Eliminated</SelectItem>
                      {matchups.filter(m => m.id !== matchup.id).map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.gameNumber || m.id.substring(0, 6)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </Card>
        ))}
        </div>
      </div>
    </div>
  );
}

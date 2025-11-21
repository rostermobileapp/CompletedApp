import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, ZoomIn, ZoomOut, Grid3x3, Move, Save, Download, Check } from "lucide-react";
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

interface CustomBracketBuilderProps {
  teams?: TournamentTeam[];
  tournamentId?: string;
  tournament?: any;
  onGenerateMatches?: () => void;
  embeddable?: boolean;
  locked?: boolean;
  onSave?: (data: any) => void;
  onLock?: () => void;
}

export function CustomBracketBuilder({ 
  teams = [], 
  tournamentId, 
  tournament, 
  onGenerateMatches,
  embeddable = false,
  locked = false,
  onSave,
  onLock
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

  const handleMouseDown = (e: React.MouseEvent, matchupId: string) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || 
        (e.target as HTMLElement).tagName === 'SELECT' ||
        (e.target as HTMLElement).tagName === 'BUTTON') {
      return;
    }

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

  const saveBracket = () => {
    const bracketData = {
      matchups,
      connections,
      zoom,
      pan,
      locked: false
    };
    localStorage.setItem('customBracket', JSON.stringify(bracketData));
    
    if (onSave) {
      onSave(bracketData);
    }
    
    if (onLock) {
      onLock();
    }
    
    toast({
      title: "Bracket saved",
      description: embeddable ? "Bracket locked. Click Edit to make changes." : "Your custom bracket has been saved"
    });
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
    // Load bracket from tournament settings first (source of truth), then fall back to localStorage
    if (tournament?.settings?.customBracket) {
      const data = tournament.settings.customBracket;
      if (data.matchups && data.matchups.length > 0) {
        setMatchups(data.matchups);
        setConnections(data.connections || []);
        setZoom(data.zoom || 1);
        setPan(data.pan || { x: 0, y: 0 });
        // Also sync to localStorage for offline editing
        localStorage.setItem('customBracket', JSON.stringify(data));
        return;
      }
    }

    // Fall back to localStorage if no tournament settings
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
  }, [tournament]);

  const containerClass = embeddable ? "flex flex-col bg-background" : "h-screen flex flex-col bg-background";

  return (
    <div className={containerClass}>
      {/* Toolbar - hidden when locked in embeddable mode */}
      {!locked && (
        <div className="border-b bg-card p-4 flex items-center gap-4 flex-wrap">
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
            onClick={handleZoomIn}
            variant="outline"
            size="icon"
            data-testid="button-zoom-in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleZoomOut}
            variant="outline"
            size="icon"
            data-testid="button-zoom-out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
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
            disabled={matchups.length === 0 || isGenerating}
          >
            <Check className="h-4 w-4" />
            {embeddable ? "Save & Lock Bracket" : (isGenerating ? "Generating..." : "Generate Matches")}
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">
            {matchups.length} matchup{matchups.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className={`flex-1 overflow-hidden relative ${locked ? 'cursor-default' : 'cursor-move'}`}
        onMouseDown={locked ? undefined : handleCanvasMouseDown}
        onMouseMove={locked ? undefined : handleMouseMove}
        onMouseUp={locked ? undefined : handleMouseUp}
        onMouseLeave={locked ? undefined : handleMouseUp}
        data-testid="canvas"
        style={embeddable ? { minHeight: '500px' } : undefined}
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
            className={`absolute ${locked ? 'cursor-default' : 'cursor-move'} ${matchup.type === 'losers' ? 'border-destructive' : 'border-primary'} ${draggingMatchup === matchup.id ? 'opacity-50' : ''}`}
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              left: matchup.position.x * zoom + pan.x,
              top: matchup.position.y * zoom + pan.y,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              borderWidth: '4px'
            }}
            onMouseDown={locked ? undefined : (e) => handleMouseDown(e, matchup.id)}
            data-testid={`matchup-card-${matchup.id}`}
          >
            <div className="h-full p-3 flex flex-col gap-2">
              {/* Header */}
              <div className="flex items-center justify-between">
                <Input
                  value={matchup.gameNumber}
                  onChange={(e) => updateMatchup(matchup.id, { gameNumber: e.target.value })}
                  className="h-6 text-xs font-bold flex-1"
                  placeholder="Game #"
                  disabled={locked}
                  data-testid={`input-game-number-${matchup.id}`}
                />
                {!locked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
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
                <Select
                  value={matchup.team1 || 'unassigned'}
                  onValueChange={(value) => updateMatchup(matchup.id, { team1: value === 'unassigned' ? '' : value })}
                  disabled={locked}
                >
                  <SelectTrigger className="h-7 text-xs" data-testid={`select-team1-${matchup.id}`}>
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
                  </SelectContent>
                </Select>
                <div className="text-center text-xs text-muted-foreground">vs</div>
                <Select
                  value={matchup.team2 || 'unassigned'}
                  onValueChange={(value) => updateMatchup(matchup.id, { team2: value === 'unassigned' ? '' : value })}
                  disabled={locked}
                >
                  <SelectTrigger className="h-7 text-xs" data-testid={`select-team2-${matchup.id}`}>
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
                  </SelectContent>
                </Select>
              </div>

              {/* Routing Controls */}
              {!locked && (
                <div className="flex gap-2 text-xs">
                  <Select
                    value={matchup.winnerDestination || 'unassigned'}
                    onValueChange={(value) => setWinnerDestination(matchup.id, value === 'unassigned' ? null : value)}
                  >
                    <SelectTrigger className="h-6 text-xs flex-1" data-testid={`select-winner-dest-${matchup.id}`}>
                      <SelectValue placeholder="Winner →" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
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
                    <SelectTrigger className="h-6 text-xs flex-1" data-testid={`select-loser-dest-${matchup.id}`}>
                      <SelectValue placeholder="Loser →" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
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
  );
}

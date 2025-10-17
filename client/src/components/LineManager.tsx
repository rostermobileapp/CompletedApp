import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Users, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface LineManagerProps {
  teamId: string;
  isTeamCaptain: boolean;
  teamMembers: any[];
}

interface LinePosition {
  id: string;
  position: string;
  playerId?: string;
  player?: any;
}

interface LineCombination {
  id: string;
  name: string;
  lineType: 'forward' | 'defense';
  gameId?: string;
  assignments: LinePosition[];
}

const FORWARD_POSITIONS = ['LW', 'C', 'RW'];
const DEFENSE_POSITIONS = ['LD', 'RD'];

export function LineManager({ teamId, isTeamCaptain, teamMembers }: LineManagerProps) {
  const { toast } = useToast();
  const [draggedPlayer, setDraggedPlayer] = useState<any>(null);
  const [draggedAssignment, setDraggedAssignment] = useState<any>(null);
  const [selectedGame, setSelectedGame] = useState<string>('default');

  // Fetch line combinations for the team
  const { data: lineCombinations = [], isLoading } = useQuery({
    queryKey: ['/api/teams', teamId, 'line-combinations', selectedGame],
    queryFn: async () => {
      const url = selectedGame === 'default' 
        ? `/api/teams/${teamId}/line-combinations`
        : `/api/teams/${teamId}/line-combinations?gameId=${selectedGame}`;
      const response = await apiRequest('GET', url);
      return response.json();
    },
    enabled: !!teamId,
  });

  // Fetch upcoming games for this team
  const { data: upcomingGames = [] } = useQuery({
    queryKey: ['/api/teams', teamId, 'games/upcoming'],
    enabled: !!teamId,
  }) as { data: any[] };

  // Create line combination mutation
  const createLineCombinationMutation = useMutation({
    mutationFn: async (data: { name: string; lineType: 'forward' | 'defense'; lineNumber: number; gameId?: string }) => {
      const payload = selectedGame === 'default' ? { ...data, gameId: undefined } : { ...data, gameId: selectedGame };
      return apiRequest('POST', `/api/teams/${teamId}/line-combinations`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'line-combinations'] });
      toast({ title: "Success", description: "Line combination created successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create line combination.", variant: "destructive" });
    },
  });

  // Create assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: { lineCombinationId: string; playerId: string; position: string }) => {
      return apiRequest('POST', `/api/line-combinations/${data.lineCombinationId}/assignments`, {
        playerId: data.playerId,
        position: data.position,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'line-combinations'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign player.", variant: "destructive" });
    },
  });

  // Update assignment mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: { assignmentId: string; playerId?: string; position?: string }) => {
      if (data.position) {
        return apiRequest('PATCH', `/api/line-assignments/${data.assignmentId}/position`, {
          position: data.position,
        });
      } else {
        return apiRequest('PATCH', `/api/line-assignments/${data.assignmentId}`, {
          playerId: data.playerId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'line-combinations'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update assignment.", variant: "destructive" });
    },
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest('DELETE', `/api/line-assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'line-combinations'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove player.", variant: "destructive" });
    },
  });

  // Delete line combination mutation
  const deleteLineCombinationMutation = useMutation({
    mutationFn: async (lineCombinationId: string) => {
      return apiRequest('DELETE', `/api/line-combinations/${lineCombinationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'line-combinations'] });
      toast({ title: "Success", description: "Line combination deleted successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete line combination.", variant: "destructive" });
    },
  });

  const handleCreateLine = (lineType: 'forward' | 'defense') => {
    if (!isTeamCaptain) return;
    
    const forwardLines = lineCombinations.filter((line: LineCombination) => line.lineType === 'forward');
    const defenseLines = lineCombinations.filter((line: LineCombination) => line.lineType === 'defense');
    
    let lineName: string;
    let lineNumber: number;
    if (lineType === 'forward') {
      lineNumber = forwardLines.length + 1;
      lineName = `Forward Line ${lineNumber}`;
    } else {
      lineNumber = defenseLines.length + 1;
      lineName = `Defense Line ${lineNumber}`;
    }

    createLineCombinationMutation.mutate({
      name: lineName,
      lineType,
      lineNumber,
      gameId: selectedGame === 'default' ? undefined : selectedGame,
    });
  };

  const handleDragStart = (e: React.DragEvent, player?: any, assignment?: any) => {
    if (player) {
      setDraggedPlayer(player);
      e.dataTransfer.setData('text/plain', 'player');
    } else if (assignment) {
      setDraggedAssignment(assignment);
      e.dataTransfer.setData('text/plain', 'assignment');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, lineCombination: LineCombination, position: string) => {
    e.preventDefault();
    if (!isTeamCaptain) return;

    const dataType = e.dataTransfer.getData('text/plain');
    
    if (dataType === 'player' && draggedPlayer) {
      // Check if position is already filled
      const existingAssignment = lineCombination.assignments.find(a => a.position === position);
      
      if (existingAssignment && existingAssignment.playerId) {
        toast({ 
          title: "Position Occupied", 
          description: "This position is already filled. Please remove the current player first.",
          variant: "destructive" 
        });
        return;
      }

      if (existingAssignment) {
        // Update existing assignment
        updateAssignmentMutation.mutate({
          assignmentId: existingAssignment.id,
          playerId: draggedPlayer.user?.id || draggedPlayer.userId,
        });
      } else {
        // Create new assignment
        createAssignmentMutation.mutate({
          lineCombinationId: lineCombination.id,
          playerId: draggedPlayer.user?.id || draggedPlayer.userId,
          position,
        });
      }
    } else if (dataType === 'assignment' && draggedAssignment) {
      // Moving a player from one position to another
      const existingAssignment = lineCombination.assignments.find(a => a.position === position && a.id !== draggedAssignment.id);
      
      if (existingAssignment && existingAssignment.playerId) {
        toast({ 
          title: "Position Occupied", 
          description: "This position is already filled. Please remove the current player first.",
          variant: "destructive" 
        });
        return;
      }

      updateAssignmentMutation.mutate({
        assignmentId: draggedAssignment.id,
        position,
      });
    }

    setDraggedPlayer(null);
    setDraggedAssignment(null);
  };

  const handleRemovePlayer = (assignmentId: string) => {
    if (!isTeamCaptain) return;
    deleteAssignmentMutation.mutate(assignmentId);
  };

  const handleDeleteLine = (lineCombinationId: string) => {
    if (!isTeamCaptain) return;
    deleteLineCombinationMutation.mutate(lineCombinationId);
  };

  const renderPosition = (lineCombination: LineCombination, position: string) => {
    const assignment = lineCombination.assignments.find(a => a.position === position);
    const player = assignment?.player;

    return (
      <div
        key={position}
        className="relative border-2 border-dashed rounded-lg p-4 min-h-[80px] flex flex-col items-center justify-center transition-colors hover:border-primary/50 pt-[2px] pb-[2px] pl-[2px] pr-[2px]"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, lineCombination, position)}
        data-testid={`position-${lineCombination.id}-${position}`}
      >
        <div className="text-xs font-medium text-muted-foreground mb-1">{position}</div>
        {player ? (
          <div 
            className={`flex flex-col items-center gap-1 ${isTeamCaptain ? 'cursor-move' : ''}`}
            draggable={isTeamCaptain}
            onDragStart={(e) => handleDragStart(e, undefined, assignment)}
            data-testid={`player-${player.id}-in-${position}`}
          >
            <div className="text-sm text-center font-medium truncate max-w-full">
              {player.lastName}
            </div>
            {isTeamCaptain && (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => handleRemovePlayer(assignment.id)}
                data-testid={`button-remove-${assignment.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center">
            {isTeamCaptain ? 'Drop player here' : 'Empty'}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Line Combinations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading line combinations...</div>
        </CardContent>
      </Card>
    );
  }

  const forwardLines = lineCombinations.filter((line: LineCombination) => line.lineType === 'forward');
  const defenseLines = lineCombinations.filter((line: LineCombination) => line.lineType === 'defense');

  return (
    <Card>
      <CardHeader className="flex flex-col space-y-1.5 p-6 pl-[0px] pr-[0px] pt-[2px] pb-[2px]">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Line Combinations
          {isTeamCaptain && (
            <Badge variant="secondary" className="ml-2">Captain</Badge>
          )}
        </CardTitle>
        
        {/* Game Selection */}
        <div className="flex items-center gap-4">
          <Select value={selectedGame} onValueChange={setSelectedGame}>
            <SelectTrigger className="w-48" data-testid="select-game">
              <SelectValue placeholder="Select game" />
            </SelectTrigger>
            <SelectContent>
              {upcomingGames.map((game: any) => (
                <SelectItem key={game.id} value={game.id}>
                  vs {game.homeTeamId === teamId ? game.awayTeam?.name : game.homeTeam?.name} - {new Date(game.scheduledAt).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6 pt-[2px] pb-[2px]">
        {/* Available Players */}
        {isTeamCaptain && (
          <div>
            <h4 className="font-medium mb-3">Available Players</h4>
            <div className="flex flex-wrap gap-2">
              {teamMembers
                .filter((member: any) => {
                  const isAssigned = lineCombinations.some((line: LineCombination) =>
                    line.assignments.some(a => a.playerId === (member.user?.id || member.userId))
                  );
                  return !isAssigned; // Only show unassigned players
                })
                .map((member: any) => (
                  <div
                    key={member.user?.id || member.userId}
                    className="flex items-center gap-2 p-2 border rounded-lg cursor-move hover:bg-accent"
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, member)}
                    data-testid={`player-${member.user?.id || member.userId}`}
                  >
                    <span className="text-sm font-medium">
                      {member.user?.lastName}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* Forward Lines */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">Forward Lines</h4>
            {isTeamCaptain && forwardLines.length < 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCreateLine('forward')}
                data-testid="button-add-forward-line"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Forward Line
              </Button>
            )}
          </div>
          
          <div className="space-y-4">
            {forwardLines.length === 0 && isTeamCaptain && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No forward lines created yet.</p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => handleCreateLine('forward')}
                  data-testid="button-create-first-forward-line"
                >
                  Create First Forward Line
                </Button>
              </div>
            )}
            
            {forwardLines.map((line: LineCombination) => (
              <Card key={line.id} className="p-4 pt-[2px] pb-[2px]">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-medium" data-testid={`text-line-name-${line.id}`}>{line.name}</h5>
                  {isTeamCaptain && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteLine(line.id)}
                      data-testid={`button-delete-line-${line.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {FORWARD_POSITIONS.map(position => renderPosition(line, position))}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Defense Lines */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">Defense Lines</h4>
            {isTeamCaptain && defenseLines.length < 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCreateLine('defense')}
                data-testid="button-add-defense-line"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Defense Line
              </Button>
            )}
          </div>
          
          <div className="space-y-4">
            {defenseLines.length === 0 && isTeamCaptain && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No defense lines created yet.</p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => handleCreateLine('defense')}
                  data-testid="button-create-first-defense-line"
                >
                  Create First Defense Line
                </Button>
              </div>
            )}
            
            {defenseLines.map((line: LineCombination) => (
              <Card key={line.id} className="p-4 pt-[2px] pb-[2px]">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-medium" data-testid={`text-line-name-${line.id}`}>{line.name}</h5>
                  {isTeamCaptain && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteLine(line.id)}
                      data-testid={`button-delete-line-${line.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {DEFENSE_POSITIONS.map(position => renderPosition(line, position))}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {!isTeamCaptain && lineCombinations.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No line combinations have been set up yet.</p>
            <p className="text-sm">Ask your team captain to create line combinations.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
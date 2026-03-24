import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Pizza,
  Coffee,
  UtensilsCrossed,
  Cookie,
  IceCream,
  Beer,
  Wine,
  CupSoda,
  Milk,
  Wrench,
  Clipboard,
  Package,
  ShoppingBag,
  Camera,
  Heart,
  Star,
  Trophy,
  Smile,
  ThumbsUp,
  Flag,
  Music,
  LucideIcon,
} from 'lucide-react';
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';
import { useState } from 'react';
import AddDutyModal from './AddDutyModal';
import EditDutyModal from './EditDutyModal';

const ICON_MAP: Record<string, LucideIcon> = {
  Pizza,
  Coffee,
  UtensilsCrossed,
  Cookie,
  IceCream,
  Beer,
  Wine,
  CupSoda,
  Milk,
  Wrench,
  Clipboard,
  Package,
  ShoppingBag,
  Camera,
  Heart,
  Star,
  Trophy,
  Smile,
  ThumbsUp,
  Flag,
  Music,
};

interface DutiesSectionProps {
  gameId: string;
  teamId: string;
  userId: string;
  isCaptain: boolean;
  isTeamMember: boolean;
}

export default function DutiesSection({ gameId, teamId, userId, isCaptain, isTeamMember }: DutiesSectionProps) {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDuty, setEditingDuty] = useState<any>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingDuty, setDeletingDuty] = useState<any>(null);

  const { data: dutyTemplates = [] } = useQuery({
    queryKey: ['/api/games', gameId, 'teams', teamId, 'duties'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/games/${gameId}/teams/${teamId}/duties`);
      return response.json();
    },
  });

  const { data: dutyAssignments = [] } = useQuery({
    queryKey: ['/api/games', gameId, 'duties'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/games/${gameId}/duties`);
      return response.json();
    },
  });

  const claimDutyMutation = useMutation({
    mutationFn: async ({ dutyTemplateId }: { dutyTemplateId: string }) => {
      const response = await apiRequest('POST', `/api/games/${gameId}/duties/${dutyTemplateId}/claim`, {
        teamId,
      });
      return response.json();
    },
    onSuccess: (newAssignment: any) => {
      const template = dutyTemplates.find((t: any) => t.id === newAssignment.dutyTemplateId);
      const enriched = { ...newAssignment, dutyTemplate: template };

      queryClient.setQueryData(
        ['/api/games', gameId, 'duties'],
        (old: any) => {
          const arr = Array.isArray(old) ? old : [];
          const filtered = arr.filter((a: any) => a.dutyTemplateId !== newAssignment.dutyTemplateId);
          return [...filtered, enriched];
        }
      );

      queryClient.setQueriesData(
        {
          predicate: (query) => {
            const key = query.queryKey as unknown[];
            return Array.isArray(key) && key[0] === '/api/duty-assignments';
          },
        },
        (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((gameData: any) => {
            if (gameData.gameId !== gameId) return gameData;
            const filtered = (gameData.assignments || []).filter(
              (a: any) => a.dutyTemplateId !== newAssignment.dutyTemplateId
            );
            return { ...gameData, assignments: [...filtered, enriched] };
          });
        }
      );

      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'duties'] });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey as unknown[];
          return Array.isArray(key) && key[0] === '/api/duty-assignments';
        },
      });

      toast({
        title: 'Success',
        description: 'Duty claimed successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to claim duty',
        variant: 'destructive',
      });
    },
  });

  const releaseDutyMutation = useMutation({
    mutationFn: async ({ dutyTemplateId }: { dutyTemplateId: string }) => {
      const response = await apiRequest('POST', `/api/games/${gameId}/duties/${dutyTemplateId}/release`, {
        teamId,
      });
      return response.json();
    },
    onSuccess: (_: any, { dutyTemplateId }: { dutyTemplateId: string }) => {
      queryClient.setQueryData(
        ['/api/games', gameId, 'duties'],
        (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.filter((a: any) => a.dutyTemplateId !== dutyTemplateId);
        }
      );

      queryClient.setQueriesData(
        {
          predicate: (query) => {
            const key = query.queryKey as unknown[];
            return Array.isArray(key) && key[0] === '/api/duty-assignments';
          },
        },
        (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((gameData: any) => {
            if (gameData.gameId !== gameId) return gameData;
            return {
              ...gameData,
              assignments: (gameData.assignments || []).filter(
                (a: any) => a.dutyTemplateId !== dutyTemplateId
              ),
            };
          });
        }
      );

      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'duties'] });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey as unknown[];
          return Array.isArray(key) && key[0] === '/api/duty-assignments';
        },
      });

      toast({
        title: 'Success',
        description: 'Duty released successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to release duty',
        variant: 'destructive',
      });
    },
  });

  const deleteFromGameMutation = useMutation({
    mutationFn: async ({ dutyTemplateId }: { dutyTemplateId: string }) => {
      const response = await apiRequest('DELETE', `/api/games/${gameId}/duties/${dutyTemplateId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'duties'] });
      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'teams', teamId, 'duties'] });
      toast({
        title: 'Success',
        description: 'Duty removed from this game',
      });
      setShowDeleteDialog(false);
      setDeletingDuty(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete duty',
        variant: 'destructive',
      });
    },
  });

  const deleteFromAllGamesMutation = useMutation({
    mutationFn: async ({ dutyTemplateId }: { dutyTemplateId: string }) => {
      const response = await apiRequest('DELETE', `/api/duties/${dutyTemplateId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'duties'] });
      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'teams', teamId, 'duties'] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && 
                 key[0] === '/api/games' && 
                 key[2] === 'teams' && 
                 key[3] === teamId && 
                 key[4] === 'duties';
        }
      });
      toast({
        title: 'Success',
        description: 'Duty deleted from all games',
      });
      setShowDeleteDialog(false);
      setDeletingDuty(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete duty',
        variant: 'destructive',
      });
    },
  });

  const getAssignment = (dutyTemplateId: string, template: any) => {
    // Match by duty template ID and the template's actual team ID (handles tournament team -> regular team mapping)
    // The template.teamId is always the regular team ID since the backend resolves tournament teams
    return dutyAssignments.find((a: any) => a.dutyTemplateId === dutyTemplateId && a.teamId === template.teamId);
  };

  const handleEdit = (template: any) => {
    setEditingDuty(template);
    setShowEditModal(true);
  };

  const handleDeleteClick = (template: any) => {
    setDeletingDuty(template);
    setShowDeleteDialog(true);
  };

  const renderIcon = (template: any) => {
    // Check if template has a custom icon (Lucide icon)
    const Icon = ICON_MAP[template.icon];
    if (Icon) {
      return <Icon className="w-6 h-6" />;
    }
    
    // Fallback to beverage jar for default duties that haven't been edited
    if (template.isDefault) {
      return (
        <img
          src={beverageJarUrl}
          alt={template.name}
          className="h-6 w-auto invert dark:invert-0"
          style={{ aspectRatio: '9/16' }}
        />
      );
    }

    return null;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Duties</h3>
        {isCaptain && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddModal(true)}
            data-testid="button-add-duty"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {dutyTemplates.map((template: any) => {
          const assignment = getAssignment(template.id, template);
          const isClaimed = !!assignment;
          const isClaimedByMe = assignment?.userId === userId;

          return (
            <div
              key={template.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
              data-testid={`duty-${template.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8">
                  {renderIcon(template)}
                </div>
                <div>
                  <p className="font-medium">{template.name}</p>
                  {isClaimed && (
                    <p className="text-sm text-muted-foreground">
                      {isClaimedByMe
                        ? 'You claimed this'
                        : `Claimed by ${assignment.user?.firstName} ${assignment.user?.lastName}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Captain edit/delete buttons */}
                {isCaptain && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(template)}
                      data-testid={`button-edit-duty-${template.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteClick(template)}
                      className="text-destructive hover:text-destructive"
                      data-testid={`button-delete-duty-${template.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}

                {/* Team member claim/release buttons */}
                {isTeamMember && (
                  <>
                    {isClaimedByMe ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => releaseDutyMutation.mutate({ dutyTemplateId: template.id })}
                        disabled={releaseDutyMutation.isPending}
                        data-testid={`button-release-duty-${template.id}`}
                      >
                        Release
                      </Button>
                    ) : !isClaimed ? (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => claimDutyMutation.mutate({ dutyTemplateId: template.id })}
                        disabled={claimDutyMutation.isPending}
                        data-testid={`button-claim-duty-${template.id}`}
                      >
                        Claim
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Duty Modal */}
      <AddDutyModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} teamId={teamId} />

      {/* Edit Duty Modal */}
      {editingDuty && (
        <EditDutyModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingDuty(null);
          }}
          teamId={teamId}
          duty={editingDuty}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-duty">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Duty</AlertDialogTitle>
            <AlertDialogDescription>
              How would you like to delete "{deletingDuty?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-col gap-2">
            <AlertDialogAction
              onClick={() => deleteFromGameMutation.mutate({ dutyTemplateId: deletingDuty?.id })}
              disabled={deleteFromGameMutation.isPending}
              className="w-full"
              data-testid="button-delete-from-game"
            >
              {deleteFromGameMutation.isPending ? 'Deleting...' : 'Delete from This Game Only'}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => deleteFromAllGamesMutation.mutate({ dutyTemplateId: deletingDuty?.id })}
              disabled={deleteFromAllGamesMutation.isPending}
              className="w-full bg-destructive hover:bg-destructive/90"
              data-testid="button-delete-from-all-games"
            >
              {deleteFromAllGamesMutation.isPending ? 'Deleting...' : 'Delete from All Games'}
            </AlertDialogAction>
            <AlertDialogCancel className="w-full" data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

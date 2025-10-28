import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
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
}

export default function DutiesSection({ gameId, teamId, userId, isCaptain }: DutiesSectionProps) {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'duties'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/games', gameId, 'duties'] });
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

  const getAssignment = (dutyTemplateId: string) => {
    return dutyAssignments.find((a: any) => a.dutyTemplateId === dutyTemplateId && a.teamId === teamId);
  };

  const renderIcon = (template: any) => {
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

    const Icon = ICON_MAP[template.icon];
    if (!Icon) return null;
    return <Icon className="w-6 h-6" />;
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
          const assignment = getAssignment(template.id);
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
            </div>
          );
        })}
      </div>

      <AddDutyModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} teamId={teamId} />
    </div>
  );
}

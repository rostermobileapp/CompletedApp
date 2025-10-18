import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, BookMarked, Plus, Trash2, Edit2, Users, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function InviteGroups() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

  // Fetch invite groups
  const { data: inviteGroups = [], isLoading } = useQuery({
    queryKey: ['/api/invite-groups'],
  });

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const response = await apiRequest('POST', '/api/invite-groups', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Group Created',
        description: 'Your invite group has been created successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invite-groups'] });
      setIsCreateDialogOpen(false);
      setGroupName('');
      setGroupDescription('');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create invite group.',
        variant: 'destructive',
      });
    },
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const response = await apiRequest('DELETE', `/api/invite-groups/${groupId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Group Deleted',
        description: 'The invite group has been deleted successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invite-groups'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete invite group.',
        variant: 'destructive',
      });
    },
  });

  const handleCreateGroup = () => {
    if (!groupName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Group name is required.',
        variant: 'destructive',
      });
      return;
    }

    createGroupMutation.mutate({
      name: groupName,
      description: groupDescription || undefined,
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    if (confirm('Are you sure you want to delete this invite group?')) {
      deleteGroupMutation.mutate(groupId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="invite-groups-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/');
            }}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Invite Groups</h1>
          <BookMarked className="w-6 h-6 text-primary" />
        </div>
        <p className="text-muted-foreground mb-6">
          Create and manage groups of members for quick invites
        </p>

        {/* Create Group Button */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" data-testid="button-create-group">
              <Plus className="w-4 h-4 mr-2" />
              Create New Group
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-create-group">
            <DialogHeader>
              <DialogTitle>Create Invite Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="group-name">Group Name</Label>
                <Input
                  id="group-name"
                  placeholder="e.g., Regular Players"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  data-testid="input-group-name"
                />
              </div>
              <div>
                <Label htmlFor="group-description">Description (Optional)</Label>
                <Textarea
                  id="group-description"
                  placeholder="Add a description for this group..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  data-testid="input-group-description"
                />
              </div>
              <Button
                onClick={handleCreateGroup}
                disabled={createGroupMutation.isPending}
                className="w-full"
                data-testid="button-save-group"
              >
                {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Groups List */}
      <div className="px-6 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (inviteGroups as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookMarked className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No invite groups yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first group to quickly invite the same people to scrimmages
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(inviteGroups as any[]).map((group: any) => (
              <Card key={group.id} data-testid={`card-group-${group.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg" data-testid={`text-group-name-${group.id}`}>
                        {group.name}
                      </CardTitle>
                      {group.description && (
                        <CardDescription className="mt-1">
                          {group.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/invite-groups/${group.id}`)}
                        data-testid={`button-edit-group-${group.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteGroup(group.id)}
                        disabled={deleteGroupMutation.isPending}
                        data-testid={`button-delete-group-${group.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Created {new Date(group.createdAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

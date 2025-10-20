import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, UserPlus, Mail, Search, X, Users } from 'lucide-react';

const inviteGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
});

type InviteGroupForm = z.infer<typeof inviteGroupSchema>;

export default function EditInviteGroup() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/invite-groups/:id');
  const groupId = params?.id;
  const isEditing = !!groupId;
  const { toast } = useToast();

  // State for member selection
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  
  // Email invite states
  const [emailSearchTerm, setEmailSearchTerm] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  // Fetch user's leagues for member selection
  const { data: userLeagues = [] } = useQuery({
    queryKey: ['/api/user/leagues'],
  });

  // Use first league (same logic as CreateScrimmage)
  const selectedLeague = (userLeagues as any[])?.[0];

  // Fetch league members
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: [`/api/leagues/${selectedLeague?.id}/members-for-scrimmage`],
    enabled: !!selectedLeague?.id,
  });

  // Fetch existing group data if editing
  const { data: existingGroup, isLoading: groupLoading } = useQuery({
    queryKey: ['/api/invite-groups', groupId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/invite-groups/${groupId}`);
      return response.json();
    },
    enabled: isEditing,
  });

  // Fetch existing group members if editing
  const { data: existingMembers = [] } = useQuery({
    queryKey: ['/api/invite-groups', groupId, 'members'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/invite-groups/${groupId}/members`);
      return response.json();
    },
    enabled: isEditing,
  });

  // Email search
  const { data: emailSearchResults = [], isLoading: emailSearchLoading } = useQuery({
    queryKey: ['/api/users/search', emailSearchTerm],
    queryFn: async () => {
      if (!emailSearchTerm || emailSearchTerm.length < 3) return [];
      const response = await apiRequest('GET', `/api/users/search?email=${encodeURIComponent(emailSearchTerm)}`);
      return response.json();
    },
    enabled: emailSearchTerm.length >= 3,
  });

  const form = useForm<InviteGroupForm>({
    resolver: zodResolver(inviteGroupSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // Populate form and selections when editing
  useEffect(() => {
    if (existingGroup) {
      form.reset({
        name: existingGroup.name,
        description: existingGroup.description || '',
      });
    }
  }, [existingGroup, form]);

  useEffect(() => {
    if (existingMembers.length > 0) {
      const userIds = existingMembers
        .filter((m: any) => m.userId)
        .map((m: any) => m.userId);
      const emails = existingMembers
        .filter((m: any) => m.email && !m.userId)
        .map((m: any) => m.email);
      
      setSelectedMemberIds(userIds);
      setSelectedEmails(emails);
    }
  }, [existingMembers]);

  // Filter members by search term
  const filteredMembers = (members as any[]).filter((member: any) => {
    if (!searchTerm) return true;
    const fullName = `${member.user.firstName} ${member.user.lastName}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase());
  });

  const toggleMemberSelection = (userId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const selectAllMembers = () => {
    setSelectedMemberIds(filteredMembers.map((m: any) => m.user.id));
  };

  const deselectAllMembers = () => {
    setSelectedMemberIds([]);
  };

  const addEmailInvite = (email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    if (selectedEmails.includes(trimmedEmail)) {
      toast({
        title: 'Email already added',
        variant: 'destructive',
      });
      return;
    }

    setSelectedEmails([...selectedEmails, trimmedEmail]);
    setManualEmail('');
    setEmailSearchTerm('');
  };

  const removeEmailInvite = (email: string) => {
    setSelectedEmails(selectedEmails.filter(e => e !== email));
  };

  const createOrUpdateMutation = useMutation({
    mutationFn: async (data: InviteGroupForm) => {
      if (isEditing) {
        // Update group info
        await apiRequest('PATCH', `/api/invite-groups/${groupId}`, data);
        
        // Update members
        const members = [
          ...selectedMemberIds.map(userId => ({ userId, email: null })),
          ...selectedEmails.map(email => ({ userId: null, email })),
        ];
        
        await apiRequest('POST', `/api/invite-groups/${groupId}/members`, { members });
        
        return { id: groupId };
      } else {
        // Create new group
        const response = await apiRequest('POST', '/api/invite-groups', {
          ...data,
          leagueId: selectedLeague?.id || null,
        });
        const group = await response.json();
        
        // Add members
        if (selectedMemberIds.length > 0 || selectedEmails.length > 0) {
          const members = [
            ...selectedMemberIds.map(userId => ({ userId, email: null })),
            ...selectedEmails.map(email => ({ userId: null, email })),
          ];
          
          await apiRequest('POST', `/api/invite-groups/${group.id}/members`, { members });
        }
        
        return group;
      }
    },
    onSuccess: () => {
      toast({
        title: isEditing ? 'Group updated' : 'Group created',
        description: isEditing 
          ? 'Your invite group has been updated successfully'
          : 'Your invite group has been created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invite-groups'] });
      navigate('/invite-groups');
    },
    onError: (error: any) => {
      toast({
        title: isEditing ? 'Failed to update group' : 'Failed to create group',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: InviteGroupForm) => {
    if (selectedMemberIds.length === 0 && selectedEmails.length === 0) {
      toast({
        title: 'No members selected',
        description: 'Please add at least one member to the group',
        variant: 'destructive',
      });
      return;
    }
    
    createOrUpdateMutation.mutate(data);
  };

  if (isEditing && groupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading group...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-24">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/invite-groups')}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold">
            {isEditing ? 'Edit Invite Group' : 'Create Invite Group'}
          </h1>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 space-y-6">
        {/* Group Info */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Group Information
          </h3>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Group Name *</Label>
              <Input
                id="name"
                {...form.register('name')}
                placeholder="e.g., Regular Players, Friday Night Crew"
                data-testid="input-group-name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                {...form.register('description')}
                placeholder="Add notes about this group..."
                data-testid="input-group-description"
              />
            </div>
          </div>
        </div>

        {/* Add Members */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Add Members to Group
          </h3>

          {/* League Members Section */}
          <div className="mb-6">
            <Label>Select from League Members</Label>
            
            {!selectedLeague ? (
              <div className="mt-2 p-4 bg-muted/30 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground">
                  You need to be an approved member of a league to select league members. 
                  You can still add people by email below.
                </p>
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="relative mt-2 mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-members"
                  />
                </div>

                {/* Selected count and bulk actions */}
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground" data-testid="text-selected-count">
                    {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectAllMembers}
                      disabled={filteredMembers.length === 0}
                      data-testid="button-select-all"
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={deselectAllMembers}
                      disabled={selectedMemberIds.length === 0}
                      data-testid="button-deselect-all"
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>

                {/* Member list */}
                <ScrollArea className="h-64 border border-border rounded-lg">
                  {membersLoading ? (
                    <div className="space-y-3 p-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                          <div className="w-10 h-10 bg-muted rounded-full"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                            <div className="h-3 bg-muted rounded w-1/2"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchTerm ? 'No members found' : 'No league members available'}
                    </div>
                  ) : (
                    <div className="space-y-1 p-2">
                      {filteredMembers.map((member: any) => (
                        <div
                          key={member.user.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50"
                          data-testid={`member-item-${member.user.id}`}
                        >
                          <Checkbox
                            checked={selectedMemberIds.includes(member.user.id)}
                            onCheckedChange={() => toggleMemberSelection(member.user.id)}
                            data-testid={`checkbox-member-${member.user.id}`}
                          />
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={member.user.profileImageUrl || undefined} />
                            <AvatarFallback>
                              {member.user.firstName?.[0]}{member.user.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium" data-testid={`text-member-name-${member.user.id}`}>
                              {member.user.firstName} {member.user.lastName}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </div>

          {/* Email Invites Section */}
          <div className="mt-6 border-t border-border pt-6">
            <Label className="text-base mb-3 block">
              <Mail className="inline-block w-4 h-4 mr-2" />
              Add by Email
            </Label>
            <p className="text-sm text-muted-foreground mb-4">
              Add users who aren't in your league yet
            </p>

            {/* Email Search */}
            <div className="mb-4">
              <Label htmlFor="email-search" className="text-sm">Search by email</Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email-search"
                  type="email"
                  placeholder="Search existing users..."
                  value={emailSearchTerm}
                  onChange={(e) => setEmailSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-email"
                />
              </div>
              
              {/* Email Search Results */}
              {emailSearchTerm.length > 2 && (
                <div className="mt-2 border border-border rounded-md max-h-32 overflow-y-auto">
                  {emailSearchLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                  ) : (emailSearchResults as any[]).length > 0 ? (
                    (emailSearchResults as any[]).map((user: any) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => addEmailInvite(user.email)}
                        className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left"
                        data-testid={`button-add-email-${user.email}`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {user.firstName?.[0]}{user.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">No users found</div>
                  )}
                </div>
              )}
            </div>

            {/* Manual Email Entry */}
            <div className="mb-4">
              <Label htmlFor="manual-email" className="text-sm">Or enter email manually</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="manual-email"
                  type="email"
                  placeholder="user@example.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (manualEmail.trim()) {
                        addEmailInvite(manualEmail);
                      }
                    }
                  }}
                  data-testid="input-manual-email"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addEmailInvite(manualEmail)}
                  disabled={!manualEmail.trim()}
                  data-testid="button-add-manual-email"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Selected Emails Display */}
            {selectedEmails.length > 0 && (
              <div>
                <Label className="text-sm mb-2 block">
                  Email Invites ({selectedEmails.length})
                </Label>
                <div className="flex flex-wrap gap-2">
                  {selectedEmails.map((email) => (
                    <div
                      key={email}
                      className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm"
                      data-testid={`badge-email-${email}`}
                    >
                      <Mail className="w-3 h-3" />
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={() => removeEmailInvite(email)}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                        data-testid={`button-remove-email-${email}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-muted/30 rounded-lg p-4 border border-border">
          <p className="text-sm text-muted-foreground">
            <strong>Total members:</strong> {selectedMemberIds.length + selectedEmails.length}
            {' '}({selectedMemberIds.length} from league, {selectedEmails.length} by email)
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/invite-groups')}
            className="flex-1"
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={createOrUpdateMutation.isPending}
            data-testid="button-save-group"
          >
            {createOrUpdateMutation.isPending 
              ? (isEditing ? 'Updating...' : 'Creating...') 
              : (isEditing ? 'Update Group' : 'Create Group')}
          </Button>
        </div>
      </form>
    </div>
  );
}

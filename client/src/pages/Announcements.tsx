import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { 
  Megaphone, 
  Plus, 
  Heart, 
  ThumbsUp, 
  Laugh, 
  Frown, 
  Angry, 
  Meh,
  MessageCircle,
  BarChart3,
  Pin,
  MoreHorizontal,
  Calendar,
  Clock,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// Types
type AnnouncementReaction = {
  id: string;
  emoji: string;
  userId: string;
  user: {
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
  };
};


type AnnouncementPoll = {
  id: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  expiresAt?: string;
  votes: {
    userId: string;
    optionIndex: number;
  }[];
};

type Announcement = {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
  };
  reactions: AnnouncementReaction[];
  poll?: AnnouncementPoll;
};

// Emoji reactions available
const REACTION_EMOJIS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '😡', label: 'Angry' }
];

// Character limit for announcements
const CHAR_LIMIT = 280;

function CreateAnnouncementModal({ 
  isOpen, 
  onClose, 
  leagueId, 
  isCommissioner 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  leagueId: string;
  isCommissioner: boolean;
}) {
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const { toast } = useToast();

  const createAnnouncementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/announcements`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'announcements'] });
      toast({ title: 'Announcement created successfully!' });
      onClose();
      resetForm();
    },
    onError: () => {
      toast({ title: 'Failed to create announcement', variant: 'destructive' });
    }
  });

  const resetForm = () => {
    setContent('');
    setIsPinned(false);
    setShowPollCreator(false);
    setPollQuestion('');
    setPollOptions(['', '']);
    setAllowMultiple(false);
  };


  const handleSubmit = () => {
    if (!content.trim()) return;

    const announcementData: any = {
      content: content.trim(),
      isPinned,
attachments: []
    };

    if (showPollCreator && pollQuestion.trim() && pollOptions.some(opt => opt.trim())) {
      announcementData.poll = {
        question: pollQuestion.trim(),
        options: pollOptions.filter(opt => opt.trim()),
        allowMultiple
      };
    }

    createAnnouncementMutation.mutate(announcementData);
  };

  const addPollOption = () => {
    if (pollOptions.length < 6) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  if (!isCommissioner) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            Create Announcement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Content Input */}
          <div>
            <Label>Message</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, CHAR_LIMIT))}
              placeholder="What would you like to announce?"
              className="min-h-24 resize-none"
              data-testid="input-announcement-content"
            />
            <div className="flex justify-between items-center mt-1">
              <span className={`text-sm ${content.length > CHAR_LIMIT * 0.8 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {content.length}/{CHAR_LIMIT}
              </span>
            </div>
          </div>

          {/* Pin Option */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pin-announcement"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              data-testid="checkbox-pin-announcement"
            />
            <Label htmlFor="pin-announcement" className="flex items-center gap-1">
              <Pin className="w-4 h-4" />
              Pin this announcement
            </Label>
          </div>

          {/* Poll Creator Toggle */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={showPollCreator ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPollCreator(!showPollCreator)}
              data-testid="button-toggle-poll"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              {showPollCreator ? 'Remove Poll' : 'Add Poll'}
            </Button>
          </div>

          {/* Poll Creator */}
          {showPollCreator && (
            <Card>
              <CardHeader>
                <h4 className="font-medium">Create Poll</h4>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Poll Question</Label>
                  <Input
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    data-testid="input-poll-question"
                  />
                </div>

                <div>
                  <Label>Options</Label>
                  <div className="space-y-2">
                    {pollOptions.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={option}
                          onChange={(e) => updatePollOption(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                          data-testid={`input-poll-option-${index}`}
                        />
                        {pollOptions.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removePollOption(index)}
                            data-testid={`button-remove-option-${index}`}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {pollOptions.length < 6 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addPollOption}
                      className="mt-2"
                      data-testid="button-add-poll-option"
                    >
                      + Add option
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allow-multiple"
                    checked={allowMultiple}
                    onChange={(e) => setAllowMultiple(e.target.checked)}
                    data-testid="checkbox-allow-multiple"
                  />
                  <Label htmlFor="allow-multiple">Allow multiple selections</Label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              data-testid="button-cancel-announcement"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!content.trim() || createAnnouncementMutation.isPending}
              data-testid="button-create-announcement"
            >
              {createAnnouncementMutation.isPending ? 'Creating...' : 'Post Announcement'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnnouncementCard({ 
  announcement, 
  leagueId, 
  currentUserId, 
  isCommissioner 
}: { 
  announcement: Announcement;
  leagueId: string;
  currentUserId: string;
  isCommissioner: boolean;
}) {
  const { toast } = useToast();

  // Group reactions by emoji
  const reactionCounts = announcement.reactions.reduce((acc, reaction) => {
    acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const userReactions = announcement.reactions
    .filter(r => r.userId === currentUserId)
    .map(r => r.emoji);

  const toggleReactionMutation = useMutation({
    mutationFn: async ({ emoji, isRemoving }: { emoji: string; isRemoving: boolean }) => {
      const method = isRemoving ? 'DELETE' : 'POST';
      const response = await apiRequest(method, `/api/announcements/${announcement.id}/reactions`, { emoji });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'announcements'] });
    },
    onError: () => {
      toast({ title: 'Failed to update reaction', variant: 'destructive' });
    }
  });

  const voteOnPollMutation = useMutation({
    mutationFn: async ({ pollId, optionIndex }: { pollId: string; optionIndex: number }) => {
      const response = await apiRequest('POST', `/api/polls/${pollId}/votes`, { optionIndex });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'announcements'] });
      toast({ title: 'Vote recorded successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to record vote', variant: 'destructive' });
    }
  });

  const handleReaction = (emoji: string) => {
    const isRemoving = userReactions.includes(emoji);
    toggleReactionMutation.mutate({ emoji, isRemoving });
  };

  const handlePollVote = (pollId: string, optionIndex: number, allowMultiple: boolean) => {
    // For single-choice polls, check if user already voted on a different option
    if (!allowMultiple && announcement.poll) {
      const userCurrentVotes = announcement.poll.votes.filter(v => v.userId === currentUserId);
      const hasVotedOnOption = userCurrentVotes.some(v => v.optionIndex === optionIndex);
      
      // If they clicked the same option they already voted on, don't do anything
      if (hasVotedOnOption) {
        return;
      }
      
      // If they have votes on other options, show a warning for single-choice
      if (userCurrentVotes.length > 0 && !hasVotedOnOption) {
        toast({ 
          title: 'Single choice poll', 
          description: 'You can only vote for one option in this poll.',
          variant: 'destructive'
        });
        return;
      }
    }
    
    voteOnPollMutation.mutate({ pollId, optionIndex });
  };

  return (
    <Card className={`relative ${announcement.isPinned ? 'border-primary bg-primary/5' : ''}`}>
      {announcement.isPinned && (
        <div className="absolute top-3 right-3">
          <Pin className="w-4 h-4 text-primary" />
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={announcement.author.profileImageUrl} />
            <AvatarFallback>
              {announcement.author.firstName[0]}{announcement.author.lastName[0]}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {announcement.author.firstName} {announcement.author.lastName}
              </span>
              <Badge variant="secondary" className="text-xs">
                Commissioner
              </Badge>
              {announcement.isPinned && (
                <Badge variant="default" className="text-xs">
                  Pinned
                </Badge>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground">
              {format(new Date(announcement.createdAt), 'MMM d, yyyy • h:mm a')}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Content */}
        <p className="text-base leading-relaxed whitespace-pre-wrap">
          {announcement.content}
        </p>


        {/* Poll */}
        {announcement.poll && (
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <h4 className="font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                {announcement.poll.question}
              </h4>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {announcement.poll.options.map((option, index) => {
                  const votes = announcement.poll!.votes.filter(v => v.optionIndex === index).length;
                  const totalVotes = announcement.poll!.votes.length;
                  const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                  const userVoted = announcement.poll!.votes.some(v => v.userId === currentUserId && v.optionIndex === index);

                  return (
                    <div key={index} className="space-y-1">
                      <Button
                        variant={userVoted ? "default" : "ghost"}
                        className="w-full justify-start h-auto p-3"
                        onClick={() => handlePollVote(announcement.poll!.id, index, announcement.poll!.allowMultiple)}
                        disabled={voteOnPollMutation.isPending}
                        data-testid={`button-poll-option-${index}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{option}</span>
                          <span className="text-sm">{votes} votes ({percentage.toFixed(0)}%)</span>
                        </div>
                      </Button>
                      <div className="w-full bg-muted rounded-full h-1">
                        <div 
                          className="bg-primary h-1 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                <span>{announcement.poll.votes.length} total votes</span>
                {announcement.poll.allowMultiple && (
                  <span>Multiple selections allowed</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Reactions */}
        <div className="flex items-center gap-2 flex-wrap">
          {REACTION_EMOJIS.map(({ emoji, label }) => {
            const count = reactionCounts[emoji] || 0;
            const userReacted = userReactions.includes(emoji);

            return (
              <Button
                key={emoji}
                variant={userReacted ? "default" : "ghost"}
                size="sm"
                onClick={() => handleReaction(emoji)}
                className="h-8 px-2 text-sm"
                title={label}
                data-testid={`button-reaction-${emoji}`}
              >
                <span className="mr-1">{emoji}</span>
                {count > 0 && <span>{count}</span>}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Announcements() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Get league ID from URL params - for now, we'll use the user's first league
  const { data: userLeagues = [] } = useQuery({
    queryKey: ['/api/user/leagues'],
    enabled: !!user
  });

  const currentLeague = (userLeagues as any[])[0];
  const leagueId = currentLeague?.id;
  const isCommissioner = currentLeague?.commissionerId === user?.id;

  // Fetch announcements
  const { data, isLoading } = useQuery<{ announcements: Announcement[]; pagination?: { page: number; pageSize: number; total: number } }>({
    queryKey: ['/api/leagues', leagueId, 'announcements'],
    enabled: !!leagueId,
  });

  // Mark announcements as read when page loads
  useEffect(() => {
    if (leagueId && data?.announcements) {
      const markAsRead = async () => {
        try {
          await apiRequest('POST', `/api/leagues/${leagueId}/announcements/mark-read`);
          console.log('📖 Announcements marked as read');
        } catch (error) {
          console.error('Failed to mark announcements as read:', error);
        }
      };
      markAsRead();
    }
  }, [leagueId, data?.announcements]);

  // Normalize the data to handle both array and object responses
  const announcements: Announcement[] = Array.isArray(data) ? data : (data?.announcements ?? []);
  const pagination = Array.isArray(data) ? undefined : data?.pagination;

  if (!user) {
    navigate('/');
    return null;
  }

  if (!currentLeague) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-12">
            <Megaphone className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No League Found</h2>
            <p className="text-muted-foreground">
              You need to be a member of a league to view announcements.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Megaphone className="w-6 h-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">Announcements</h1>
                <p className="text-sm text-muted-foreground">{currentLeague.name}</p>
              </div>
            </div>
            
            {isCommissioner && (
              <Button 
                onClick={() => setShowCreateModal(true)}
                size="sm"
                data-testid="button-create-announcement"
              >
                <Plus className="w-4 h-4 mr-1" />
                Post
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-muted rounded-full" />
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-32" />
                      <div className="h-3 bg-muted rounded w-24" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (announcements as Announcement[]).length === 0 ? (
          <div className="text-center py-12">
            <Megaphone className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Announcements Yet</h2>
            <p className="text-muted-foreground mb-4">
              {isCommissioner 
                ? 'Be the first to share an announcement with your league!'
                : 'Check back later for updates from your commissioner.'
              }
            </p>
            {isCommissioner && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Create First Announcement
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6" data-testid="announcements-list">
            {(announcements as Announcement[]).map((announcement: Announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                leagueId={leagueId}
                currentUserId={user.id}
                isCommissioner={isCommissioner}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Announcement Modal */}
      <CreateAnnouncementModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        leagueId={leagueId}
        isCommissioner={isCommissioner}
      />
    </div>
  );
}
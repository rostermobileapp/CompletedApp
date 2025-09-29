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
  Users,
  Edit2,
  Trash2,
  FileText
} from 'lucide-react';
import { ScrimmageRSVPButtons } from '@/components/ScrimmageRSVPButtons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { EnhancedMediaUploader } from '@/components/EnhancedMediaUploader';

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

type AnnouncementAttachment = {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
};

type Announcement = {
  id: string;
  content: string;
  isPinned: boolean;
  teamId?: string | null;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
  };
  attachments: AnnouncementAttachment[];
  reactions: AnnouncementReaction[];
  polls: AnnouncementPoll[];
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

// Types for media files
interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'document';
  compressed?: File;
}

function CreateAnnouncementModal({ 
  isOpen, 
  onClose, 
  leagueId, 
  canPost 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  leagueId: string;
  canPost: boolean;
}) {
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<MediaFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
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
    setAttachedMedia([]);
    setIsUploading(false);
  };

  // Upload media files to object storage
  const uploadMediaFiles = async (mediaFiles: MediaFile[]): Promise<any[]> => {
    const uploadedAttachments: any[] = [];
    
    for (const mediaFile of mediaFiles) {
      try {
        // Get upload URL
        const uploadResponse = await apiRequest('POST', '/api/announcement-media/upload');
        const { uploadURL } = await uploadResponse.json();
        
        // Use compressed version if available, otherwise use original
        const fileToUpload = mediaFile.compressed || mediaFile.file;
        
        // Upload file to object storage
        const uploadResult = await fetch(uploadURL, {
          method: 'PUT',
          body: fileToUpload,
          headers: {
            'Content-Type': fileToUpload.type,
          },
        });
        
        if (!uploadResult.ok) {
          throw new Error('Failed to upload file');
        }
        
        // Extract the object path from the upload URL for serving
        const urlObj = new URL(uploadURL);
        const objectPath = urlObj.pathname.split('/').pop();
        
        uploadedAttachments.push({
          type: mediaFile.type,
          url: `/announcement-media/${objectPath}`,
          fileName: mediaFile.file.name,
        });
      } catch (error) {
        console.error('Error uploading file:', error);
        throw new Error(`Failed to upload ${mediaFile.file.name}`);
      }
    }
    
    return uploadedAttachments;
  };

  const handleMediaSelection = (files: MediaFile[]) => {
    setAttachedMedia(files);
  };


  const handleSubmit = async () => {
    if (!content.trim()) return;

    try {
      setIsUploading(true);
      
      // Upload media files first if any
      let attachments: any[] = [];
      if (attachedMedia.length > 0) {
        attachments = await uploadMediaFiles(attachedMedia);
      }

      const announcementData: any = {
        content: content.trim(),
        isPinned,
        attachments
      };

      if (showPollCreator && pollQuestion.trim() && pollOptions.some(opt => opt.trim())) {
        announcementData.poll = {
          question: pollQuestion.trim(),
          options: pollOptions.filter(opt => opt.trim()),
          allowMultiple
        };
      }

      createAnnouncementMutation.mutate(announcementData);
    } catch (error) {
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'Failed to upload media files',
        variant: 'destructive' 
      });
      setIsUploading(false);
    }
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

  if (!canPost) return null;

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

          {/* Media Uploader */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('media-uploader-trigger')?.click()}
                data-testid="button-add-media"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Images
              </Button>
              {attachedMedia.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {attachedMedia.length} file{attachedMedia.length > 1 ? 's' : ''} selected
                </span>
              )}
            </div>
            
            {/* Media Preview */}
            {attachedMedia.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {attachedMedia.map((media, index) => (
                  <div key={index} className="relative">
                    <img 
                      src={media.preview} 
                      alt={media.file.name}
                      className="w-full h-20 object-cover rounded border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2 h-6 w-6 p-0"
                      onClick={() => setAttachedMedia(prev => prev.filter((_, i) => i !== index))}
                      data-testid={`button-remove-media-${index}`}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <EnhancedMediaUploader
              maxFiles={5}
              acceptedTypes={['image/*']}
              onFilesSelected={handleMediaSelection}
            >
              <div id="media-uploader-trigger" />
            </EnhancedMediaUploader>
          </div>

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
              disabled={!content.trim() || createAnnouncementMutation.isPending || isUploading}
              data-testid="button-create-announcement"
            >
              {isUploading ? 'Uploading...' : createAnnouncementMutation.isPending ? 'Creating...' : 'Post Announcement'}
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
  
  // Edit/Delete state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editContent, setEditContent] = useState(announcement.content);
  const [editIsPinned, setEditIsPinned] = useState(announcement.isPinned);

  // Check if this is a scrimmage invitation
  const isScrimmageInvitation = announcement.content.includes('🏒 You\'re Invited!');
  
  // Get all scrimmages for the league to find the matching one
  const { data: leagueScrimmages = [] } = useQuery({
    queryKey: ["/api/leagues", leagueId, "scrimmages"],
    enabled: isScrimmageInvitation
  }) as { data: any[] };

  // Try to match the scrimmage based on title from announcement content
  const extractScrimmageTitle = (content: string) => {
    // Parse: "🏒 You're Invited! "Title" on Date at Location. Click to RSVP!"
    const match = content.match(/🏒 You're Invited! "([^"]+)" on/);
    return match ? match[1] : null;
  };

  const scrimmageTitle = isScrimmageInvitation ? extractScrimmageTitle(announcement.content) : null;
  
  // Find matching scrimmage by title and author
  const matchingScrimmage = isScrimmageInvitation && scrimmageTitle 
    ? leagueScrimmages.find((scrimmage: any) => 
        scrimmage.title === scrimmageTitle && 
        scrimmage.creatorId === announcement.author.id
      )
    : null;

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

  // Edit announcement mutation
  const updateAnnouncementMutation = useMutation({
    mutationFn: async (data: { content: string; isPinned: boolean }) => {
      return await apiRequest('PATCH', `/api/announcements/${announcement.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'announcements'] });
      toast({ title: 'Announcement updated successfully!' });
      setShowEditModal(false);
    },
    onError: () => {
      toast({ title: 'Failed to update announcement', variant: 'destructive' });
    }
  });

  // Delete announcement mutation
  const deleteAnnouncementMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/announcements/${announcement.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'announcements'] });
      toast({ title: 'Announcement deleted successfully!' });
      setShowDeleteConfirm(false);
    },
    onError: () => {
      toast({ title: 'Failed to delete announcement', variant: 'destructive' });
    }
  });

  const handleReaction = (emoji: string) => {
    const isRemoving = userReactions.includes(emoji);
    toggleReactionMutation.mutate({ emoji, isRemoving });
  };

  const handlePollVote = (pollId: string, optionIndex: number, allowMultiple: boolean) => {
    // For single-choice polls, check if user already voted on a different option
    if (!allowMultiple && (announcement as any).polls && (announcement as any).polls.length > 0) {
      const userCurrentVotes = (announcement as any).polls[0].votes.filter((v: any) => v.userId === currentUserId);
      const hasVotedOnOption = userCurrentVotes.some((v: any) => v.optionIndex === optionIndex);
      
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
    <Card className="rounded-lg border text-card-foreground shadow-sm relative border-primary bg-[#212121]">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {announcement.author.firstName} {announcement.author.lastName}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {announcement.teamId ? 'Team Captain' : 'Commissioner'}
                </Badge>
                {announcement.isPinned && (
                  <Badge variant="default" className="text-xs">
                    Pinned
                  </Badge>
                )}
              </div>
              
              {/* Edit/Delete buttons for commissioners and announcement authors */}
              {(isCommissioner || announcement.author.id === currentUserId) && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-muted"
                    onClick={() => setShowEditModal(true)}
                    data-testid="button-edit-announcement"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    data-testid="button-delete-announcement"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
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

        {/* Attachments */}
        {announcement.attachments && announcement.attachments.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {announcement.attachments.map((attachment, index) => {
                if (attachment.type === 'image') {
                  return (
                    <div 
                      key={index} 
                      className="relative border rounded-lg overflow-hidden bg-muted/30"
                      data-testid={`attachment-image-${index}`}
                    >
                      <div className="aspect-video relative">
                        <img
                          src={attachment.url}
                          alt={attachment.filename || 'Attached image'}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => window.open(attachment.url, '_blank')}
                        />
                      </div>
                      {attachment.filename && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/75 text-white p-2">
                          <p className="text-xs font-medium truncate">
                            {attachment.filename}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                } else if (attachment.type === 'video') {
                  return (
                    <div 
                      key={index} 
                      className="relative border rounded-lg overflow-hidden bg-muted/30"
                      data-testid={`attachment-video-${index}`}
                    >
                      <div className="aspect-video relative bg-black">
                        <video
                          src={attachment.url}
                          className="w-full h-full object-cover"
                          controls
                        />
                      </div>
                      {attachment.filename && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/75 text-white p-2">
                          <p className="text-xs font-medium truncate">
                            {attachment.filename}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                } else {
                  // Other file types (documents, etc.)
                  return (
                    <div 
                      key={index} 
                      className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer"
                      onClick={() => window.open(attachment.url, '_blank')}
                      data-testid={`attachment-file-${index}`}
                    >
                      <div className="flex items-center justify-center w-10 h-10 bg-muted rounded">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {attachment.filename || 'File'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {attachment.type}
                        </p>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        )}

        {/* Enhanced Poll */}
        {announcement.polls && announcement.polls.length > 0 && (() => {
          const poll = announcement.polls[0];
          return (
            <Card className="bg-[#212121]">
              <CardHeader className="flex flex-col space-y-1.5 p-6 pb-3 bg-[#212121]">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2 text-blue-800 dark:text-blue-200">
                    <BarChart3 className="w-5 h-5" />
                    {poll.question}
                  </h4>
                  <div className="flex items-center gap-2">
                    {!poll.allowMultiple && (
                      <Badge variant="outline" className="text-xs">Single Choice</Badge>
                    )}
                    {poll.allowMultiple && (
                      <Badge variant="outline" className="text-xs">Multiple Choice</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-3 bg-[#212121]">
                {poll.options.map((option, index) => {
                  const votes = poll.votes.filter(v => v.optionIndex === index).length;
                  const totalVotes = poll.votes.length;
                  const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                  const userVoted = poll.votes.some(v => v.userId === currentUserId && v.optionIndex === index);
                  const isTopChoice = votes > 0 && votes === Math.max(...poll.options.map((_, i) => 
                    poll.votes.filter(v => v.optionIndex === i).length
                  ));

                  return (
                    <div key={index} className="relative">
                      <Button
                        variant={userVoted ? "default" : "outline"}
                        className={`w-full justify-between h-auto p-4 relative overflow-hidden transition-all duration-200 ${
                          userVoted 
                            ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20' 
                            : 'hover:bg-muted/50 border-dashed'
                        } ${isTopChoice && totalVotes > 0 ? 'ring-2 ring-green-400/30' : ''}`}
                        onClick={() => handlePollVote(poll.id, index, poll.allowMultiple)}
                        disabled={voteOnPollMutation.isPending}
                        data-testid={`button-poll-option-${index}`}
                      >
                        {/* Background progress bar */}
                        <div 
                          className="absolute inset-0 transition-all duration-500 from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 bg-[#3883f6]"
                          style={{ width: `${Math.max(percentage, 8)}%` }}
                        />
                        
                        <div className="relative flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            {userVoted && (
                              <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                            )}
                            <span className="font-medium text-left">{option}</span>
                            {isTopChoice && totalVotes > 0 && (
                              <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full">
                                Leading
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">
                              {percentage.toFixed(1)}%
                            </div>
                            <div className="text-xs opacity-75">
                              {votes} vote{votes !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                      </Button>
                    </div>
                  );
                })}
                
                <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground border-t">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>{poll.votes.length} total votes</span>
                  </div>
                  {voteOnPollMutation.isPending && (
                    <div className="flex items-center gap-2 text-blue-600">
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Recording vote...</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <Separator />

        {/* RSVP Buttons for Scrimmage Invitations or Regular Reactions */}
        {isScrimmageInvitation && matchingScrimmage ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>RSVP to this scrimmage:</span>
            </div>
            <ScrimmageRSVPButtons 
              scrimmageId={matchingScrimmage.id} 
              className="justify-start" 
            />
          </div>
        ) : (
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
        )}
      </CardContent>
      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Edit Announcement
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-content">Content</Label>
              <Textarea
                id="edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="What would you like to announce?"
                className="min-h-[100px] resize-none"
                data-testid="textarea-edit-content"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-pin"
                checked={editIsPinned}
                onChange={(e) => setEditIsPinned(e.target.checked)}
                data-testid="checkbox-edit-pin"
              />
              <Label htmlFor="edit-pin">Pin this announcement</Label>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditContent(announcement.content);
                  setEditIsPinned(announcement.isPinned);
                  setShowEditModal(false);
                }}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={() => updateAnnouncementMutation.mutate({ content: editContent, isPinned: editIsPinned })}
                disabled={!editContent.trim() || updateAnnouncementMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateAnnouncementMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Announcement
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this announcement? This action cannot be undone.
              {announcement.polls && announcement.polls.length > 0 && " This will also delete the poll and all its votes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAnnouncementMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAnnouncementMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteAnnouncementMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  // Get user league memberships to check for commissioner role
  const { data: userMemberships = [] } = useQuery({
    queryKey: ['/api/user/league-memberships'],
    enabled: !!user
  });

  const currentLeague = (userLeagues as any[])[0];
  const leagueId = currentLeague?.id;
  
  // Check if user is commissioner - either league owner or has commissioner role in membership
  const currentMembership = (userMemberships as any[]).find((m: any) => m.leagueId === leagueId);
  const isCommissioner = currentLeague?.commissionerId === user?.id || 
                         currentMembership?.league_role === 'commissioner';

  // Get teams in the league to check if user is a team captain
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'teams'],
    enabled: !!leagueId
  });

  // Check if user is a team captain in this league
  const isTeamCaptain = (teams as any[]).some((team: any) => team.captainId === user?.id);
  
  // User can post if they're a commissioner or team captain
  const canPost = isCommissioner || isTeamCaptain;

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
            
            {canPost && (
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
              {canPost 
                ? 'Be the first to share an announcement!'
                : 'Check back later for updates.'
              }
            </p>
            {canPost && (
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
        canPost={canPost}
      />
    </div>
  );
}
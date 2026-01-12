import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Trophy, Users, Calendar, Play, CheckCircle, Trash2, Clock, MapPin, Download, Edit3, Edit, DollarSign, Copy, CheckCheck, Upload, UserPlus, UserCheck, UserX, User, ArrowRight, Megaphone, Plus, Heart, ThumbsUp, Laugh, Frown, Angry, Meh, MessageCircle, BarChart3, Pin, MoreHorizontal, Edit2, FileText, AlertCircle, Eye, EyeOff } from "lucide-react";
import jsPDF from 'jspdf';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getImageUrl } from "@/lib/queryClient";
import BracketView from "@/components/BracketView";
import MatchEditDialog from "@/components/MatchEditDialog";
import TournamentMatchScoreModal from "@/components/TournamentMatchScoreModal";
import { CustomBracketBuilder } from "@/components/CustomBracketBuilder";
import { EnhancedMediaUploader } from "@/components/EnhancedMediaUploader";
import type { Tournament, TournamentTeam, TournamentMatch, TournamentSettings } from "@shared/schema";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { usePermissions } from "@/context/SubscriptionContext";

// Announcement types
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

// Tournament Announcement Modal Component
function CreateTournamentAnnouncementModal({ 
  isOpen, 
  onClose, 
  tournamentId, 
  canPost 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  tournamentId: string;
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
      const response = await apiRequest('POST', `/api/tournaments/${tournamentId}/announcements`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'announcements'] });
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

  const uploadMediaFiles = async (mediaFiles: MediaFile[]): Promise<any[]> => {
    const uploadedAttachments: any[] = [];
    
    for (const mediaFile of mediaFiles) {
      try {
        const uploadResponse = await apiRequest('POST', '/api/announcement-media/upload');
        const { uploadURL } = await uploadResponse.json();
        
        const fileToUpload = mediaFile.compressed || mediaFile.file;
        
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
            Create Tournament Announcement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Message</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, CHAR_LIMIT))}
              placeholder="What would you like to announce?"
              className="min-h-24 resize-none"
              data-testid="input-tournament-announcement-content"
            />
            <div className="flex justify-between items-center mt-1">
              <span className={`text-sm ${content.length > CHAR_LIMIT * 0.8 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {content.length}/{CHAR_LIMIT}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pin-tournament-announcement"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              data-testid="checkbox-pin-tournament-announcement"
            />
            <Label htmlFor="pin-tournament-announcement" className="flex items-center gap-1">
              <Pin className="w-4 h-4" />
              Pin this announcement
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={showPollCreator ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPollCreator(!showPollCreator)}
              data-testid="button-toggle-tournament-poll"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              {showPollCreator ? 'Remove Poll' : 'Add Poll'}
            </Button>
          </div>

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
                    data-testid="input-tournament-poll-question"
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
                          data-testid={`input-tournament-poll-option-${index}`}
                        />
                        {pollOptions.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removePollOption(index)}
                            data-testid={`button-remove-tournament-option-${index}`}
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
                      data-testid="button-add-tournament-poll-option"
                    >
                      + Add option
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allow-tournament-multiple"
                    checked={allowMultiple}
                    onChange={(e) => setAllowMultiple(e.target.checked)}
                    data-testid="checkbox-allow-tournament-multiple"
                  />
                  <Label htmlFor="allow-tournament-multiple">Allow multiple selections</Label>
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('tournament-media-uploader-trigger')?.click()}
                data-testid="button-add-tournament-media"
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
                      data-testid={`button-remove-tournament-media-${index}`}
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
              <div id="tournament-media-uploader-trigger" />
            </EnhancedMediaUploader>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              data-testid="button-cancel-tournament-announcement"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!content.trim() || createAnnouncementMutation.isPending || isUploading}
              data-testid="button-create-tournament-announcement-submit"
            >
              {isUploading ? 'Uploading...' : createAnnouncementMutation.isPending ? 'Creating...' : 'Post Announcement'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Tournament Poll Card Component
function TournamentPollCard({
  poll,
  currentUserId,
  onVote,
  isPending
}: {
  poll: AnnouncementPoll;
  currentUserId: string;
  onVote: (pollId: string, optionIndex: number, allowMultiple: boolean) => void;
  isPending: boolean;
}) {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="flex flex-col space-y-2 p-5 pb-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold flex items-center gap-2.5 text-foreground">
            <BarChart3 className="w-4 h-4 text-primary" />
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
      <CardContent className="p-5 pt-0 space-y-2.5">
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
                className={`w-full justify-between h-auto py-3.5 px-4 relative overflow-hidden transition-all duration-300 rounded-xl ${
                  userVoted 
                    ? 'bg-primary text-primary-foreground hover:bg-primary border-primary' 
                    : 'hover:bg-accent/50 border-border'
                }`}
                onClick={() => onVote(poll.id, index, poll.allowMultiple)}
                disabled={isPending}
                data-testid={`button-tournament-poll-option-${index}`}
              >
                <div 
                  className="absolute inset-0 transition-all duration-500 bg-primary/20 rounded-xl"
                  style={{ width: `${Math.max(percentage, 0)}%` }}
                />
                
                <div className="relative flex items-center justify-between w-full gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {userVoted && (
                      <div className="w-2 h-2 rounded-full bg-white flex-shrink-0" />
                    )}
                    <span className="font-medium text-sm text-left truncate">{option}</span>
                    {isTopChoice && totalVotes > 0 && (
                      <span className="text-[12px] bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                        Leading
                      </span>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs opacity-75">
                      {votes} {votes !== 1 ? 'votes' : 'vote'}
                    </div>
                  </div>
                </div>
              </Button>
            </div>
          );
        })}
        
        <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground border-t border-border">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            <span>{poll.votes.length} total votes</span>
          </div>
          {isPending && (
            <div className="flex items-center gap-2 text-primary">
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-[12px]">Recording vote...</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Tournament Announcement Card Component
function TournamentAnnouncementCard({ 
  announcement, 
  tournamentId, 
  currentUserId, 
  isCommissioner 
}: { 
  announcement: Announcement;
  tournamentId: string;
  currentUserId: string;
  isCommissioner: boolean;
}) {
  const { toast } = useToast();
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editContent, setEditContent] = useState(announcement.content);
  const [editIsPinned, setEditIsPinned] = useState(announcement.isPinned);

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
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'announcements'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'announcements'] });
      toast({ title: 'Vote recorded successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to record vote', variant: 'destructive' });
    }
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: async (data: { content: string; isPinned: boolean }) => {
      const response = await apiRequest('PATCH', `/api/announcements/${announcement.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'announcements'] });
      toast({ title: 'Announcement updated successfully!' });
      setShowEditModal(false);
    },
    onError: () => {
      toast({ title: 'Failed to update announcement', variant: 'destructive' });
    }
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/announcements/${announcement.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'announcements'] });
      toast({ title: 'Announcement deleted successfully!' });
      setShowDeleteConfirm(false);
    },
    onError: () => {
      toast({ title: 'Failed to delete announcement', variant: 'destructive' });
    }
  });

  const handleReactionClick = (emoji: string) => {
    const isRemoving = userReactions.includes(emoji);
    toggleReactionMutation.mutate({ emoji, isRemoving });
  };

  const handlePollVote = (pollId: string, optionIndex: number, allowMultiple: boolean) => {
    if (allowMultiple) {
      voteOnPollMutation.mutate({ pollId, optionIndex });
    } else {
      const currentPoll = announcement.polls.find(p => p.id === pollId);
      const hasVoted = currentPoll?.votes.some(v => v.userId === currentUserId);
      
      if (!hasVoted) {
        voteOnPollMutation.mutate({ pollId, optionIndex });
      }
    }
  };

  return (
    <Card className="relative">
      {announcement.isPinned && (
        <div className="absolute top-3 right-3">
          <Pin className="h-4 w-4 text-primary" />
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={getImageUrl(announcement.author.profileImageUrl) || undefined} />
            <AvatarFallback>
              {announcement.author.firstName?.[0]}{announcement.author.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">
                  {announcement.author.firstName} {announcement.author.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(announcement.createdAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
              
              {isCommissioner && announcement.author.id === currentUserId && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEditModal(true)}
                    data-testid="button-edit-tournament-announcement"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    data-testid="button-delete-tournament-announcement"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm whitespace-pre-wrap">{announcement.content}</p>

        {announcement.attachments && announcement.attachments.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {announcement.attachments.map((attachment) => (
              <div key={attachment.id} className="relative aspect-video rounded-lg overflow-hidden border">
                <img 
                  src={attachment.url} 
                  alt={attachment.filename || 'Attachment'}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {announcement.polls && announcement.polls.length > 0 && (
          <div className="space-y-3">
            {announcement.polls.map((poll) => (
              <TournamentPollCard
                key={poll.id}
                poll={poll}
                currentUserId={currentUserId}
                onVote={handlePollVote}
                isPending={voteOnPollMutation.isPending}
              />
            ))}
          </div>
        )}

        <Separator />

        <div className="flex items-center gap-2 flex-wrap">
          {REACTION_EMOJIS.map(({ emoji, label }) => {
            const count = reactionCounts[emoji] || 0;
            const hasReacted = userReactions.includes(emoji);
            
            return (
              <Button
                key={emoji}
                variant={hasReacted ? "default" : "outline"}
                size="sm"
                onClick={() => handleReactionClick(emoji)}
                className="h-8 px-3"
                data-testid={`button-tournament-reaction-${label.toLowerCase()}`}
              >
                <span className="mr-1">{emoji}</span>
                {count > 0 && <span className="text-xs">{count}</span>}
              </Button>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Message</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-24"
                data-testid="input-edit-tournament-announcement"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-pin"
                checked={editIsPinned}
                onChange={(e) => setEditIsPinned(e.target.checked)}
              />
              <Label htmlFor="edit-pin">Pin this announcement</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateAnnouncementMutation.mutate({ content: editContent, isPinned: editIsPinned })}
                disabled={updateAnnouncementMutation.isPending}
              >
                {updateAnnouncementMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this announcement? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAnnouncementMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAnnouncementMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function TournamentDetail() {
  const [, params] = useRoute("/tournaments/:tournamentId");
  const [location, setLocation] = useLocation();
  const tournamentId = params?.tournamentId;
  const { toast } = useToast();
  const { canManageLeagueSpecific } = usePermissions();
  
  // Read tab and readonly mode from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const tabFromUrl = urlParams.get('tab');
  const isReadOnlyMode = urlParams.get('readonly') === 'true';
  // In read-only mode, only allow bracket and schedule tabs
  const allowedTabs = isReadOnlyMode ? ['bracket', 'schedule'] : ['bracket', 'teams', 'schedule'];
  const defaultTab = (tabFromUrl && allowedTabs.includes(tabFromUrl)) ? tabFromUrl : 'bracket';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);
  const [isExportingSchedule, setIsExportingSchedule] = useState(false);
  const [isEditingBracket, setIsEditingBracket] = useState(false);
  const [copiedTournamentId, setCopiedTournamentId] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TournamentTeam | null>(null);
  const [additionalPaymentRequired, setAdditionalPaymentRequired] = useState<{
    additionalTeamsCount: number;
    additionalFee: number;
    newTeamsDetected: string[];
  } | null>(null);
  const [isProcessingAdditionalPayment, setIsProcessingAdditionalPayment] = useState(false);
  
  // Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedParticipantToMerge, setSelectedParticipantToMerge] = useState<any | null>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [targetUserEmail, setTargetUserEmail] = useState('');

  // Announcement state
  const [showCreateAnnouncementModal, setShowCreateAnnouncementModal] = useState(false);

  const { data: tournament, isLoading: tournamentLoading} = useQuery<Tournament>({
    queryKey: ['/api/tournaments', tournamentId],
    enabled: !!tournamentId
  });
  
  // Derive locked state from tournament data - default to unlocked if no bracket exists yet
  // This now applies to all tournament formats, not just custom_bracket
  const isBracketLocked = (tournament?.settings as any)?.customBracket?.locked ?? false;

  const { data: teams, isLoading: teamsLoading } = useQuery<TournamentTeam[]>({
    queryKey: ['/api/tournaments', tournamentId, 'teams'],
    enabled: !!tournamentId
  });

  const { data: matches, isLoading: matchesLoading } = useQuery<TournamentMatch[]>({
    queryKey: ['/api/tournaments', tournamentId, 'matches'],
    enabled: !!tournamentId
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/user']
  });

  // Fetch team players when a team is selected
  const { data: teamPlayers, isLoading: teamPlayersLoading, error: teamPlayersError } = useQuery<any[]>({
    queryKey: selectedTeam ? ['/api/tournaments', tournamentId, 'teams', selectedTeam.id, 'players'] : ['no-team-selected'],
    enabled: !!tournamentId && !!selectedTeam?.id,
  });

  // Check if user can manage this tournament (creator for standalone OR league commissioner for playoffs)
  // Define this before hooks that use it
  const canManageTournament = () => {
    if (!tournament || !currentUser) return false;
    if (tournament.type === 'standalone' && tournament.createdBy === currentUser.id) return true;
    if (tournament.type === 'season_playoff' && tournament.leagueId && canManageLeagueSpecific(tournament.leagueId)) return true;
    return false;
  };

  const { data: pendingParticipants } = useQuery<any[]>({
    queryKey: ['/api/tournaments', tournamentId, 'participants', 'pending'],
    enabled: !!tournamentId && !!tournament && !!currentUser && canManageTournament()
  });

  // Fetch tournament announcements
  const { data: announcementsData, isLoading: announcementsLoading } = useQuery<{ announcements: Announcement[]; pagination?: { page: number; pageSize: number; total: number } }>({
    queryKey: ['/api/tournaments', tournamentId, 'announcements'],
    enabled: !!tournamentId,
  });

  const announcements: Announcement[] = Array.isArray(announcementsData) ? announcementsData : (announcementsData?.announcements ?? []);

  // Mark announcements as read when viewed
  useEffect(() => {
    if (tournamentId && announcements.length > 0) {
      const markAsRead = async () => {
        try {
          await apiRequest('POST', `/api/tournaments/${tournamentId}/announcements/mark-read`);
        } catch (error) {
          console.error('Failed to mark announcements as read:', error);
        }
      };
      markAsRead();
    }
  }, [tournamentId, announcements]);

  // Handle payment success callback from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const isAdditional = params.get('additional');
    
    if (paymentStatus === 'success' && tournamentId) {
      // Show success message
      toast({
        title: "Payment successful!",
        description: isAdditional 
          ? "Your additional team payment has been processed. It may take a moment for the balance to update."
          : "Your tournament payment has been processed successfully. It may take a moment for the payment status to update.",
      });
      
      // Refresh tournament data to show updated payment status
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'teams'] });
      
      // Clean up the URL by removing the payment parameter
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else if (paymentStatus === 'cancelled') {
      toast({
        title: "Payment cancelled",
        description: "Your payment was cancelled. You can try again when ready.",
        variant: "destructive"
      });
      
      // Clean up the URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [tournamentId, toast]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/tournaments/${tournamentId}`);
      // apiRequest throws on error, so if we reach here, deletion succeeded
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', tournament?.leagueId, 'tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments/all'] });
      toast({
        title: "Tournament deleted",
        description: "The tournament has been deleted successfully"
      });
      // Navigate to appropriate tournaments page based on tournament type
      const redirectPath = tournament?.leagueId 
        ? `/leagues/${tournament.leagueId}/tournaments`
        : '/tournaments';
      setLocation(redirectPath);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete tournament",
        variant: "destructive"
      });
    }
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/tournaments/${tournamentId}/create-checkout`);
      const data = await response.json();
      return data as { url: string };
    },
    onSuccess: (data) => {
      console.log('💳 Stripe checkout response:', data);
      
      // Validate the URL before redirecting
      if (!data || !data.url) {
        console.error('❌ Invalid checkout response:', data);
        toast({
          title: "Error",
          description: "Invalid checkout session URL received",
          variant: "destructive"
        });
        return;
      }
      
      console.log('✅ Redirecting to Stripe checkout:', data.url);
      // Redirect to Stripe checkout
      window.location.href = data.url;
    },
    onError: (error: any) => {
      console.error('❌ Payment mutation error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to initiate payment",
        variant: "destructive"
      });
    }
  });

  const approveParticipantMutation = useMutation({
    mutationFn: async ({ participantId, tournamentTeamId }: { participantId: string; tournamentTeamId?: string }) => {
      return await apiRequest('PATCH', `/api/tournament-participants/${participantId}/approve`, { tournamentTeamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'participants', 'pending'] });
      toast({
        title: "Participant approved",
        description: "The participant has been approved successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to approve participant",
        variant: "destructive"
      });
    }
  });

  const rejectParticipantMutation = useMutation({
    mutationFn: async (participantId: string) => {
      return await apiRequest('PATCH', `/api/tournament-participants/${participantId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'participants', 'pending'] });
      toast({
        title: "Participant rejected",
        description: "The participant request has been rejected"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to reject participant",
        variant: "destructive"
      });
    }
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async (isVisibleToLeague: boolean) => {
      const response = await apiRequest('PATCH', `/api/tournaments/${tournamentId}/visibility`, { isVisibleToLeague });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
      // Invalidate visible tournaments queries so the dashboard updates
      if (data.leagueId) {
        queryClient.invalidateQueries({ queryKey: ['/api/leagues', data.leagueId, 'visible-tournaments'] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/user/visible-tournaments'] });
      toast({
        title: data.isVisibleToLeague ? "Bracket visible to league" : "Bracket hidden from league",
        description: data.isVisibleToLeague 
          ? "All league members can now view the tournament bracket on their home page." 
          : "The bracket is no longer visible to league members."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update bracket visibility",
        variant: "destructive"
      });
    }
  });

  const isLoading = tournamentLoading || teamsLoading || matchesLoading;

  const getFormatLabel = (format: Tournament['format']) => {
    const labels: Record<Tournament['format'], string> = {
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
      three_game_guarantee: '3-Game Guarantee',
      round_robin: 'Round Robin',
      round_robin_split: 'Round Robin + Playoffs',
      custom_bracket: 'Custom Bracket Builder'
    };
    return labels[format];
  };

  const getStatusBadge = (status: Tournament['status']) => {
    const variants: Record<Tournament['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline', text: string, icon: any }> = {
      draft: { variant: 'outline', text: 'Draft', icon: Calendar },
      active: { variant: 'default', text: 'Active', icon: Play },
      completed: { variant: 'secondary', text: 'Completed', icon: CheckCircle }
    };
    const config = variants[status];
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1" data-testid={`badge-status-${status}`}>
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  // Group matches by round
  const matchesByRound = matches?.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
    return acc;
  }, {} as Record<string, TournamentMatch[]>) || {};

  const rounds = Object.keys(matchesByRound).sort();

  // Get team name by ID (teamId here is actually tournamentTeams.id)
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "TBD";
    const team = teams?.find(t => t.id === teamId);
    return team?.teamName || "TBD";
  };

  // Export schedule to PDF
  const exportScheduleToPDF = async () => {
    if (!matches || matches.length === 0) {
      toast({
        title: "No matches",
        description: "There are no matches to export",
        variant: "destructive"
      });
      return;
    }

    setIsExportingSchedule(true);
    
    try {
      // Create PDF in portrait mode, 8.5x11 inches
      const pageWidth = 8.5 * 72; // 612 points
      const pageHeight = 11 * 72; // 792 points
      const margin = 0.5 * 72; // 36 points
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [pageWidth, pageHeight]
      });

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const title = `${tournament?.name || 'Tournament'} - Schedule`;
      const titleWidth = doc.getTextWidth(title);
      doc.text(title, (pageWidth - titleWidth) / 2, margin + 20);

      // Subtitle with format
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const subtitle = getFormatLabel(tournament?.format || 'single_elimination');
      const subtitleWidth = doc.getTextWidth(subtitle);
      doc.text(subtitle, (pageWidth - subtitleWidth) / 2, margin + 35);

      const availableWidth = pageWidth - (2 * margin);
      const maxPageY = pageHeight - margin;
      let currentY = margin + 60;
      let currentPage = 1;

      // Helper to add new page
      const addNewPage = () => {
        doc.addPage();
        currentPage++;
        currentY = margin + 20;
        
        // Add page number
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${currentPage}`, pageWidth - margin - 40, margin + 10);
        
        currentY = margin + 30;
      };

      // Helper to check if content fits on page
      const fitsOnPage = (height: number): boolean => {
        return (currentY + height) <= maxPageY;
      };

      // Sort matches by match number
      const sortedMatches = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);

      // Draw each match
      sortedMatches.forEach((match, index) => {
        const matchHeight = 70; // Approximate height for match card
        
        // Check if we need a new page
        if (!fitsOnPage(matchHeight + 10)) {
          addNewPage();
        }

        const team1Name = getTeamName(match.team1Id);
        const team2Name = getTeamName(match.team2Id);

        // Match card background
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(1);
        doc.rect(margin, currentY, availableWidth, matchHeight, 'FD');

        // Blue accent bar
        doc.setFillColor(59, 130, 246);
        doc.rect(margin, currentY, availableWidth, 3, 'F');

        // Match number and round
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`Match ${match.matchNumber} - ${match.round}`, margin + 10, currentY + 20);

        // Teams
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${team1Name} vs ${team2Name}`, margin + 10, currentY + 38);

        // Date/Time
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        if (match.scheduledTime) {
          const dateStr = format(new Date(match.scheduledTime), "MMM d, yyyy 'at' h:mm a");
          doc.text(`⏰ ${dateStr}`, margin + 10, currentY + 52);
        } else {
          doc.text('⏰ Not scheduled', margin + 10, currentY + 52);
        }

        // Location
        if (match.location) {
          doc.text(`📍 ${match.location}`, margin + 10, currentY + 64);
        }

        // Status badge (top right)
        const statusX = pageWidth - margin - 80;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        
        if (match.status === 'completed') {
          doc.setTextColor(34, 197, 94); // green
          doc.text('COMPLETED', statusX, currentY + 20);
        } else if (match.status === 'pending') {
          doc.setTextColor(250, 204, 21); // yellow
          doc.text('PENDING', statusX, currentY + 20);
        } else {
          doc.setTextColor(100, 100, 100); // gray
          doc.text('SCHEDULED', statusX, currentY + 20);
        }

        currentY += matchHeight + 8; // Add spacing between matches
      });

      // Save PDF
      const filename = tournament?.name 
        ? `${tournament.name.replace(/[^a-z0-9]/gi, '_')}_schedule.pdf`
        : 'tournament_schedule.pdf';
      doc.save(filename);
      
      toast({
        title: "PDF exported",
        description: "Schedule has been downloaded successfully"
      });
      
    } catch (error) {
      console.error('Error exporting schedule PDF:', error);
      toast({
        title: "Error",
        description: "Failed to export PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExportingSchedule(false);
    }
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingCsv(true);
    try {
      const formData = new FormData();
      formData.append('playerFile', file);

      const response = await fetch(`/api/tournaments/${tournamentId}/players/import`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const result = await response.json();

      // Check if additional payment is required
      if (response.status === 402 && result.requiresPayment) {
        setAdditionalPaymentRequired({
          additionalTeamsCount: result.additionalTeamsCount,
          additionalFee: result.additionalFee,
          newTeamsDetected: result.newTeamsDetected
        });
        // Reset file input
        event.target.value = '';
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || 'Failed to upload CSV');
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'teams'] });
      
      toast({
        title: "CSV imported successfully",
        description: `Imported ${result.teamsCreated || 0} teams and ${result.playersImported || 0} players`
      });

      // Reset file input
      event.target.value = '';
      setCsvFile(null);
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error?.message || "Failed to import CSV",
        variant: "destructive"
      });
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleAdditionalTeamPayment = async () => {
    if (!additionalPaymentRequired) return;

    setIsProcessingAdditionalPayment(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/additional-teams-checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalTeamCount: additionalPaymentRequired.additionalTeamsCount })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: "Payment failed",
        description: error?.message || "Failed to initiate payment",
        variant: "destructive"
      });
    } finally {
      setIsProcessingAdditionalPayment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardContent className="p-12 text-center">
              <h3 className="text-xl font-semibold mb-2">Tournament Not Found</h3>
              <p className="text-muted-foreground">This tournament could not be found.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 pt-[4px] pb-[4px]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const path = tournament.leagueId 
                ? `/leagues/${tournament.leagueId}/tournaments`
                : '/tournaments';
              setLocation(path);
            }}
            className="mb-2 -ml-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournaments
          </Button>
          
          <div className="space-y-2">
            {/* Title, Badges, and Actions - Single Row */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-tournament-name">
                  <Trophy className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                  {tournament.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className="font-mono font-semibold text-xs cursor-pointer hover:bg-muted"
                    onClick={() => {
                      navigator.clipboard.writeText(tournament.uniqueTournamentId || '');
                      setCopiedTournamentId(true);
                      setTimeout(() => setCopiedTournamentId(false), 2000);
                      toast({
                        title: "Copied!",
                        description: "Tournament ID copied to clipboard"
                      });
                    }}
                    data-testid="badge-tournament-id"
                  >
                    {copiedTournamentId ? <CheckCheck className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    ID: {tournament.uniqueTournamentId}
                  </Badge>
                  <Badge variant="outline" className="font-normal text-xs">
                    {tournament.type === 'season_playoff' ? 'Season Playoff' : 'Standalone'}
                  </Badge>
                  <Badge variant="outline" className="font-normal text-xs">
                    {getFormatLabel(tournament.format)}
                  </Badge>
                  {teams && teams.length > 0 && (
                    <Badge variant="secondary" className="font-normal text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {teams.length} {teams.length === 1 ? 'team' : 'teams'}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                {tournament.status === 'draft' && (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLocation(`/tournaments/${tournamentId}/edit`)}
                      data-testid="button-edit"
                    >
                      Edit Settings
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                      data-testid="button-delete"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Description - Optional Second Line */}
            {tournament.description && (
              <p className="text-sm text-muted-foreground max-w-3xl" data-testid="text-tournament-description">
                {tournament.description}
              </p>
            )}
          </div>
        </div>
      </div>
      {/* Payment Status Section - Commissioner Only */}
      {tournament && canManageTournament() && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 pb-4 md:pb-6">
          <Card className={tournament.paymentStatus === 'paid' ? 'border-green-500/50' : 'border-amber-500/50'}>
            <CardContent className="p-4 md:p-6 pt-[4px] pb-[4px]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-6">
                {/* Left: Title and Status */}
                <div className="space-y-1 flex-shrink-0">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-base">
                    <DollarSign className="h-5 w-5" />
                    Tournament Payment
                  </CardTitle>
                  {tournament.paymentStatus === 'paid' ? (
                    <Badge variant="default" className="bg-green-600 flex items-center gap-1 w-fit" data-testid="badge-payment-paid">
                      <CheckCheck className="h-3 w-3" />
                      Paid
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500 text-amber-600 flex items-center gap-1 w-fit" data-testid="badge-payment-pending">
                      <Clock className="h-3 w-3" />
                      Pending
                    </Badge>
                  )}
                </div>

                {/* Right: Info Boxes - Stack on mobile, flex on desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto md:flex md:gap-3">
                  {/* Tournament ID */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                    <div className="mr-2 min-w-0">
                      <p className="text-xs text-muted-foreground">ID</p>
                      <p className="text-sm md:text-base font-semibold font-mono truncate" data-testid="text-tournament-id">{tournament.uniqueTournamentId}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(tournament.uniqueTournamentId || '');
                        setCopiedTournamentId(true);
                        setTimeout(() => setCopiedTournamentId(false), 2000);
                        toast({
                          title: "Copied!",
                          description: "Tournament ID copied to clipboard"
                        });
                      }}
                      data-testid="button-copy-id"
                    >
                      {copiedTournamentId ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>

                  {/* Teams */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                    <div className="mr-2">
                      <p className="text-xs text-muted-foreground">Teams</p>
                      <p className="text-sm md:text-base font-semibold" data-testid="text-team-count">{teams?.length || 0}</p>
                    </div>
                    <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>

                  {/* Payment Amount */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                    <div className="mr-2">
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className="text-sm md:text-base font-semibold" data-testid="text-payment-amount">
                        ${((tournament.paymentAmount || 0) / 100).toFixed(2)}
                      </p>
                    </div>
                    {tournament.paymentStatus !== 'paid' ? (
                      <Button
                        onClick={() => paymentMutation.mutate()}
                        disabled={paymentMutation.isPending || (teams?.length || 0) === 0}
                        size="sm"
                        className="h-8 px-2 flex-shrink-0 text-xs"
                        data-testid="button-pay-now"
                      >
                        {paymentMutation.isPending ? 'Processing...' : 'Pay'}
                      </Button>
                    ) : (
                      <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                </div>
              </div>

              {tournament.paymentStatus !== 'paid' && (teams?.length || 0) === 0 && (
                <p className="text-xs text-muted-foreground mt-3">Add teams to calculate payment amount</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 pt-[2px] pb-[2px] pl-[8px] pr-[8px]">
        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className={`grid w-full ${isReadOnlyMode ? 'grid-cols-2' : 'grid-cols-3'} md:w-auto`}>
            <TabsTrigger value="bracket" data-testid="tab-bracket">Bracket</TabsTrigger>
            {!isReadOnlyMode && (
              <TabsTrigger value="teams" data-testid="tab-teams">Teams</TabsTrigger>
            )}
            <TabsTrigger value="schedule" data-testid="tab-schedule">Schedule</TabsTrigger>
          </TabsList>

          {/* Bracket Tab */}
          <TabsContent value="bracket" className="space-y-4">
            {(matches && matches.length > 0) || 
             tournament.format === 'custom_bracket' ||
             (tournament.status === 'draft' && ['single_elimination', 'double_elimination', 'three_game_guarantee', 'round_robin_split'].includes(tournament.format)) ? (
              <div className="space-y-6">
                {/* Round Robin + Playoffs Seeding Button */}
                {tournament.format === 'round_robin_split' && (() => {
                  const roundRobinMatches = (matches || []).filter(m => m.round === 'Round Robin');
                  const playoffMatches = (matches || []).filter(m => m.round !== 'Round Robin');
                  const playoffsSeeded = playoffMatches.some(m => m.team1Id !== null && m.team2Id !== null);
                  const allRRCompleted = roundRobinMatches.length > 0 && roundRobinMatches.every(m => m.status === 'completed');
                  
                  return !playoffsSeeded && allRRCompleted && (
                    <Card className="border-primary/50">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Trophy className="h-5 w-5 text-primary" />
                          Seed Playoffs
                        </CardTitle>
                        <CardDescription>
                          All Round Robin games are complete. Seed the playoff bracket based on standings (wins/losses, with goals scored as tiebreaker).
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button 
                          onClick={async () => {
                            try {
                              await apiRequest('POST', `/api/tournaments/${tournamentId}/seed-playoffs`);
                              // Invalidate cache to refresh matches
                              queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'matches'] });
                              queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
                              toast({
                                title: "Success",
                                description: "Playoffs seeded successfully based on Round Robin standings"
                              });
                            } catch (error) {
                              console.error('Failed to seed playoffs:', error);
                              toast({
                                title: "Error",
                                description: "Failed to seed playoffs. Make sure Round Robin matches are completed.",
                                variant: "destructive"
                              });
                            }
                          }}
                          data-testid="button-seed-playoffs"
                        >
                          Seed Playoff Bracket Now
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })()}
                
                {tournament.format === 'custom_bracket' ? (
                  // Custom bracket builder embedded
                  (<Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Custom Bracket</CardTitle>
                        <CardDescription>
                          {isBracketLocked && !isEditingBracket ? 'Your custom tournament structure is locked' : 'Design your own tournament bracket structure'}
                        </CardDescription>
                      </div>
                      {!isReadOnlyMode && (
                        <div className="flex gap-2">
                          {tournament.status === 'draft' && isBracketLocked && !isEditingBracket && (
                            <Button
                              onClick={() => setIsEditingBracket(true)}
                              data-testid="button-unlock-bracket"
                              variant="outline"
                              className="gap-2"
                            >
                              <Edit className="h-4 w-4" />
                              Edit Bracket
                            </Button>
                          )}
                          {isBracketLocked && tournament.leagueId && canManageLeagueSpecific(tournament.leagueId) && (
                            <Button
                              onClick={() => toggleVisibilityMutation.mutate(!tournament.isVisibleToLeague)}
                              variant={tournament.isVisibleToLeague ? "default" : "outline"}
                              size="sm"
                              className="gap-2"
                              disabled={toggleVisibilityMutation.isPending}
                              data-testid="button-toggle-visibility-custom"
                            >
                              {tournament.isVisibleToLeague ? (
                                <>
                                  <EyeOff className="h-4 w-4" />
                                  Hide from League
                                </>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4" />
                                  Make Visible to League
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <CustomBracketBuilder
                        teams={teams || []}
                        tournamentId={tournamentId}
                        tournament={tournament}
                        embeddable={true}
                        locked={tournament.status !== 'draft' || (isBracketLocked && !isEditingBracket)}
                        onSave={async (bracketData) => {
                          try {
                            // Set locked to true when saving
                            const bracketWithLock = {
                              ...bracketData,
                              locked: true
                            };
                            
                            // Save bracket to backend
                            const updatedSettings = {
                              ...(tournament.settings as any || {}),
                              customBracket: bracketWithLock
                            };
                            
                            await apiRequest('PATCH', `/api/tournaments/${tournamentId}`, {
                              settings: updatedSettings
                            });
                            
                            // Refresh tournament data
                            await queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
                            
                            setIsEditingBracket(false);
                            
                            toast({
                              title: "Bracket saved",
                              description: "Your custom bracket has been saved and locked"
                            });
                          } catch (error) {
                            toast({
                              title: "Error",
                              description: "Failed to save bracket",
                              variant: "destructive"
                            });
                            throw error; // Rethrow so CustomBracketBuilder knows save failed
                          }
                        }}
                        onLock={() => setIsEditingBracket(false)}
                      />
                    </CardContent>
                  </Card>)
                ) : (tournament.format === 'single_elimination' || 
                  tournament.format === 'double_elimination' || 
                  tournament.format === 'three_game_guarantee' ||
                  tournament.format === 'round_robin_split') ? (
                  // Bracket visualization for elimination formats and Round Robin + Playoffs
                  ((() => {
                    // For Round Robin + Playoffs, only show playoff matches in the bracket
                    const bracketMatches = tournament.format === 'round_robin_split' 
                      ? (matches || []).filter(m => m.round !== 'Round Robin')
                      : (matches || []);
                    
                    const playoffRounds = tournament.format === 'round_robin_split'
                      ? rounds.filter(r => r !== 'Round Robin')
                      : rounds;

                    // Show CustomBracketBuilder when editing, BracketView when viewing
                    if (isEditingBracket && tournament.status === 'draft') {
                      return (
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                              <CardTitle>Edit Bracket</CardTitle>
                              <CardDescription>
                                Add, remove, or modify matches. Click "Save Bracket" when done.
                              </CardDescription>
                            </div>
                            <Button
                              onClick={() => setIsEditingBracket(false)}
                              variant="outline"
                              size="sm"
                              data-testid="button-cancel-edit-bracket"
                            >
                              Cancel
                            </Button>
                          </CardHeader>
                          <CardContent>
                            <CustomBracketBuilder
                              teams={teams || []}
                              tournamentId={tournamentId}
                              tournament={tournament}
                              embeddable={true}
                              locked={false}
                              initialMatches={bracketMatches}
                              onSave={async (bracketData) => {
                                try {
                                  const bracketWithLock = {
                                    ...bracketData,
                                    locked: true
                                  };
                                  
                                  const updatedSettings = {
                                    ...(tournament.settings as any || {}),
                                    customBracket: bracketWithLock
                                  };
                                  
                                  await apiRequest('PATCH', `/api/tournaments/${tournamentId}`, {
                                    settings: updatedSettings
                                  });
                                  
                                  await queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId] });
                                  await queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'matches'] });
                                  
                                  setIsEditingBracket(false);
                                  
                                  toast({
                                    title: "Bracket saved",
                                    description: "Your bracket changes have been saved"
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Error",
                                    description: "Failed to save bracket",
                                    variant: "destructive"
                                  });
                                  throw error;
                                }
                              }}
                              onLock={() => setIsEditingBracket(false)}
                            />
                          </CardContent>
                        </Card>
                      );
                    }

                    return (
                      <Card>
                        <CardHeader className="pt-[2px] pb-[2px] flex flex-row items-center justify-between">
                          <div>
                            <CardTitle>
                              {tournament.format === 'round_robin_split' ? 'Playoff Bracket' : 'Tournament Bracket'}
                            </CardTitle>
                            <CardDescription>
                              {playoffRounds.length} round{playoffRounds.length !== 1 ? 's' : ''} • {bracketMatches.length} match{bracketMatches.length !== 1 ? 'es' : ''}
                              {tournament.format === 'round_robin_split' && (
                                <span className="block mt-1 text-xs">
                                  Playoff seeding based on Round Robin record (wins/losses) with goals scored as tiebreaker
                                </span>
                              )}
                              {tournament.isVisibleToLeague && (
                                <span className="block mt-1 text-xs text-green-600 dark:text-green-400">
                                  Visible to all league members
                                </span>
                              )}
                            </CardDescription>
                          </div>
                          {!isReadOnlyMode && (
                            <div className="flex gap-2">
                              {tournament.status === 'draft' && (
                                <Button
                                  onClick={() => setIsEditingBracket(true)}
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  data-testid="button-edit-bracket"
                                >
                                  <Edit className="h-4 w-4" />
                                  Edit Bracket
                                </Button>
                              )}
                              {tournament.leagueId && canManageLeagueSpecific(tournament.leagueId) && (
                                <Button
                                  onClick={() => toggleVisibilityMutation.mutate(!tournament.isVisibleToLeague)}
                                  variant={tournament.isVisibleToLeague ? "default" : "outline"}
                                  size="sm"
                                  className="gap-2"
                                  disabled={toggleVisibilityMutation.isPending}
                                  data-testid="button-toggle-visibility"
                                >
                                  {tournament.isVisibleToLeague ? (
                                    <>
                                      <EyeOff className="h-4 w-4" />
                                      Hide from League
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="h-4 w-4" />
                                      Make Visible to League
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          )}
                        </CardHeader>
                        <CardContent>
                          <BracketView 
                            matches={bracketMatches} 
                            teams={teams || []} 
                            format={tournament.format}
                            settings={tournament.settings as TournamentSettings | undefined}
                            tournamentName={tournament.name}
                            tournamentId={tournamentId || ''}
                            isCommissioner={!isReadOnlyMode && tournament.leagueId ? canManageLeagueSpecific(tournament.leagueId) : false}
                            tournamentType={tournament.type}
                          />
                        </CardContent>
                      </Card>
                    );
                  })())
                ) : (
                  // Table view for pure round robin
                  (<Card>
                    <CardHeader>
                      <CardTitle>Round Robin Schedule</CardTitle>
                      <CardDescription>
                        {(matches || []).length} match{(matches || []).length !== 1 ? 'es' : ''}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(matches || []).map((match) => (
                          <Card key={match.id} data-testid={`card-match-${match.matchNumber}`}>
                            <CardContent className="p-4">
                              <div className="flex flex-col md:flex-row md:items-center gap-4">
                                <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                                  <div className="text-right font-medium" data-testid={`text-team1-${match.matchNumber}`}>
                                    {getTeamName(match.team1Id)}
                                  </div>
                                  <div className="text-center">
                                    {match.team1Score !== null && match.team2Score !== null ? (
                                      <span className="font-bold text-lg">
                                        {match.team1Score} - {match.team2Score}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">vs</span>
                                    )}
                                  </div>
                                  <div className="font-medium" data-testid={`text-team2-${match.matchNumber}`}>
                                    {getTeamName(match.team2Id)}
                                  </div>
                                </div>
                                <Badge variant={match.status === 'completed' ? 'default' : 'outline'}>
                                  {match.status}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>)
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Trophy className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Matches Yet</h3>
                  <p className="text-muted-foreground">
                    Matches will appear here once the tournament bracket is generated
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="teams" className="space-y-6">
            {/* CSV Upload Section - Tournament Manager Only */}
            {tournament && canManageTournament() && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Import Teams & Players
                  </CardTitle>
                  <CardDescription>
                    Upload a CSV file to bulk import teams and players to the tournament
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-md">
                    <p className="text-sm font-medium mb-2">CSV Template Format:</p>
                    <p className="text-sm text-muted-foreground mb-1">
                      <span className="font-medium">Required:</span> Player Full Name, Team Name
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">
                      <span className="font-medium">Optional:</span> Email, Phone Number, Jersey #, Position, Skill Level, Player Type (Goalie/Skater)
                    </p>
                    <p className="text-xs text-muted-foreground italic mb-3">
                      Teams will be auto-created if they don't exist. User accounts will be created for players with emails.
                    </p>
                    <a
                      href="/player-import-template.csv"
                      download="player-import-template.csv"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      data-testid="link-download-template"
                    >
                      <Download className="h-4 w-4" />
                      Download CSV Template
                    </a>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvUpload}
                      disabled={isUploadingCsv}
                      className="hidden"
                      id="csv-upload"
                      data-testid="input-csv-upload"
                    />
                    <label htmlFor="csv-upload">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploadingCsv}
                        onClick={() => document.getElementById('csv-upload')?.click()}
                        data-testid="button-csv-upload"
                        className="w-full"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {isUploadingCsv ? 'Uploading...' : 'Upload CSV'}
                      </Button>
                    </label>
                    {csvFile && (
                      <p className="text-sm text-muted-foreground">
                        Selected: {csvFile.name}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pending Participants - Tournament Manager Only */}
            {tournament && canManageTournament() && pendingParticipants && pendingParticipants.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Pending Join Requests
                  </CardTitle>
                  <CardDescription>
                    {pendingParticipants.length} player{pendingParticipants.length !== 1 ? 's' : ''} waiting for approval
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingParticipants.map((participant: any) => (
                      <Card key={participant.id} data-testid={`card-participant-${participant.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <div className="font-medium" data-testid={`text-participant-name-${participant.id}`}>
                                {participant.user.firstName} {participant.user.lastName}
                              </div>
                              <div className="text-sm text-muted-foreground" data-testid={`text-participant-email-${participant.id}`}>
                                {participant.user.email}
                              </div>
                              {participant.message && (
                                <div className="text-sm text-muted-foreground mt-2">
                                  Message: {participant.message}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                Requested {format(new Date(participant.joinedAt), 'MMM d, yyyy')}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedParticipantToMerge(participant);
                                  setShowMergeModal(true);
                                }}
                                data-testid={`button-merge-${participant.id}`}
                              >
                                <User className="h-4 w-4 mr-1" />
                                Merge
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveParticipantMutation.mutate({ participantId: participant.id })}
                                disabled={approveParticipantMutation.isPending}
                                data-testid={`button-approve-${participant.id}`}
                              >
                                <UserCheck className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => rejectParticipantMutation.mutate(participant.id)}
                                disabled={rejectParticipantMutation.isPending}
                                data-testid={`button-reject-${participant.id}`}
                              >
                                <UserX className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Teams List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {selectedTeam ? selectedTeam.teamName : 'Participating Teams'}
                    </CardTitle>
                    <CardDescription>
                      {selectedTeam 
                        ? `${teamPlayers?.length || 0} player${teamPlayers?.length !== 1 ? 's' : ''}`
                        : `${teams?.length || 0} team${teams?.length !== 1 ? 's' : ''} registered`
                      }
                    </CardDescription>
                  </div>
                  {selectedTeam && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTeam(null)}
                      data-testid="button-back-to-teams"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back to Teams
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedTeam ? (
                  // Teams List View
                  (teams && teams.length > 0 ? (<div className="space-y-3">
                    {teams.map((team, index) => {
                      // Count players for this team (we don't have this data in teams list, but we can show seed)
                      return (
                        <div
                          key={team.id}
                          className="flex items-center justify-between p-4 rounded-lg border bg-background hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedTeam(team)}
                          data-testid={`team-${team.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="font-medium text-base" data-testid={`text-team-name-${team.id}`}>
                                {team.teamName}
                              </p>
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p>Seed: #{team.seed || index + 1}</p>
                              <p>Click to view players</p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>) : (<div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No teams added yet</p>
                    {tournament && canManageTournament() && (
                      <p className="text-sm mt-1">Upload a CSV file to add teams and players</p>
                    )}
                  </div>))
                ) : (
                  // Team Detail View - Show Players in Selected Team
                  (teamPlayersLoading ? (<div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-sm text-muted-foreground">Loading players...</p>
                    </div>
                  </div>) : teamPlayersError ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                      <p className="text-destructive font-medium">Error loading players</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {(teamPlayersError as any)?.message || "Failed to fetch team players"}
                      </p>
                    </div>
                  ) : teamPlayers && teamPlayers.length > 0 ? (
                    <div className="space-y-3">
                      {teamPlayers.map((player: any) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between p-3 bg-background rounded-lg border hover:bg-muted/50 transition-colors"
                          data-testid={`team-player-${player.userId}`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            {/* Profile Picture */}
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                              {player.profileImageUrl ? (
                                <img
                                  src={player.profileImageUrl}
                                  alt={`${player.lastName}, ${player.firstName}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-6 h-6 text-muted-foreground" />
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">
                                  {player.lastName && player.firstName 
                                    ? `${player.lastName}, ${player.firstName}`
                                    : player.fullName || player.email
                                  }
                                </p>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <p>{player.email}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No players assigned to this team yet</p>
                      <p className="text-sm text-muted-foreground mt-2">Players will appear here once they join the tournament</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Match Schedule
                    </CardTitle>
                    <CardDescription>
                      View and manage all tournament matches
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportScheduleToPDF()}
                    disabled={isExportingSchedule}
                    data-testid="button-download-schedule-pdf"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {isExportingSchedule ? 'Exporting...' : 'Download PDF'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {matches && matches.length > 0 ? (
                    matches
                      .sort((a, b) => a.matchNumber - b.matchNumber)
                      .map((match) => {
                        const team1Name = getTeamName(match.team1Id);
                        const team2Name = getTeamName(match.team2Id);
                        
                        return (
                          <Card key={match.id} data-testid={`card-schedule-${match.matchNumber}`}>
                            <CardContent className="p-4">
                              <div className="flex flex-col gap-3">
                                {/* Header Row */}
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="font-semibold">
                                      Match {match.matchNumber} - {match.round}
                                    </div>
                                    <div className="text-sm font-medium">
                                      {team1Name} vs {team2Name}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={match.status === 'completed' ? 'default' : 'outline'}>
                                      {match.status}
                                    </Badge>
                                    {tournament && tournament.leagueId && canManageLeagueSpecific(tournament.leagueId) && (
                                      <Button 
                                        size="sm" 
                                        variant="default" 
                                        onClick={() => setScoringMatchId(match.id)}
                                        data-testid={`button-score-match-${match.matchNumber}`}
                                      >
                                        <Edit3 className="h-3.5 w-3.5 mr-1" />
                                        Score
                                      </Button>
                                    )}
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => setEditingMatch(match)}
                                      data-testid={`button-edit-match-${match.matchNumber}`}
                                    >
                                      Edit
                                    </Button>
                                  </div>
                                </div>
                                
                                {/* Schedule Info Row */}
                                <div className="flex flex-col md:flex-row gap-3 text-sm text-muted-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="h-4 w-4" />
                                    {match.scheduledTime ? (
                                      <span data-testid={`text-scheduled-time-${match.matchNumber}`}>
                                        {format(new Date(match.scheduledTime), "MMM d, yyyy 'at' h:mm a")}
                                      </span>
                                    ) : (
                                      <span className="italic">Not scheduled</span>
                                    )}
                                  </div>
                                  {match.location && (
                                    <div className="flex items-center gap-1.5">
                                      <MapPin className="h-4 w-4" />
                                      <span data-testid={`text-location-${match.matchNumber}`}>{match.location}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No matches scheduled yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Tournament Announcement Modal */}
      <CreateTournamentAnnouncementModal
        isOpen={showCreateAnnouncementModal}
        onClose={() => setShowCreateAnnouncementModal(false)}
        tournamentId={tournamentId!}
        canPost={canManageTournament()}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tournament?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{tournament?.name}"? This action cannot be undone.
              All matches, teams, and tournament data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Tournament"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Additional Team Payment Dialog */}
      <AlertDialog open={!!additionalPaymentRequired} onOpenChange={(open) => !open && setAdditionalPaymentRequired(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Additional Payment Required</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Your CSV contains {additionalPaymentRequired?.additionalTeamsCount} new team{(additionalPaymentRequired?.additionalTeamsCount || 0) > 1 ? 's' : ''} that haven't been paid for:
              </p>
              <ul className="list-disc pl-5 text-sm">
                {additionalPaymentRequired?.newTeamsDetected.slice(0, 5).map((team, i) => (
                  <li key={i}>{team}</li>
                ))}
                {(additionalPaymentRequired?.newTeamsDetected.length || 0) > 5 && (
                  <li>...and {(additionalPaymentRequired?.newTeamsDetected.length || 0) - 5} more</li>
                )}
              </ul>
              <p className="font-medium">
                Additional fee: ${((additionalPaymentRequired?.additionalFee || 0) / 100).toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground">
                After payment, you can re-upload the CSV to add these teams.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-additional-payment">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAdditionalTeamPayment}
              disabled={isProcessingAdditionalPayment}
              data-testid="button-pay-additional-teams"
            >
              {isProcessingAdditionalPayment ? "Processing..." : "Pay Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Match Edit Dialog */}
      {editingMatch && (
        <MatchEditDialog
          match={editingMatch}
          open={!!editingMatch}
          onOpenChange={(open) => !open && setEditingMatch(null)}
          team1Name={getTeamName(editingMatch.team1Id)}
          team2Name={getTeamName(editingMatch.team2Id)}
        />
      )}

      {/* Tournament Match Score Modal */}
      {scoringMatchId && tournamentId && (
        <TournamentMatchScoreModal
          tournamentId={tournamentId}
          matchId={scoringMatchId}
          open={!!scoringMatchId}
          onOpenChange={(open) => !open && setScoringMatchId(null)}
          isCommissioner={!!tournament && !!tournament.leagueId && canManageLeagueSpecific(tournament.leagueId)}
        />
      )}
      
      {/* Merge Participant Modal */}
      {showMergeModal && selectedParticipantToMerge && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Merge Participant</h3>
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setSelectedParticipantToMerge(null);
                  setTargetUserId('');
                  setTargetUserEmail('');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <UserX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="font-medium">Source Participant:</p>
                <p className="text-sm text-muted-foreground">
                  {selectedParticipantToMerge.user.firstName} {selectedParticipantToMerge.user.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedParticipantToMerge.user.email}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium">Target User ID</label>
                <input
                  type="text"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  placeholder="e.g., 47231827"
                  className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-merge-target-user-id"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the user ID of the account to merge with
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium">Target User Email (Optional)</label>
                <input
                  type="email"
                  value={targetUserEmail}
                  onChange={(e) => setTargetUserEmail(e.target.value)}
                  placeholder="e.g., user@example.com"
                  className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-merge-target-user-email"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Enter email for verification
                </p>
              </div>
              
              <div className="pt-4 border-t border-border">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowMergeModal(false);
                      setSelectedParticipantToMerge(null);
                      setTargetUserId('');
                      setTargetUserEmail('');
                    }}
                    className="flex-1 bg-muted text-muted-foreground px-4 py-2 rounded-lg hover:bg-muted/80 font-medium"
                    data-testid="button-cancel-merge"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!targetUserId.trim()) {
                        toast({
                          title: "Error",
                          description: "Please enter a target user ID.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      try {
                        const response = await apiRequest('POST', `/api/tournaments/${tournamentId}/merge-participant`, {
                          fromUserId: selectedParticipantToMerge.userId,
                          toUserId: targetUserId.trim()
                        });
                        
                        if (response.ok) {
                          toast({
                            title: "Success",
                            description: "Participant merged successfully!",
                          });
                          
                          // Invalidate queries to refresh the data
                          await queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'participants', 'pending'] });
                          await queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'teams'] });
                          
                          setShowMergeModal(false);
                          setSelectedParticipantToMerge(null);
                          setTargetUserId('');
                          setTargetUserEmail('');
                        } else {
                          const error = await response.json();
                          toast({
                            title: "Error",
                            description: error.message || "Failed to merge participants.",
                            variant: "destructive",
                          });
                        }
                      } catch (error) {
                        console.error('Merge error:', error);
                        toast({
                          title: "Error",
                          description: "Failed to merge participants. Please try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={!targetUserId.trim()}
                    className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary font-medium disabled:opacity-50"
                    data-testid="button-confirm-merge"
                  >
                    Merge Participants
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

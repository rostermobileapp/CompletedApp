import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus, X, Check, ChevronLeft, ChevronRight, Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;
}

interface UploadedPhoto {
  id: string;
  url: string;
  fileName: string;
}

interface PhotoTaggingDialogProps {
  open: boolean;
  onClose: () => void;
  photos: UploadedPhoto[];
  context: 'tournament' | 'league';
  contextId: string;
  availableUsers: User[];
}

export function PhotoTaggingDialog({
  open,
  onClose,
  photos,
  context,
  contextId,
  availableUsers,
}: PhotoTaggingDialogProps) {
  const { toast } = useToast();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [photoTags, setPhotoTags] = useState<Record<string, string[]>>({});

  const currentPhoto = photos[currentPhotoIndex];

  // Helper to invalidate tag queries immediately
  const invalidateTagQueries = (photoId: string) => {
    // Invalidate per-photo tag query (used by PhotoViewer)
    if (context === 'tournament') {
      queryClient.invalidateQueries({ queryKey: [`/api/tournament-photos/${photoId}/tags`] });
      queryClient.invalidateQueries({ queryKey: [`/api/tournaments/${contextId}/photos/tags-batch`] });
    } else {
      queryClient.invalidateQueries({ queryKey: [`/api/league-photos/${photoId}/tags`] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${contextId}/photos/tags-batch`] });
    }
  };

  // Add tag mutation
  const addTagMutation = useMutation({
    mutationFn: async ({ photoId, userId }: { photoId: string; userId: string }) => {
      const endpoint = context === 'tournament'
        ? `/api/tournament-photos/${photoId}/tags`
        : `/api/league-photos/${photoId}/tags`;
      const response = await apiRequest('POST', endpoint, { taggedUserIds: [userId] });
      return response.json();
    },
    onSuccess: (_, { photoId, userId }) => {
      setPhotoTags(prev => ({
        ...prev,
        [photoId]: [...(prev[photoId] || []), userId]
      }));
      // Immediately invalidate caches so other components see the change
      invalidateTagQueries(photoId);
    },
    onError: () => {
      toast({ title: 'Failed to tag user', variant: 'destructive' });
    },
  });

  // Remove tag mutation
  const removeTagMutation = useMutation({
    mutationFn: async ({ photoId, userId }: { photoId: string; userId: string }) => {
      const endpoint = context === 'tournament'
        ? `/api/tournament-photos/${photoId}/tags/${userId}`
        : `/api/league-photos/${photoId}/tags/${userId}`;
      const response = await apiRequest('DELETE', endpoint);
      return response.json();
    },
    onSuccess: (_, { photoId, userId }) => {
      setPhotoTags(prev => ({
        ...prev,
        [photoId]: (prev[photoId] || []).filter(id => id !== userId)
      }));
      // Immediately invalidate caches so other components see the change
      invalidateTagQueries(photoId);
    },
    onError: () => {
      toast({ title: 'Failed to remove tag', variant: 'destructive' });
    },
  });

  const handleClose = () => {
    // Invalidate photo tags cache when closing
    if (context === 'tournament') {
      queryClient.invalidateQueries({ queryKey: [`/api/tournaments/${contextId}/photos/tags-batch`] });
    } else {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${contextId}/photos/tags-batch`] });
    }
    setCurrentPhotoIndex(0);
    setTagSearchQuery("");
    setPhotoTags({});
    onClose();
  };

  const goToNext = () => {
    if (currentPhotoIndex < photos.length - 1) {
      setCurrentPhotoIndex(prev => prev + 1);
      setTagSearchQuery("");
    }
  };

  const goToPrevious = () => {
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(prev => prev - 1);
      setTagSearchQuery("");
    }
  };

  // Get currently tagged user IDs for the current photo
  const currentPhotoTaggedIds = currentPhoto ? (photoTags[currentPhoto.id] || []) : [];

  // Filter available users for tagging
  const filteredUsers = useMemo(() => {
    return availableUsers.filter(user => {
      const isTagged = currentPhotoTaggedIds.includes(user.id);
      const matchesSearch = tagSearchQuery === "" || 
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(tagSearchQuery.toLowerCase());
      return !isTagged && matchesSearch;
    });
  }, [availableUsers, currentPhotoTaggedIds, tagSearchQuery]);

  // Get tagged users with full info
  const taggedUsers = currentPhotoTaggedIds.map(userId => 
    availableUsers.find(u => u.id === userId)
  ).filter(Boolean) as User[];

  if (!currentPhoto) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Tag People in Photos
          </DialogTitle>
          <DialogDescription>
            Tag people who appear in your uploaded photos. You can skip this step or add tags later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Photo Navigation */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Photo {currentPhotoIndex + 1} of {photos.length}</span>
            <span className="text-xs">{currentPhoto.fileName}</span>
          </div>

          {/* Photo Preview with Navigation */}
          <div className="relative flex-shrink-0 h-48 bg-muted rounded-lg overflow-hidden">
            <img
              src={currentPhoto.url}
              alt={currentPhoto.fileName}
              className="w-full h-full object-contain"
              data-testid="tagging-photo-preview"
            />
            
            {/* Navigation Arrows */}
            {photos.length > 1 && (
              <>
                {currentPhotoIndex > 0 && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={goToPrevious}
                    data-testid="button-tagging-previous"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                {currentPhotoIndex < photos.length - 1 && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={goToNext}
                    data-testid="button-tagging-next"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Tagged Users */}
          {taggedUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Tagged in this photo:</p>
              <div className="flex flex-wrap gap-2">
                {taggedUsers.map((user) => (
                  <Badge 
                    key={user.id} 
                    variant="secondary"
                    className="flex items-center gap-1 pr-1"
                  >
                    <Tag className="h-3 w-3" />
                    <span>{user.firstName} {user.lastName}</span>
                    <button
                      onClick={() => removeTagMutation.mutate({ photoId: currentPhoto.id, userId: user.id })}
                      className="ml-1 p-0.5 rounded hover:bg-destructive/20"
                      disabled={removeTagMutation.isPending}
                      data-testid={`button-remove-tag-${user.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Search and Tag Users */}
          <div className="space-y-2 flex-1 min-h-0 flex flex-col">
            <Input
              placeholder="Search people to tag..."
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              className="flex-shrink-0"
              data-testid="input-tagging-search"
            />
            
            <ScrollArea className="flex-1 min-h-0 max-h-32 border rounded-md">
              <div className="p-2 space-y-1">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => addTagMutation.mutate({ photoId: currentPhoto.id, userId: user.id })}
                      disabled={addTagMutation.isPending}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent text-left transition-colors"
                      data-testid={`button-tag-user-${user.id}`}
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {user.firstName?.[0]}{user.lastName?.[0]}
                      </div>
                      <span className="text-sm truncate">{user.firstName} {user.lastName}</span>
                      {addTagMutation.isPending && (
                        <Loader2 className="h-4 w-4 ml-auto animate-spin flex-shrink-0" />
                      )}
                    </button>
                  ))
                ) : tagSearchQuery ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">
                    No matching people found
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground py-2 text-center">
                    {taggedUsers.length > 0 ? 'All available members are tagged' : 'Start typing to search for people to tag'}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Photo Indicators */}
          {photos.length > 1 && (
            <div className="flex justify-center gap-1">
              {photos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentPhotoIndex(idx);
                    setTagSearchQuery("");
                  }}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentPhotoIndex ? 'bg-primary w-4' : 'bg-muted-foreground/30 w-2'
                  }`}
                  data-testid={`button-photo-indicator-${idx}`}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={handleClose} data-testid="button-skip-tagging">
            {Object.keys(photoTags).length > 0 ? 'Done' : 'Skip'}
          </Button>
          {currentPhotoIndex < photos.length - 1 && (
            <Button onClick={goToNext} data-testid="button-next-photo-tagging">
              Next Photo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

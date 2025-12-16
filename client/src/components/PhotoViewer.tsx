import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, UserPlus, Tag, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Photo {
  url: string;
  caption?: string;
  uploader?: string;
  id?: string;
  uploadedBy?: string;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;
}

interface PhotoViewerProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  context?: 'tournament' | 'league';
  contextId?: string;
  currentUserId?: string;
  availableUsers?: User[];
}

export function PhotoViewer({ 
  photos, 
  initialIndex, 
  onClose,
  context,
  contextId,
  currentUserId,
  availableUsers = []
}: PhotoViewerProps) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialScale, setInitialScale] = useState(1);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPhoto = photos[currentIndex];
  const canTag = context && contextId && currentPhoto?.id && currentUserId;

  // Fetch current tags for the photo
  const { data: photoTags = [], refetch: refetchTags } = useQuery<{ userId: string; user?: User }[]>({
    queryKey: context === 'tournament' 
      ? [`/api/tournament-photos/${currentPhoto?.id}/tags`]
      : [`/api/league-photos/${currentPhoto?.id}/tags`],
    enabled: !!currentPhoto?.id && !!context,
  });

  // Add tag mutation
  const addTagMutation = useMutation({
    mutationFn: async (userId: string) => {
      const endpoint = context === 'tournament'
        ? `/api/tournament-photos/${currentPhoto?.id}/tags`
        : `/api/league-photos/${currentPhoto?.id}/tags`;
      const response = await apiRequest('POST', endpoint, { taggedUserIds: [userId] });
      return response.json();
    },
    onSuccess: () => {
      refetchTags();
      // Invalidate batch tags query
      if (context === 'tournament') {
        queryClient.invalidateQueries({ queryKey: [`/api/tournaments/${contextId}/photos/tags-batch`] });
      } else {
        queryClient.invalidateQueries({ queryKey: [`/api/leagues/${contextId}/photos/tags-batch`] });
      }
      toast({ title: 'User tagged successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to tag user', variant: 'destructive' });
    },
  });

  // Remove tag mutation
  const removeTagMutation = useMutation({
    mutationFn: async (userId: string) => {
      const endpoint = context === 'tournament'
        ? `/api/tournament-photos/${currentPhoto?.id}/tags/${userId}`
        : `/api/league-photos/${currentPhoto?.id}/tags/${userId}`;
      const response = await apiRequest('DELETE', endpoint);
      return response.json();
    },
    onSuccess: () => {
      refetchTags();
      // Invalidate batch tags query
      if (context === 'tournament') {
        queryClient.invalidateQueries({ queryKey: [`/api/tournaments/${contextId}/photos/tags-batch`] });
      } else {
        queryClient.invalidateQueries({ queryKey: [`/api/leagues/${contextId}/photos/tags-batch`] });
      }
      toast({ title: 'Tag removed' });
    },
    onError: () => {
      toast({ title: 'Failed to remove tag', variant: 'destructive' });
    },
  });

  // Reset scale and position when photo changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setShowTagPopover(false);
    setTagSearchQuery("");
  }, [currentIndex]);

  // Refetch tags when photo changes
  useEffect(() => {
    if (currentPhoto?.id && context) {
      refetchTags();
    }
  }, [currentIndex, currentPhoto?.id, context, refetchTags]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goToPrevious();
      if (e.key === "ArrowRight") goToNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex]);

  // Prevent body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const goToNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, photos.length]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const getDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchStart({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      });
    } else if (e.touches.length === 2) {
      const distance = getDistance(e.touches[0], e.touches[1]);
      setInitialPinchDistance(distance);
      setInitialScale(scale);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance !== null) {
      e.preventDefault();
      const distance = getDistance(e.touches[0], e.touches[1]);
      const scaleChange = distance / initialPinchDistance;
      const newScale = Math.min(Math.max(initialScale * scaleChange, 1), 4);
      setScale(newScale);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart && e.changedTouches.length === 1) {
      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
        time: Date.now(),
      };

      const dx = touchEnd.x - touchStart.x;
      const dy = touchEnd.y - touchStart.y;
      const dt = touchEnd.time - touchStart.time;

      if (scale === 1) {
        const swipeThreshold = 50;
        const swipeTimeThreshold = 300;

        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > swipeThreshold && dt < swipeTimeThreshold) {
          if (dx > 0) {
            goToPrevious();
          } else {
            goToNext();
          }
        }
      }
    }

    setTouchStart(null);
    setInitialPinchDistance(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.min(Math.max(scale + delta, 1), 4);
    setScale(newScale);
    if (newScale === 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleDoubleTap = () => {
    if (scale === 1) {
      setScale(2);
    } else {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  // Get list of tagged user IDs
  const taggedUserIds = photoTags.map(tag => tag.userId);

  // Filter available users for tagging (excluding already tagged users)
  const filteredUsers = availableUsers.filter(user => {
    const isTagged = taggedUserIds.includes(user.id);
    const matchesSearch = tagSearchQuery === "" || 
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(tagSearchQuery.toLowerCase());
    return !isTagged && matchesSearch;
  });

  // Get tagged users with full info
  const taggedUsers = photoTags.map(tag => {
    const user = availableUsers.find(u => u.id === tag.userId) || tag.user;
    return user ? { ...user, tagId: tag.userId } : null;
  }).filter(Boolean) as (User & { tagId: string })[];

  // Check if current user can remove a tag (uploader or the tagged user themselves)
  const canRemoveTag = (taggedUserId: string) => {
    return currentUserId === currentPhoto?.uploadedBy || currentUserId === taggedUserId;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm"
      data-testid="photo-viewer"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white">
          <p className="text-sm font-medium">
            {currentIndex + 1} / {photos.length}
          </p>
          {currentPhoto.uploader && (
            <p className="text-xs text-white/70">{currentPhoto.uploader}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Tag Button */}
          {canTag && (
            <Popover open={showTagPopover} onOpenChange={setShowTagPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/20"
                  data-testid="button-tag-users"
                >
                  <UserPlus className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">Tag People</h4>
                    <p className="text-sm text-muted-foreground">
                      Select people who appear in this photo
                    </p>
                  </div>
                  
                  {/* Search Input */}
                  <Input
                    placeholder="Search people..."
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    className="h-9"
                    data-testid="input-tag-search"
                  />
                  
                  {/* Tagged Users */}
                  {taggedUsers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Tagged:</p>
                      <div className="flex flex-wrap gap-1">
                        {taggedUsers.map((user) => (
                          <Badge 
                            key={user.id} 
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            <span>{user.firstName} {user.lastName}</span>
                            {canRemoveTag(user.id) && (
                              <button
                                onClick={() => removeTagMutation.mutate(user.id)}
                                className="ml-1 hover:text-destructive"
                                disabled={removeTagMutation.isPending}
                                data-testid={`button-remove-tag-${user.id}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Available Users to Tag */}
                  <ScrollArea className="h-48">
                    <div className="space-y-1">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => (
                          <button
                            key={user.id}
                            onClick={() => addTagMutation.mutate(user.id)}
                            disabled={addTagMutation.isPending}
                            className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent text-left transition-colors"
                            data-testid={`button-tag-user-${user.id}`}
                          >
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                              {user.firstName?.[0]}{user.lastName?.[0]}
                            </div>
                            <span className="text-sm">{user.firstName} {user.lastName}</span>
                            {addTagMutation.isPending && (
                              <Loader2 className="h-4 w-4 ml-auto animate-spin" />
                            )}
                          </button>
                        ))
                      ) : tagSearchQuery ? (
                        <p className="text-sm text-muted-foreground py-2 text-center">
                          No matching people found
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground py-2 text-center">
                          All members are already tagged
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white hover:bg-white/20"
            data-testid="button-close-viewer"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Tagged Users Display (Bottom) */}
      {taggedUsers.length > 0 && (
        <div className="absolute bottom-20 left-0 right-0 z-10 flex flex-wrap justify-center gap-2 px-4">
          {taggedUsers.map((user) => (
            <Badge 
              key={user.id}
              variant="secondary"
              className="bg-black/60 text-white border-white/20"
            >
              <Tag className="h-3 w-3 mr-1" />
              {user.firstName} {user.lastName}
            </Badge>
          ))}
        </div>
      )}

      {/* Main Image Container */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center p-4 md:p-8"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          ref={imageRef}
          src={currentPhoto.url}
          alt={currentPhoto.caption || `Photo ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          onDoubleClick={handleDoubleTap}
          draggable={false}
          data-testid="photo-image"
        />
      </div>

      {/* Navigation Arrows (Desktop) */}
      {currentIndex > 0 && (
        <Button
          variant="ghost"
          size="lg"
          className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-16 w-16 p-0"
          onClick={goToPrevious}
          data-testid="button-previous-photo"
        >
          <ChevronLeft className="h-8 w-8" />
        </Button>
      )}
      {currentIndex < photos.length - 1 && (
        <Button
          variant="ghost"
          size="lg"
          className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-16 w-16 p-0"
          onClick={goToNext}
          data-testid="button-next-photo"
        >
          <ChevronRight className="h-8 w-8" />
        </Button>
      )}

      {/* Caption */}
      {currentPhoto.caption && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-white text-center text-sm md:text-base">
            {currentPhoto.caption}
          </p>
        </div>
      )}

      {/* Touch indicators for mobile */}
      <div className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
        {photos.map((_, idx) => (
          <div
            key={idx}
            className={`h-2 w-2 rounded-full transition-all ${
              idx === currentIndex ? 'bg-white w-4' : 'bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

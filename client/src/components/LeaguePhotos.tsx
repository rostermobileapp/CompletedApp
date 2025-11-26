import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, Download, Trash2, Loader2, Camera, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getImageUrl } from "@/lib/queryClient";
import { EnhancedMediaUploader } from "@/components/EnhancedMediaUploader";
import { PhotoViewer } from "@/components/PhotoViewer";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Wrapper component that auto-triggers the file picker
function AutoOpenMediaUploader({ 
  onClose, 
  ...props 
}: { 
  onClose: () => void;
  maxFiles?: number;
  maxFileSize?: number;
  acceptedTypes?: string[];
  onFilesSelected: (files: any[]) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  useEffect(() => {
    // Auto-click the trigger button when component mounts
    const timer = setTimeout(() => {
      triggerRef.current?.click();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleFilesSelected = (files: any[]) => {
    props.onFilesSelected(files);
    onClose();
  };
  
  return (
    <EnhancedMediaUploader {...props} onFilesSelected={handleFilesSelected}>
      <button 
        ref={triggerRef} 
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      />
    </EnhancedMediaUploader>
  );
}

interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'document';
  compressed?: File;
}

interface LeaguePhoto {
  id: string;
  leagueId: string;
  uploadedBy: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  caption: string | null;
  uploadedAt: string;
  uploader: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
  };
  uploaderTeamId?: string | null;
}

interface LeaguePhotosProps {
  leagueId: string;
  currentUserId?: string;
  showUploader?: boolean;
  onShowUploaderChange?: (show: boolean) => void;
  onUploadStart?: () => void;
  onUploadComplete?: () => void;
}

export function LeaguePhotos({ 
  leagueId, 
  currentUserId, 
  showUploader: externalShowUploader,
  onShowUploaderChange,
  onUploadStart,
  onUploadComplete
}: LeaguePhotosProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [internalShowUploader, setInternalShowUploader] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("all");
  
  // Use external show uploader state if provided, otherwise use internal
  const showUploader = externalShowUploader !== undefined ? externalShowUploader : internalShowUploader;
  const setShowUploader = onShowUploaderChange || setInternalShowUploader;
  
  // Track if we should auto-trigger file picker
  const [shouldAutoTrigger, setShouldAutoTrigger] = useState(false);
  
  useEffect(() => {
    if (showUploader && !shouldAutoTrigger) {
      setShouldAutoTrigger(true);
    } else if (!showUploader && shouldAutoTrigger) {
      setShouldAutoTrigger(false);
    }
  }, [showUploader]);

  // Fetch league data to check if user is commissioner
  const { data: league, isLoading: leagueLoading } = useQuery<any>({
    queryKey: ['/api/leagues', leagueId],
    enabled: !!leagueId,
  });
  
  // Check if current user is an approved league member
  const { data: membership, isLoading: membershipLoading } = useQuery<any>({
    queryKey: [`/api/leagues/${leagueId}/membership`],
    enabled: !!currentUserId,
  });

  const isApprovedMember = currentUserId && membership?.status === 'approved';
  
  // Check if user is the league commissioner (commissioners always have access)
  const isLeagueCommissioner = league && currentUserId && league.commissionerId === currentUserId;
  
  // User is a participant if they are the commissioner OR an approved member
  const isParticipant = isLeagueCommissioner || isApprovedMember;

  // Fetch photos if user has any form of access
  const { data: photos = [], isLoading: photosLoading } = useQuery<LeaguePhoto[]>({
    queryKey: [`/api/league-photos/${leagueId}`],
    enabled: isParticipant,
  });

  // Fetch league teams for filtering
  const { data: leagueTeams = [] } = useQuery<any[]>({
    queryKey: [`/api/leagues/${leagueId}/teams`],
    enabled: !!leagueId,
  });

  // Filter photos by selected team (using uploaderTeamId from photo response)
  const filteredPhotos = useMemo(() => {
    if (selectedTeamFilter === "all") {
      return photos;
    }
    return photos.filter((photo) => photo.uploaderTeamId === selectedTeamFilter);
  }, [photos, selectedTeamFilter]);

  const isLoading = leagueLoading || membershipLoading || photosLoading;

  const uploadPhotoMutation = useMutation({
    mutationFn: async (data: { fileUrl: string; fileName: string; fileSize: number }) => {
      const response = await apiRequest('POST', '/api/league-photos', {
        leagueId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/league-photos/${leagueId}`] });
      toast({ title: 'Photo uploaded successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to upload photo', variant: 'destructive' });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const response = await apiRequest('DELETE', `/api/league-photos/${photoId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/league-photos/${leagueId}`] });
      toast({ title: 'Photo deleted successfully!' });
      setPhotoToDelete(null);
    },
    onError: () => {
      toast({ title: 'Failed to delete photo', variant: 'destructive' });
      setPhotoToDelete(null);
    },
  });

  const handleFilesSelected = async (mediaFiles: MediaFile[]) => {
    if (!isParticipant) {
      toast({ 
        title: 'Permission denied', 
        description: 'Only approved league members can upload photos',
        variant: 'destructive' 
      });
      return;
    }

    setIsUploading(true);
    setShowUploader(false);
    
    // Notify parent upload started
    if (onUploadStart) {
      onUploadStart();
    }

    try {
      for (const mediaFile of mediaFiles) {
        const fileToUpload = mediaFile.compressed || mediaFile.file;
        
        // Request upload URL with file validation
        const uploadResponse = await apiRequest('POST', '/api/league-photos/upload', {
          leagueId,
          fileType: fileToUpload.type,
          fileSize: fileToUpload.size,
        });
        
        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error || 'Failed to get upload URL');
        }
        
        const { uploadURL, path } = await uploadResponse.json();

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

        await uploadPhotoMutation.mutateAsync({
          fileUrl: path,
          fileName: mediaFile.file.name,
          fileSize: mediaFile.file.size,
        });
      }
    } catch (error) {
      console.error('Error uploading photos:', error);
      toast({ title: 'Failed to upload photos', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      
      // Notify parent upload completed
      if (onUploadComplete) {
        onUploadComplete();
      }
    }
  };

  const handleDownloadAll = async () => {
    try {
      const response = await fetch(`/api/league-photos/${leagueId}/download-zip`);
      
      if (!response.ok) {
        throw new Error('Failed to download photos');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `league-${leagueId}-photos.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Photos downloaded successfully!' });
    } catch (error) {
      console.error('Error downloading photos:', error);
      toast({ title: 'Failed to download photos', variant: 'destructive' });
    }
  };

  const canDeletePhoto = (photo: LeaguePhoto) => {
    return currentUserId && photo.uploadedBy === currentUserId;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Defense-in-depth: Even though MediaGalleryPage checks this, verify membership here
  if (!isParticipant) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            You must be an approved member of this league to view photos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Team Filter - Only show when there are photos and teams */}
      {photos.length > 0 && leagueTeams.length > 0 && (
        <div className="sticky top-0 z-20 w-full px-4 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
              <SelectTrigger className="w-full max-w-[200px]" data-testid="select-team-filter">
                <SelectValue placeholder="Filter by team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {leagueTeams.map((team: any) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTeamFilter !== "all" && (
              <span className="text-sm text-muted-foreground">
                ({filteredPhotos.length} {filteredPhotos.length === 1 ? 'photo' : 'photos'})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Photo Grid - Edge to edge, full width */}
      {filteredPhotos.length > 0 ? (
        <div className="grid grid-cols-3 gap-0.5">
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.id}
              className="relative aspect-square group cursor-pointer bg-black"
              data-testid={`photo-${index}`}
              onClick={() => setSelectedPhotoIndex(index)}
            >
              <img
                src={getImageUrl(photo.fileUrl) || ''}
                alt={photo.fileName}
                className="w-full h-full object-contain"
                loading="lazy"
              />
              
              {/* Delete button overlay (only show for photo owner) */}
              {canDeletePhoto(photo) && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoToDelete(photo.id);
                    }}
                    data-testid={`button-delete-photo-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : photos.length > 0 && selectedTeamFilter !== "all" ? (
        <div className="text-center py-20 px-6">
          <Camera className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium text-muted-foreground mb-2">No photos from this team</p>
          <p className="text-sm text-muted-foreground">
            Try selecting a different team or view all photos
          </p>
        </div>
      ) : (
        <div className="text-center py-20 px-6">
          <Camera className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium text-muted-foreground mb-2">No photos yet</p>
          <p className="text-sm text-muted-foreground">
            {isParticipant ? 'Upload photos to share with everyone!' : 'No photos have been uploaded yet'}
          </p>
        </div>
      )}

      {/* Sticky Bottom Action Bar - Download only */}
      {photos.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border p-4 flex gap-2 justify-center z-10">
          <Button
            variant="outline"
            size="lg"
            onClick={handleDownloadAll}
            className="flex-shrink-0"
            data-testid="button-download-all"
          >
            <Download className="h-5 w-5 mr-2" />
            Download All
          </Button>
        </div>
      )}

      {/* Media Uploader Dialog */}
      {showUploader && (
        <AutoOpenMediaUploader
          maxFiles={10}
          maxFileSize={10 * 1024 * 1024}
          acceptedTypes={['image/*']}
          onFilesSelected={handleFilesSelected}
          onClose={() => setShowUploader(false)}
        />
      )}

      {/* Photo Viewer */}
      {selectedPhotoIndex !== null && (
        <PhotoViewer
          photos={filteredPhotos.map((p) => ({
            url: getImageUrl(p.fileUrl) || '',
            caption: p.caption ?? undefined,
            uploader: `${p.uploader.firstName} ${p.uploader.lastName}`,
          }))}
          initialIndex={selectedPhotoIndex}
          onClose={() => setSelectedPhotoIndex(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!photoToDelete} onOpenChange={(open) => !open && setPhotoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the photo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => photoToDelete && deletePhotoMutation.mutate(photoToDelete)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

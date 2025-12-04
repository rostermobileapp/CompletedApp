import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, Trash2, Loader2, Camera, X } from "lucide-react";
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

interface TeamPhoto {
  id: string;
  teamId: string;
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
}

interface TeamPhotosProps {
  teamId: string;
  currentUserId?: string;
  showUploader?: boolean;
  onShowUploaderChange?: (show: boolean) => void;
  onUploadStart?: () => void;
  onUploadComplete?: () => void;
  showOnlyMyPhotos?: boolean;
}

export function TeamPhotos({ 
  teamId, 
  currentUserId, 
  showUploader: externalShowUploader,
  onShowUploaderChange,
  onUploadStart,
  onUploadComplete,
  showOnlyMyPhotos = false
}: TeamPhotosProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [internalShowUploader, setInternalShowUploader] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  
  const showUploader = externalShowUploader !== undefined ? externalShowUploader : internalShowUploader;
  const setShowUploader = onShowUploaderChange || setInternalShowUploader;
  
  const [shouldAutoTrigger, setShouldAutoTrigger] = useState(false);
  
  useEffect(() => {
    if (showUploader && !shouldAutoTrigger) {
      setShouldAutoTrigger(true);
    } else if (!showUploader && shouldAutoTrigger) {
      setShouldAutoTrigger(false);
    }
  }, [showUploader]);

  const { data: photos = [], isLoading } = useQuery<TeamPhoto[]>({
    queryKey: [`/api/team-photos/${teamId}`],
  });

  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: [`/api/teams/${teamId}/members`],
  });

  const isTeamMember = currentUserId && teamMembers.some(
    (m) => m.userId === currentUserId
  );

  const filteredPhotos = showOnlyMyPhotos && currentUserId
    ? photos.filter((photo) => photo.uploadedBy === currentUserId)
    : photos;

  const uploadPhotoMutation = useMutation({
    mutationFn: async (data: { fileUrl: string; fileName: string; fileSize: number }) => {
      const response = await apiRequest('POST', '/api/team-photos', {
        teamId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/team-photos/${teamId}`] });
      toast({ title: 'Photo uploaded successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to upload photo', variant: 'destructive' });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const response = await apiRequest('DELETE', `/api/team-photos/${photoId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/team-photos/${teamId}`] });
      toast({ title: 'Photo deleted successfully!' });
      setPhotoToDelete(null);
    },
    onError: () => {
      toast({ title: 'Failed to delete photo', variant: 'destructive' });
      setPhotoToDelete(null);
    },
  });

  const handleFilesSelected = async (mediaFiles: MediaFile[]) => {
    if (!isTeamMember) {
      toast({ 
        title: 'Permission denied', 
        description: 'Only team members can upload photos',
        variant: 'destructive' 
      });
      return;
    }

    setIsUploading(true);
    setShowUploader(false);
    
    if (onUploadStart) {
      onUploadStart();
    }

    try {
      for (const mediaFile of mediaFiles) {
        const fileToUpload = mediaFile.compressed || mediaFile.file;
        
        const uploadResponse = await apiRequest('POST', '/api/team-photos/upload', {
          teamId,
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
      console.error('Upload error:', error);
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive' 
      });
    } finally {
      setIsUploading(false);
      if (onUploadComplete) {
        onUploadComplete();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filteredPhotos.length === 0) {
    return (
      <div className="p-12 text-center">
        <Camera className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No photos yet</h3>
        <p className="text-muted-foreground">
          {showOnlyMyPhotos ? 'You haven\'t uploaded any photos yet.' : 'No photos have been uploaded yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {showUploader && isTeamMember && (
        <AutoOpenMediaUploader
          onClose={() => setShowUploader(false)}
          maxFiles={5}
          acceptedTypes={['image/*', 'video/*']}
          onFilesSelected={handleFilesSelected}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredPhotos.map((photo, index) => (
          <div
            key={photo.id}
            className="group relative bg-muted rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setSelectedPhotoIndex(index)}
            data-testid={`card-photo-${photo.id}`}
          >
            <img
              src={photo.fileUrl}
              alt={photo.fileName}
              className="w-full h-40 object-cover group-hover:opacity-75 transition-opacity"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '';
              }}
            />
            
            {photo.uploadedBy === currentUserId && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoToDelete(photo.id);
                  }}
                  className="h-8 w-8 p-0"
                  data-testid={`button-delete-photo-${photo.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-xs text-white font-medium truncate">
                {photo.uploader?.firstName} {photo.uploader?.lastName}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selectedPhotoIndex !== null && (
        <PhotoViewer
          photos={filteredPhotos.map((p) => ({
            url: getImageUrl(p.fileUrl) || p.fileUrl,
            caption: p.caption ?? undefined,
            uploader: `${p.uploader.firstName} ${p.uploader.lastName}`,
          }))}
          initialIndex={selectedPhotoIndex}
          onClose={() => setSelectedPhotoIndex(null)}
        />
      )}

      <AlertDialog open={!!photoToDelete} onOpenChange={(open) => !open && setPhotoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (photoToDelete) {
                  deletePhotoMutation.mutate(photoToDelete);
                }
              }}
              disabled={deletePhotoMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deletePhotoMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, Download, Trash2, Loader2, Camera, X } from "lucide-react";
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

interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'document';
  compressed?: File;
}

interface TournamentPhoto {
  id: string;
  tournamentId: string;
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

interface TournamentPhotosProps {
  tournamentId: string;
  currentUserId?: string;
}

export function TournamentPhotos({ tournamentId, currentUserId }: TournamentPhotosProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);

  const { data: photos = [], isLoading } = useQuery<TournamentPhoto[]>({
    queryKey: [`/api/tournament-photos/${tournamentId}`],
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (data: { fileUrl: string; fileName: string; fileSize: number }) => {
      const response = await apiRequest('POST', '/api/tournament-photos', {
        tournamentId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tournament-photos/${tournamentId}`] });
      toast({ title: 'Photo uploaded successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to upload photo', variant: 'destructive' });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const response = await apiRequest('DELETE', `/api/tournament-photos/${photoId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tournament-photos/${tournamentId}`] });
      toast({ title: 'Photo deleted successfully!' });
      setPhotoToDelete(null);
    },
    onError: () => {
      toast({ title: 'Failed to delete photo', variant: 'destructive' });
      setPhotoToDelete(null);
    },
  });

  const handleFilesSelected = async (mediaFiles: MediaFile[]) => {
    setIsUploading(true);
    setShowUploader(false);

    try {
      for (const mediaFile of mediaFiles) {
        const uploadResponse = await apiRequest('POST', '/api/tournament-photos/upload');
        const { uploadURL, path } = await uploadResponse.json();

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
    }
  };

  const handleDownloadAll = async () => {
    try {
      const response = await fetch(`/api/tournament-photos/${tournamentId}/download-zip`);
      
      if (!response.ok) {
        throw new Error('Failed to download photos');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament-${tournamentId}-photos.zip`;
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

  const canDeletePhoto = (photo: TournamentPhoto) => {
    return currentUserId && photo.uploadedBy === currentUserId;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <Button
          onClick={() => setShowUploader(true)}
          disabled={isUploading}
          data-testid="button-upload-photos"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload Photos
            </>
          )}
        </Button>

        {photos.length > 0 && (
          <Button
            variant="outline"
            onClick={handleDownloadAll}
            data-testid="button-download-all"
          >
            <Download className="h-4 w-4 mr-2" />
            Download All ({photos.length})
          </Button>
        )}
      </div>

      {/* Photo Grid */}
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-4">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="relative aspect-square group cursor-pointer"
              data-testid={`photo-${index}`}
            >
              <div
                className="w-full h-full rounded-lg overflow-hidden bg-muted"
                onClick={() => setSelectedPhotoIndex(index)}
              >
                <img
                  src={getImageUrl(photo.fileUrl)}
                  alt={photo.fileName}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </div>

              {/* Overlay with delete button */}
              {canDeletePhoto(photo) && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 w-8 p-0"
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

              {/* Uploader info overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs text-white truncate">
                  {photo.uploader.firstName} {photo.uploader.lastName}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">No photos uploaded yet</p>
          <p className="text-sm text-muted-foreground">
            Be the first to share photos from this tournament!
          </p>
        </div>
      )}

      {/* Media Uploader Dialog */}
      {showUploader && (
        <EnhancedMediaUploader
          maxFiles={10}
          maxFileSize={10 * 1024 * 1024}
          acceptedTypes={['image/*']}
          onFilesSelected={handleFilesSelected}
        >
          <div />
        </EnhancedMediaUploader>
      )}

      {/* Photo Viewer */}
      {selectedPhotoIndex !== null && (
        <PhotoViewer
          photos={photos.map((p) => ({
            url: getImageUrl(p.fileUrl),
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

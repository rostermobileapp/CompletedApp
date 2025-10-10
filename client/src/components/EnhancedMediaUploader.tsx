import { useState, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { X, Upload, Image as ImageIcon, Video, FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorTracker } from "@/lib/errorTracking";

interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'document';
  compressed?: File;
}

interface EnhancedMediaUploaderProps {
  maxFiles?: number;
  maxFileSize?: number;
  acceptedTypes?: string[];
  onFilesSelected: (files: MediaFile[]) => void;
  children?: ReactNode;
  className?: string;
}

// Image compression utility
const compressImage = async (file: File, quality: number = 0.8, maxWidth: number = 1920): Promise<File> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        file.type,
        quality
      );
    };
    
    img.src = URL.createObjectURL(file);
  });
};

const getFileType = (file: File): 'image' | 'video' | 'document' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
};

const getFileIcon = (type: string) => {
  if (type === 'image') return <ImageIcon className="w-5 h-5 text-blue-500" />;
  if (type === 'video') return <Video className="w-5 h-5 text-purple-500" />;
  return <FileText className="w-5 h-5 text-gray-500" />;
};

export function EnhancedMediaUploader({
  maxFiles = 5,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  acceptedTypes = ['image/*', 'video/*', '.pdf', '.doc', '.docx'],
  onFilesSelected,
  children,
  className
}: EnhancedMediaUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<MediaFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList) => {
    setIsProcessing(true);
    const mediaFiles: MediaFile[] = [];

    for (let i = 0; i < files.length && mediaFiles.length < maxFiles; i++) {
      const file = files[i];
      
      if (file.size > maxFileSize) {
        errorTracker.captureWarning('File size exceeds maximum limit', {
          filename: file.name,
          size: file.size,
          maxSize: maxFileSize
        });
        continue;
      }

      const type = getFileType(file);
      const preview = URL.createObjectURL(file);
      
      let compressed = file;
      
      // Compress images for better performance
      if (type === 'image') {
        compressed = await compressImage(file, 0.8, 1920);
      }

      mediaFiles.push({
        file,
        preview,
        type,
        compressed
      });
    }

    setSelectedFiles(prev => [...prev, ...mediaFiles].slice(0, maxFiles));
    setIsProcessing(false);
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      processFiles(files);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files) {
      processFiles(files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Clean up preview URLs
      URL.revokeObjectURL(prev[index].preview);
      return updated;
    });
  };

  const handleSend = () => {
    onFilesSelected(selectedFiles);
    setSelectedFiles([]);
    setIsOpen(false);
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      {/* Render children with click handler to open the modal */}
      {children && (
        <div onClick={() => setIsOpen(true)} style={{ display: 'contents' }}>
          {children}
        </div>
      )}
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="media-upload-dialog">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogClose />
          </DialogHeader>

          <div className="space-y-4">
            {/* Drop Zone */}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                isDragging 
                  ? "border-primary bg-primary/5" 
                  : "border-muted-foreground/25 hover:border-primary/50"
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={openFileDialog}
              data-testid="media-drop-zone"
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                Drop files here or click to browse
              </p>
              <p className="text-sm text-muted-foreground">
                Supports images, videos, and documents up to {Math.round(maxFileSize / 1024 / 1024)}MB
              </p>
              {isProcessing && (
                <p className="text-sm text-primary mt-2">Processing files...</p>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptedTypes.join(',')}
              onChange={handleFileSelect}
              className="hidden"
              data-testid="hidden-file-input"
            />

            {/* Selected Files Preview */}
            {selectedFiles.length > 0 && (
              <div className="space-y-3" data-testid="selected-files-preview">
                <h4 className="font-medium">Selected Files ({selectedFiles.length}/{maxFiles})</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedFiles.map((mediaFile, index) => (
                    <div 
                      key={index} 
                      className="relative border rounded-lg overflow-hidden bg-muted/30"
                      data-testid={`media-preview-${index}`}
                    >
                      {/* Image/Video Preview */}
                      {mediaFile.type === 'image' && (
                        <div className="aspect-video relative">
                          <img
                            src={mediaFile.preview}
                            alt={mediaFile.file.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      {mediaFile.type === 'video' && (
                        <div className="aspect-video relative bg-black">
                          <video
                            src={mediaFile.preview}
                            className="w-full h-full object-cover"
                            controls
                          />
                        </div>
                      )}
                      {mediaFile.type === 'document' && (
                        <div className="aspect-video flex items-center justify-center bg-muted">
                          {getFileIcon(mediaFile.type)}
                        </div>
                      )}

                      {/* File Info Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/75 text-white p-2">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">
                              {mediaFile.file.name}
                            </p>
                            <p className="text-xs opacity-75">
                              {(mediaFile.file.size / 1024).toFixed(1)} KB
                              {mediaFile.compressed && mediaFile.compressed.size !== mediaFile.file.size && (
                                <span className="ml-1 text-green-400">
                                  (compressed from {(mediaFile.file.size / 1024).toFixed(1)} KB)
                                </span>
                              )}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeFile(index)}
                            className="ml-2 h-6 w-6 p-0"
                            data-testid={`remove-media-${index}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setIsOpen(false)}
                data-testid="button-cancel-upload"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSend}
                disabled={selectedFiles.length === 0}
                data-testid="button-send-media"
              >
                Send {selectedFiles.length > 0 && `(${selectedFiles.length})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
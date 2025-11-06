import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Upload, X } from "lucide-react";

interface UploadResult {
  successful?: Array<{
    uploadURL: string;
    path?: string;
  }>;
  failed?: Array<any>;
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
    path?: string;
  }>;
  onComplete?: (result: UploadResult) => void;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * A compact file upload component that renders as a button and provides a small modal interface for
 * file selection.
 * 
 * Features:
 * - Renders as a customizable button that opens a compact file upload modal
 * - Small, user-friendly dialog for file selection
 * - Drag and drop support
 * - File preview and validation
 * 
 * @param props - Component props
 * @param props.maxNumberOfFiles - Maximum number of files allowed to be uploaded (default: 1)
 * @param props.maxFileSize - Maximum file size in bytes (default: 10MB)
 * @param props.onGetUploadParameters - Function to get upload parameters (method and URL)
 * @param props.onComplete - Callback function called when files are selected
 * @param props.buttonClassName - Optional CSS class name for the button
 * @param props.children - Content to be rendered inside the button
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      // Check file size
      if (file.size > maxFileSize) {
        alert(`File ${file.name} is too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`);
        return false;
      }
      // Check file type (images only)
      if (!file.type.startsWith('image/')) {
        alert(`File ${file.name} is not an image. Only image files are allowed.`);
        return false;
      }
      return true;
    });

    if (validFiles.length > maxNumberOfFiles) {
      alert(`Too many files selected. Maximum is ${maxNumberOfFiles}.`);
      return;
    }

    setSelectedFiles(validFiles);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    setIsUploading(true);
    try {
      const successful: Array<{ uploadURL: string; path?: string }> = [];
      const failed: Array<any> = [];
      
      for (const file of selectedFiles) {
        try {
          // Get upload parameters from the parent component
          const { method, url, path } = await onGetUploadParameters();
          
          // Upload the file to object storage
          const uploadResponse = await fetch(url, {
            method,
            body: file,
            headers: {
              'Content-Type': file.type,
            },
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`Upload failed with status ${uploadResponse.status}`);
          }
          
          // Store the path if available, otherwise fall back to parsed URL
          const uploadURL = path || url.split('?')[0];
          successful.push({ uploadURL, path });
        } catch (error) {
          console.error('Failed to upload file:', file.name, error);
          failed.push({ file: file.name, error });
        }
      }
      
      // Call onComplete with the result
      onComplete?.({ successful, failed });
      setShowModal(false);
      setSelectedFiles([]);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(files => files.filter((_, i) => i !== index));
  };

  return (
    <>
      <Button 
        onClick={() => setShowModal(true)} 
        className={buttonClassName}
        data-testid="button-upload"
      >
        {children}
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md max-h-[400px] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Files
            </DialogTitle>
            <DialogClose />
          </DialogHeader>
          
          <div className="flex-1 space-y-4">
            {/* File Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag & drop files here, or{' '}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary hover:underline"
                  data-testid="button-browse"
                >
                  browse files
                </button>
              </p>
              <p className="text-xs text-muted-foreground">
                Images only, max {Math.round(maxFileSize / 1024 / 1024)}MB each
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple={maxNumberOfFiles > 1}
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2 max-h-32 overflow-y-auto">
                <p className="text-sm font-medium">Selected files:</p>
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-muted rounded"
                  >
                    <span className="text-sm truncate">{file.name}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-muted-foreground hover:text-destructive"
                      data-testid={`button-remove-${index}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowModal(false);
                  setSelectedFiles([]);
                }}
                disabled={isUploading}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || isUploading}
                data-testid="button-confirm-upload"
              >
                {isUploading ? 'Uploading...' : `Upload${selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
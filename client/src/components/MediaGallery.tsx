import { useState } from "react";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  X, 
  ZoomIn, 
  ZoomOut,
  RotateCw,
  Maximize2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  url: string;
  filename: string;
  fileSize?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

interface MediaGalleryProps {
  items: MediaItem[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function MediaGallery({
  items,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange
}: MediaGalleryProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const currentItem = items[currentIndex];

  const handlePrevious = () => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
      resetTransforms();
    }
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      onIndexChange(currentIndex + 1);
      resetTransforms();
    }
  };

  const resetTransforms = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.5, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.5, 0.1));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleDownload = async () => {
    if (!currentItem) return;

    try {
      const response = await fetch(currentItem.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = currentItem.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const isImage = currentItem?.mimeType?.startsWith('image/');
  const isVideo = currentItem?.mimeType?.startsWith('video/');

  if (!currentItem || !isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none"
        data-testid="media-gallery-dialog"
      >
        {/* Header Controls */}
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between">
          

          <div className="flex items-center gap-2">
            {/* Image Controls */}
            {isImage && (
              <div className="flex items-center gap-1 bg-black/75 rounded-lg p-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleZoomOut}
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  data-testid="button-zoom-out"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-white text-xs px-2">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleZoomIn}
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRotate}
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  data-testid="button-rotate"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetTransforms}
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  data-testid="button-reset-view"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Download and Close */}
            <div className="flex items-center gap-1 bg-black/75 rounded-lg p-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDownload}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
                data-testid="button-download-media"
              >
                <Download className="w-4 h-4" />
              </Button>
              <DialogClose asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  data-testid="button-close-gallery"
                >
                  <X className="w-4 h-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </div>

        {/* Media Content */}
        <div className="relative w-full h-[95vh] flex items-center justify-center">
          {isImage && (
            <img
              src={currentItem.url}
              alt={currentItem.filename}
              className={cn(
                "max-w-full max-h-full object-contain transition-transform select-none",
                zoom > 1 ? "cursor-move" : "cursor-zoom-in"
              )}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg) translate(${position.x / zoom}px, ${position.y / zoom}px)`
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={zoom === 1 ? handleZoomIn : undefined}
              draggable={false}
              data-testid="gallery-image"
            />
          )}

          {isVideo && (
            <video
              src={currentItem.url}
              controls
              className="max-w-full max-h-full"
              data-testid="gallery-video"
            >
              Your browser does not support the video tag.
            </video>
          )}

          {!isImage && !isVideo && (
            <div className="text-center text-white">
              <div className="text-6xl mb-4">📄</div>
              <p className="text-sm text-white/75 mb-4">
                {currentItem.fileSize && `${(currentItem.fileSize / 1024).toFixed(1)} KB`}
              </p>
              <Button
                onClick={handleDownload}
                className="bg-white text-black hover:bg-white/90"
                data-testid="button-download-document"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          )}
        </div>

        {/* Navigation Controls */}
        {items.length > 1 && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12 p-0 disabled:opacity-30"
              data-testid="button-previous-media"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleNext}
              disabled={currentIndex === items.length - 1}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12 p-0 disabled:opacity-30"
              data-testid="button-next-media"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </>
        )}

        {/* Thumbnail Navigation */}
        {items.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/75 rounded-lg p-2">
            <div className="flex gap-2 max-w-sm overflow-x-auto">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onIndexChange(index);
                    resetTransforms();
                  }}
                  className={cn(
                    "flex-shrink-0 w-12 h-12 rounded border-2 overflow-hidden",
                    index === currentIndex 
                      ? "border-white" 
                      : "border-white/30 hover:border-white/60"
                  )}
                  data-testid={`thumbnail-${index}`}
                >
                  {item.mimeType?.startsWith('image/') ? (
                    <img
                      src={item.thumbnailUrl || item.url}
                      alt={item.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/20 flex items-center justify-center text-white text-xs">
                      📄
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Photo {
  url: string;
  caption?: string;
  uploader?: string;
}

interface PhotoViewerProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}

export function PhotoViewer({ photos, initialIndex, onClose }: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialScale, setInitialScale] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPhoto = photos[currentIndex];

  // Reset scale and position when photo changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

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
      // Single touch - prepare for swipe
      setTouchStart({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      });
    } else if (e.touches.length === 2) {
      // Two fingers - prepare for pinch zoom
      const distance = getDistance(e.touches[0], e.touches[1]);
      setInitialPinchDistance(distance);
      setInitialScale(scale);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance !== null) {
      // Pinch zoom
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

      // Only trigger swipe if zoomed out
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

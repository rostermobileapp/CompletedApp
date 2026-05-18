import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, Loader2 } from "lucide-react";

export type CropShape = "round" | "rect";

interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  cropShape?: CropShape;
  outputSize?: number;
  outputType?: "image/jpeg" | "image/webp";
  outputQuality?: number;
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void | Promise<void>;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

async function cropImageToBlob(
  imageSrc: string,
  area: Area,
  outputSize: number,
  type: "image/jpeg" | "image/webp",
  quality: number,
): Promise<Blob> {
  const image = await loadImage(imageSrc);

  // Draw the full image first at natural size, then extract the crop region.
  // This approach correctly handles EXIF orientation since the browser normalises
  // the image when rendering it, and getImageData reads display-correct pixels.
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = image.naturalWidth;
  fullCanvas.height = image.naturalHeight;
  const fullCtx = fullCanvas.getContext("2d");
  if (!fullCtx) throw new Error("Could not get canvas context");
  fullCtx.drawImage(image, 0, 0);

  // Clamp the crop rectangle to the image bounds to avoid out-of-range reads.
  const sx = Math.max(0, Math.round(area.x));
  const sy = Math.max(0, Math.round(area.y));
  const sw = Math.min(Math.round(area.width), image.naturalWidth - sx);
  const sh = Math.min(Math.round(area.height), image.naturalHeight - sy);

  if (sw <= 0 || sh <= 0) throw new Error("Invalid crop area");

  const cropData = fullCtx.getImageData(sx, sy, sw, sh);

  // Write the cropped pixels to the output canvas at the desired output size.
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outputSize;
  outCanvas.height = outputSize;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Could not get output canvas context");

  if (type === "image/jpeg") {
    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, outputSize, outputSize);
  }

  // Draw the raw crop at native size on a temporary canvas, then scale it.
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = sw;
  tempCanvas.height = sh;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) throw new Error("Could not get temp canvas context");
  tempCtx.putImageData(cropData, 0, 0);

  outCtx.drawImage(tempCanvas, 0, 0, sw, sh, 0, 0, outputSize, outputSize);

  return new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode cropped image"));
      },
      type,
      quality,
    );
  });
}

export function ImageCropDialog({
  open,
  file,
  cropShape = "rect",
  outputSize = 512,
  outputType = "image/jpeg",
  outputQuality = 0.9,
  title,
  description,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refs always hold the latest values so handleSave never reads a stale closure,
  // regardless of React render timing (important on mobile where the user can tap
  // Save immediately after adjusting the zoom slider).
  const croppedAreaPixelsRef = useRef<Area | null>(null);
  const imageSrcRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const isSavingRef = useRef(false);

  useEffect(() => { imageSrcRef.current = imageSrc; }, [imageSrc]);
  useEffect(() => { fileRef.current = file; }, [file]);

  useEffect(() => {
    let cancelled = false;
    if (!file || !open) {
      setImageSrc(null);
      imageSrcRef.current = null;
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      croppedAreaPixelsRef.current = null;
      setLoadError(null);
      return;
    }
    setLoadError(null);
    readFileAsDataUrl(file)
      .then((dataUrl) => {
        if (!cancelled) {
          setImageSrc(dataUrl);
          imageSrcRef.current = dataUrl;
          setCrop({ x: 0, y: 0 });
          setZoom(1);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err?.message || "Failed to load image");
        }
      });
    return () => { cancelled = true; };
  }, [file, open]);

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    // Update the ref synchronously (no React batching delay) AND state
    // (for the Save button disabled check).
    croppedAreaPixelsRef.current = pixels;
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;

    // Always read from refs — guaranteed to have the absolute latest values.
    const currentImageSrc = imageSrcRef.current;
    const currentPixels = croppedAreaPixelsRef.current;
    const currentFile = fileRef.current;

    if (!currentImageSrc || !currentPixels || !currentFile) return;

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const blob = await cropImageToBlob(
        currentImageSrc,
        currentPixels,
        outputSize,
        outputType,
        outputQuality,
      );
      const baseName = currentFile.name.replace(/\.[^.]+$/, "") || "image";
      const ext = outputType === "image/webp" ? "webp" : "jpg";
      const cropped = new File([blob], `${baseName}-cropped.${ext}`, {
        type: outputType,
        lastModified: Date.now(),
      });
      await onConfirm(cropped);
    } catch (err) {
      console.error("Failed to crop image:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to crop image");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [outputSize, outputType, outputQuality, onConfirm]);

  const handleOpenChange = (next: boolean) => {
    if (!next && !isSavingRef.current) {
      onCancel();
    }
  };

  const dialogTitle = title ?? (cropShape === "round" ? "Position your photo" : "Position your image");
  const dialogDescription =
    description ??
    "Drag to move and pinch or use the slider to zoom. The area inside the frame is what will be saved.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-image-crop">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fixed-height crop area. No external cropSize prop — react-easy-crop
              sizes the crop frame internally from aspect={1} and the container
              dimensions. This avoids a ResizeObserver race where a late-firing
              measurement could overwrite the user's zoomed crop state. */}
          <div
            className="relative w-full bg-black rounded-md overflow-hidden"
            style={{ height: 300 }}
          >
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape={cropShape}
                objectFit="auto-cover"
                showGrid={false}
                minZoom={1}
                maxZoom={4}
                restrictPosition={true}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                {loadError ? loadError : "Loading image…"}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground" aria-hidden />
            <Slider
              value={[zoom]}
              min={1}
              max={4}
              step={0.01}
              onValueChange={(v) => setZoom(v[0] ?? 1)}
              aria-label="Zoom"
              data-testid="slider-crop-zoom"
              disabled={!imageSrc || isSaving}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
            data-testid="button-crop-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!imageSrc || !croppedAreaPixels || isSaving}
            data-testid="button-crop-save"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area, MediaSize } from "react-easy-crop/types";
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

// Inlined from react-easy-crop's exported helpers (the ESM bundle does not
// re-export them). Rotation is always 0 here, so rotateSize is the identity.
function clampArea(max: number, value: number) {
  return Math.min(max, Math.max(0, value));
}
function computeCroppedAreaPixels(
  crop: { x: number; y: number },
  mediaSize: MediaSize,
  cropSize: { width: number; height: number },
  zoom: number,
): Area {
  const mw = mediaSize.width;
  const mh = mediaSize.height;
  const nw = mediaSize.naturalWidth;
  const nh = mediaSize.naturalHeight;
  const cw = cropSize.width;
  const ch = cropSize.height;

  const xPct = clampArea(100, ((mw - cw / zoom) / 2 - crop.x / zoom) / mw * 100);
  const yPct = clampArea(100, ((mh - ch / zoom) / 2 - crop.y / zoom) / mh * 100);
  const wPct = clampArea(100, cw / mw * 100 / zoom);
  const hPct = clampArea(100, ch / mh * 100 / zoom);

  const wPx = Math.round(clampArea(nw, wPct * nw / 100));
  const hPx = Math.round(clampArea(nh, hPct * nh / 100));

  // For a square crop (aspect=1) and square images wPx===hPx, but images
  // with a non-square aspect need the size adjusted for exact pixel accuracy.
  const isWider = nw >= nh; // aspect=1, so size is square — use smaller dim
  const size = isWider
    ? { width: hPx, height: hPx }
    : { width: wPx, height: wPx };

  return {
    x: Math.round(clampArea(nw - size.width,  xPct * nw / 100)),
    y: Math.round(clampArea(nh - size.height, yPct * nh / 100)),
    width: size.width,
    height: size.height,
  };
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

  const sx = Math.max(0, Math.round(area.x));
  const sy = Math.max(0, Math.round(area.y));
  const sw = Math.min(Math.round(area.width), image.naturalWidth - sx);
  const sh = Math.min(Math.round(area.height), image.naturalHeight - sy);

  if (sw <= 0 || sh <= 0) throw new Error("Invalid crop area");

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputSize, outputSize);
  }

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
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
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // These refs always hold the absolute latest values so handleSave never reads
  // a stale closure, regardless of React render/batch timing (especially important
  // on mobile where Save can be tapped immediately after moving the slider).
  const imageSrcRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const cropRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const isSavingRef = useRef(false);

  // We capture the media size and crop size directly from the Cropper via its
  // setMediaSize / onCropSizeChange props so we can recompute croppedAreaPixels
  // in handleSave from first principles (using react-easy-crop's own exported
  // computeCroppedArea). This is the most reliable approach because it avoids
  // any onCropComplete callback timing / stale-closure issues.
  const mediaSizeRef = useRef<MediaSize | null>(null);
  const cropSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => { imageSrcRef.current = imageSrc; }, [imageSrc]);
  useEffect(() => { fileRef.current = file; }, [file]);
  useEffect(() => { cropRef.current = crop; }, [crop]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    if (!file || !open) {
      setImageSrc(null);
      imageSrcRef.current = null;
      setCrop({ x: 0, y: 0 });
      cropRef.current = { x: 0, y: 0 };
      setZoom(1);
      zoomRef.current = 1;
      mediaSizeRef.current = null;
      cropSizeRef.current = null;
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
          cropRef.current = { x: 0, y: 0 };
          setZoom(1);
          zoomRef.current = 1;
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || "Failed to load image");
      });
    return () => { cancelled = true; };
  }, [file, open]);

  const handleSetMediaSize = useCallback((mediaSize: MediaSize) => {
    mediaSizeRef.current = mediaSize;
  }, []);

  const handleCropSizeChange = useCallback((size: { width: number; height: number }) => {
    cropSizeRef.current = size;
  }, []);

  const handleCropChange = useCallback((c: { x: number; y: number }) => {
    setCrop(c);
    cropRef.current = c;
  }, []);

  const handleZoomChange = useCallback((z: number) => {
    setZoom(z);
    zoomRef.current = z;
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;

    const currentImageSrc = imageSrcRef.current;
    const currentFile = fileRef.current;
    const currentCrop = cropRef.current;
    const currentZoom = zoomRef.current;
    const currentMediaSize = mediaSizeRef.current;
    const currentCropSize = cropSizeRef.current;

    if (!currentImageSrc || !currentFile) return;
    if (!currentMediaSize || !currentCropSize) {
      setLoadError("Crop area not ready yet. Please try again.");
      return;
    }

    // Compute croppedAreaPixels from first principles — the same calculation
    // react-easy-crop uses internally — so the saved region always matches
    // exactly what the user sees in the preview.
    const croppedAreaPixels = computeCroppedAreaPixels(
      currentCrop,
      currentMediaSize,
      currentCropSize,
      currentZoom,
    );

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const blob = await cropImageToBlob(
        currentImageSrc,
        croppedAreaPixels,
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
    if (!next && !isSavingRef.current) onCancel();
  };

  const dialogTitle = title ?? (cropShape === "round" ? "Position your photo" : "Position your image");
  const dialogDescription =
    description ??
    "Drag to move and pinch or use the slider to zoom. The area inside the frame will be saved.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-image-crop">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fixed-height crop area.
              We don't pass a cropSize prop — react-easy-crop computes it
              internally from the container dimensions and aspect={1}.
              We capture the computed values via setMediaSize and onCropSizeChange
              so handleSave can call computeCroppedArea from first principles. */}
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
                onCropChange={handleCropChange}
                onZoomChange={handleZoomChange}
                setMediaSize={handleSetMediaSize}
                onCropSizeChange={handleCropSizeChange}
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
              onValueChange={(v) => {
                const z = v[0] ?? 1;
                setZoom(z);
                zoomRef.current = z;
              }}
              aria-label="Zoom"
              data-testid="slider-crop-zoom"
              disabled={!imageSrc || isSaving}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>

          {loadError && (
            <p className="text-sm text-destructive text-center">{loadError}</p>
          )}
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
            disabled={!imageSrc || isSaving}
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

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
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

// Draws the crop to a canvas by replicating the Cropper's visual geometry directly.
//
//   image transform: translate(cropX, cropY) scale(zoom)
//   image CSS size at zoom=1: mediaSize (width × height)
//   container size: containerWidth × containerHeight
//   crop frame: centred in container, size cropW × cropH
//
// The image centre in display-px is (containerW/2 + cropX, containerH/2 + cropY).
// The rendered image occupies (mw*zoom) × (mh*zoom) display pixels.
//
// When zoom < 1 (fit-mode for non-square images) the image may not fully cover the
// crop frame.  In that case we compute the intersection of the image rect and the crop
// frame rect, map it to the correct source rect in natural px and the correct destination
// rect in the output canvas.  This leaves the non-overlapping parts of the output as
// whatever was already drawn (white/transparent background).
function drawCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  mediaSize: MediaSize,
  containerWidth: number,
  containerHeight: number,
  cropWidth: number,
  cropHeight: number,
  cropX: number,
  cropY: number,
  zoom: number,
  outputW: number,
  outputH: number,
): void {
  const { width: mw, height: mh, naturalWidth: nw, naturalHeight: nh } = mediaSize;

  // Rendered image size in display-px
  const imgW = mw * zoom;
  const imgH = mh * zoom;

  // Image bounds in display-px
  const imgCx   = containerWidth  / 2 + cropX;
  const imgCy   = containerHeight / 2 + cropY;
  const imgLeft  = imgCx - imgW / 2;
  const imgTop   = imgCy - imgH / 2;
  const imgRight  = imgLeft + imgW;
  const imgBottom = imgTop  + imgH;

  // Crop frame bounds in display-px
  const cropLeft   = containerWidth  / 2 - cropWidth  / 2;
  const cropTop    = containerHeight / 2 - cropHeight / 2;
  const cropRight  = cropLeft + cropWidth;
  const cropBottom = cropTop  + cropHeight;

  // Intersection of image rect and crop frame rect in display-px
  const intLeft   = Math.max(cropLeft,   imgLeft);
  const intTop    = Math.max(cropTop,    imgTop);
  const intRight  = Math.min(cropRight,  imgRight);
  const intBottom = Math.min(cropBottom, imgBottom);
  const intW = Math.max(0, intRight  - intLeft);
  const intH = Math.max(0, intBottom - intTop);

  if (intW <= 0 || intH <= 0) return; // image entirely outside crop frame — nothing to draw

  // Destination rect in output canvas: intersection position relative to crop frame, scaled to output.
  const dstX = (intLeft - cropLeft) / cropWidth  * outputW;
  const dstY = (intTop  - cropTop)  / cropHeight * outputH;
  const dstW = intW / cropWidth  * outputW;
  const dstH = intH / cropHeight * outputH;

  // Source rect in natural image pixels: intersection position relative to image, scaled to natural dims.
  const srcX = (intLeft - imgLeft) / imgW * nw;
  const srcY = (intTop  - imgTop)  / imgH * nh;
  const srcW = intW / imgW * nw;
  const srcH = intH / imgH * nh;

  ctx.drawImage(img, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
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
  const [minZoom, setMinZoom] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);

  const imageSrcRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const isSavingRef = useRef(false);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  // Always-current refs for handleSave — avoids stale closure issues.
  const cropRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const minZoomRef = useRef(1);
  const cropSizeRef = useRef<{ width: number; height: number } | null>(null);

  // Natural image dimensions preloaded when the file is set.
  const naturalDimsRef = useRef<{ nw: number; nh: number } | null>(null);

  // mediaSize kept for use in handleSave fallback.
  const mediaSizeRef = useRef<MediaSize | null>(null);

  useEffect(() => { fileRef.current = file; }, [file]);
  useEffect(() => { cropRef.current = crop; }, [crop]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { cropSizeRef.current = cropSize; }, [cropSize]);

  useEffect(() => {
    let cancelled = false;
    if (!file || !open) {
      setImageSrc(null);
      imageSrcRef.current = null;
      setCrop({ x: 0, y: 0 });
      cropRef.current = { x: 0, y: 0 };
      setZoom(1);
      zoomRef.current = 1;
      setMinZoom(1);
      minZoomRef.current = 1;
      setCropSize(null);
      cropSizeRef.current = null;
      mediaSizeRef.current = null;
      naturalDimsRef.current = null;
      setLoadError(null);
      return;
    }
    setLoadError(null);
    setCropSize(null);
    mediaSizeRef.current = null;
    naturalDimsRef.current = null;

    readFileAsDataUrl(file)
      .then(async (dataUrl) => {
        if (cancelled) return;

        // Preload the image to get natural dimensions so we can compute the
        // correct fit-zoom deterministically without relying on setMediaSize timing.
        try {
          const preloaded = await loadImage(dataUrl);
          if (!cancelled) {
            naturalDimsRef.current = {
              nw: preloaded.naturalWidth,
              nh: preloaded.naturalHeight,
            };
          }
        } catch {
          // Non-fatal — save will fall back to computed mediaSize.
        }

        if (cancelled) return;
        setImageSrc(dataUrl);
        imageSrcRef.current = dataUrl;
        setCrop({ x: 0, y: 0 });
        cropRef.current = { x: 0, y: 0 };
        setZoom(1);
        zoomRef.current = 1;
        setMinZoom(1);
        minZoomRef.current = 1;

        // Wait for the Dialog open animation to finish so getBoundingClientRect()
        // reflects the final rendered container size.
        setTimeout(() => {
          if (cancelled || !cropContainerRef.current) return;
          const rect = cropContainerRef.current.getBoundingClientRect();
          const cw = rect.width;
          const ch = rect.height;
          const side = Math.min(cw, ch);

          // Store crop size (used in handleSave geometry).
          // We do NOT pass this as cropSize prop to the Cropper — instead we use
          // aspect={1} so react-easy-crop computes the crop frame from its own
          // container measurement (no mismatch possible).
          const cs = { width: side, height: side };
          setCropSize(cs);
          cropSizeRef.current = cs;

          // Compute fit-zoom: the zoom level where the full image is visible inside
          // the crop frame. Uses cover math to replicate what react-easy-crop computes:
          //   coverScale = max(cw/nw, ch/nh)   → scale to cover the container
          //   mediaSize  = {nw*coverScale, nh*coverScale}  at zoom=1
          //   fitZoom    = min(side/mediaW, side/mediaH)   → both dims inside frame
          const dims = naturalDimsRef.current;
          if (dims && dims.nw > 0 && dims.nh > 0) {
            const { nw, nh } = dims;
            const coverScale = Math.max(cw / nw, ch / nh);
            const mediaW = nw * coverScale;
            const mediaH = nh * coverScale;
            const fitZoom = Math.max(0.05, Math.min(1, Math.min(side / mediaW, side / mediaH)));
            if (fitZoom < 0.999) {
              minZoomRef.current = fitZoom;
              setMinZoom(fitZoom);
              zoomRef.current = fitZoom;
              setZoom(fitZoom);
              cropRef.current = { x: 0, y: 0 };
              setCrop({ x: 0, y: 0 });
            }
          }
        }, 300);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || "Failed to load image");
      });

    return () => { cancelled = true; };
  }, [file, open]);

  const handleCropChange = useCallback((c: { x: number; y: number }) => {
    setCrop(c);
    cropRef.current = c;
  }, []);

  const handleZoomChange = useCallback((z: number) => {
    setZoom(z);
    zoomRef.current = z;
  }, []);

  // Keep mediaSizeRef current for use in handleSave geometry fallback.
  const handleSetMediaSize = useCallback((ms: MediaSize) => {
    mediaSizeRef.current = ms;
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;

    const currentImageSrc = imageSrcRef.current;
    const currentFile = fileRef.current;
    const currentCrop = { ...cropRef.current };
    const currentZoom = zoomRef.current;
    const currentMediaSize = mediaSizeRef.current;

    if (!currentImageSrc || !currentFile) return;

    // Measure the container live — it's definitely fully rendered when the user
    // clicks Save, so getBoundingClientRect() is accurate here.
    const containerEl = cropContainerRef.current;
    if (!containerEl) {
      setLoadError("Crop area not ready. Please try again.");
      return;
    }
    const liveRect = containerEl.getBoundingClientRect();
    const containerW = liveRect.width;
    const containerH = liveRect.height;
    const side = Math.min(containerW, containerH);

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const img = await loadImage(currentImageSrc);

      // Determine the mediaSize (image rendered CSS size at zoom=1).
      // Prefer the value from setMediaSize (Cropper's own computation); fall back
      // to cover math computed from natural dims + live container dims.
      let mediaSize: MediaSize;
      if (currentMediaSize && currentMediaSize.naturalWidth > 0 && currentMediaSize.width > 0) {
        mediaSize = currentMediaSize;
      } else {
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        const coverScale = Math.max(containerW / nw, containerH / nh);
        mediaSize = {
          width: nw * coverScale,
          height: nh * coverScale,
          naturalWidth: nw,
          naturalHeight: nh,
        };
      }

      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d")!;

      if (outputType === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outputSize, outputSize);
      }

      drawCrop(
        ctx,
        img,
        mediaSize,
        containerW,
        containerH,
        side,
        side,
        currentCrop.x,
        currentCrop.y,
        currentZoom,
        outputSize,
        outputSize,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => { if (b) resolve(b); else reject(new Error("Failed to encode")); },
          outputType,
          outputQuality,
        );
      });

      const baseName = currentFile.name.replace(/\.[^.]+$/, "") || "image";
      const ext = outputType === "image/webp" ? "webp" : "jpg";
      const cropped = new File([blob], `${baseName}-cropped.${ext}`, {
        type: outputType,
        lastModified: Date.now(),
      });
      await onConfirm(cropped);
    } catch (err) {
      console.error("[ImageCrop] Failed to crop image:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to crop image");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [outputSize, outputType, outputQuality, onConfirm]);

  const handleOpenChange = (next: boolean) => {
    if (!next && !isSavingRef.current) onCancel();
  };

  const dialogTitle = title ?? (cropShape === "round" ? "Position your profile photo" : "Position your image");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-4" data-testid="dialog-image-crop">
        <DialogHeader className="pb-2">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="text-xs">
            {description ?? "Drag to reposition · Pinch or use slider to zoom"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Square container — height matches width so the circle fills it completely */}
          <div
            ref={cropContainerRef}
            className="relative w-full bg-black rounded-md overflow-hidden"
            style={{ aspectRatio: "1 / 1" }}
          >
            {cropSize && imageSrc ? (
              <Cropper
                key={imageSrc}
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape={cropShape}
                objectFit="cover"
                showGrid={false}
                minZoom={minZoom}
                maxZoom={4}
                restrictPosition={minZoom >= 1}
                onCropChange={handleCropChange}
                onZoomChange={handleZoomChange}
                setMediaSize={handleSetMediaSize}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                {loadError ? loadError : "Loading…"}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Slider
              value={[zoom]}
              min={minZoom}
              max={4}
              step={0.01}
              onValueChange={(v) => {
                const z = v[0] ?? minZoom;
                setZoom(z);
                zoomRef.current = z;
              }}
              aria-label="Zoom"
              data-testid="slider-crop-zoom"
              disabled={!cropSize || isSaving}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </div>

          {loadError && (
            <p className="text-sm text-destructive text-center">{loadError}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-1">
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
            disabled={!cropSize || isSaving}
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

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

  // mediaSize is set by the Cropper via setMediaSize prop.
  // computeSizes() fires twice:
  //   1. When the image loads (state.mediaObjectFit is still undefined → uses 'contain' → WRONG)
  //   2. As a setState callback when componentDidUpdate sets state.mediaObjectFit → CORRECT
  // We always keep the LATEST value; after the second call it's correct.
  const mediaSizeRef = useRef<MediaSize | null>(null);

  // Container geometry measured after dialog animation settles.
  const containerDimsRef = useRef<{ width: number; height: number } | null>(null);

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
      containerDimsRef.current = null;
      setLoadError(null);
      return;
    }
    setLoadError(null);
    setCropSize(null);
    mediaSizeRef.current = null;
    containerDimsRef.current = null;

    readFileAsDataUrl(file)
      .then((dataUrl) => {
        if (cancelled) return;
        setImageSrc(dataUrl);
        imageSrcRef.current = dataUrl;
        setCrop({ x: 0, y: 0 });
        cropRef.current = { x: 0, y: 0 };
        setZoom(1);
        zoomRef.current = 1;
        setMinZoom(1);
        minZoomRef.current = 1;
        // Delay Cropper mount until the Dialog's open animation finishes so that
        // getBoundingClientRect() reflects the final container dimensions.
        setTimeout(() => {
          if (cancelled || !cropContainerRef.current) return;
          const rect = cropContainerRef.current.getBoundingClientRect();
          containerDimsRef.current = { width: rect.width, height: rect.height };
          // Use the full container square so the circle fills the available space.
          const side = Math.min(rect.width, rect.height);
          const cs = { width: side, height: side };
          setCropSize(cs);
          cropSizeRef.current = cs;
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

  // setMediaSize fires each time computeSizes() runs. We always keep the latest
  // value; the second (correct cover-mode) call overwrites the first (wrong contain-mode).
  // After the second call we also compute the "fit zoom" — the minimum zoom at which the
  // entire image is visible inside the crop frame — and apply it as both the initial zoom
  // and the minZoom so the photo always starts fully inside the frame.
  const handleSetMediaSize = useCallback((ms: MediaSize) => {
    mediaSizeRef.current = ms;
    const cs = cropSizeRef.current;
    if (!cs || ms.width <= 0 || ms.height <= 0) return;

    // fitZoom: zoom at which both image dimensions fit within the crop frame.
    // With objectFit="cover", ms.width × ms.height is the rendered size at zoom=1.
    // At zoom=fitZoom the rendered size equals (ms.width*fitZoom) × (ms.height*fitZoom).
    // We want both ≤ cropFrame, so fitZoom = min(cropW/ms.width, cropH/ms.height).
    const fitZoom = Math.min(cs.width / ms.width, cs.height / ms.height);
    // Clamp to [0.1, 1]: can never be > 1 by definition (cover always fills the frame at 1),
    // but guard against edge-cases with a small lower bound.
    const clampedFit = Math.max(0.1, Math.min(1, fitZoom));

    if (clampedFit < minZoomRef.current || Math.abs(clampedFit - minZoomRef.current) > 0.01) {
      minZoomRef.current = clampedFit;
      setMinZoom(clampedFit);
      // Only pull the zoom down if the current zoom would show overflow.
      if (zoomRef.current > clampedFit + 0.001) {
        zoomRef.current = clampedFit;
        setZoom(clampedFit);
        // Reset pan so image stays centred.
        cropRef.current = { x: 0, y: 0 };
        setCrop({ x: 0, y: 0 });
      }
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;

    const currentImageSrc = imageSrcRef.current;
    const currentFile = fileRef.current;
    const currentCrop = { ...cropRef.current };
    const currentZoom = zoomRef.current;
    const currentCropSize = cropSizeRef.current;
    const currentMediaSize = mediaSizeRef.current;
    const dims = containerDimsRef.current;

    if (!currentImageSrc || !currentFile) return;
    if (!currentCropSize) {
      setLoadError("Crop area not ready. Please try again.");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const img = await loadImage(currentImageSrc);

      // Determine the mediaSize to use.
      // Prefer the value from setMediaSize (Cropper's own computation), but fall back
      // to computing it ourselves from natural dims + container dims if unavailable.
      let mediaSize: MediaSize;
      if (currentMediaSize && currentMediaSize.naturalWidth > 0 && currentMediaSize.width > 0) {
        mediaSize = currentMediaSize;
      } else if (dims) {
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        const cw = dims.width;
        const ch = dims.height;
        const mediaAspect = nw / nh;
        const containerAspect = cw / ch;
        // Replicate react-easy-crop getObjectFit() + computeSizes() with objectFit="cover":
        //   vertical-cover (mediaAspect >= containerAspect): width = ch * mediaAspect, height = ch
        //   horizontal-cover (mediaAspect < containerAspect): width = cw, height = cw / mediaAspect
        const mw = mediaAspect >= containerAspect ? ch * mediaAspect : cw;
        const mh = mediaAspect >= containerAspect ? ch : cw / mediaAspect;
        mediaSize = { width: mw, height: mh, naturalWidth: nw, naturalHeight: nh };
      } else {
        setLoadError("Crop area not ready. Please try again.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d")!;

      if (outputType === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outputSize, outputSize);
      }

      // Use container dims for geometry; fall back to mediaSize dimensions if unavailable.
      const containerW = dims?.width  ?? mediaSize.width;
      const containerH = dims?.height ?? mediaSize.height;

      drawCrop(
        ctx,
        img,
        mediaSize,
        containerW,
        containerH,
        currentCropSize.width,
        currentCropSize.height,
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
                cropSize={cropSize}
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

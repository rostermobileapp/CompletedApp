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
// This is equivalent to the computeCroppedArea math but expressed as a geometry
// problem: given where the image is rendered and where the crop circle is, what
// source rectangle do we sample from the original image?
//
//   image transform: translate(cropX, cropY) scale(zoom)
//   image CSS size at zoom=1: mediaSize (width × height)
//   container size: cw × ch  (the Cropper's container = our wrapper div)
//   crop circle: centred in container, size cropW × cropH
//
// After the transform the image centre is at (cw/2 + cropX, ch/2 + cropY).
// The image occupies (mw*zoom) × (mh*zoom) display pixels.
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

  // Centre of image in display-px (after the Cropper's translate+scale transform)
  const imgCx = containerWidth / 2 + cropX;
  const imgCy = containerHeight / 2 + cropY;

  // Top-left corner of the rendered image in display-px
  const imgLeft = imgCx - (mw * zoom) / 2;
  const imgTop  = imgCy - (mh * zoom) / 2;

  // Top-left corner of the crop circle in display-px
  const cropLeft = containerWidth  / 2 - cropWidth  / 2;
  const cropTop  = containerHeight / 2 - cropHeight / 2;

  // Position of the crop box relative to the rendered image, in display-px
  const relX = cropLeft - imgLeft;
  const relY = cropTop  - imgTop;

  // Scale from display-px to natural image-px
  const scaleX = nw / (mw * zoom);
  const scaleY = nh / (mh * zoom);

  // Source rectangle in natural image-px
  const srcX = Math.max(0, relX * scaleX);
  const srcY = Math.max(0, relY * scaleY);
  const srcW = Math.min(cropWidth  * scaleX, nw - srcX);
  const srcH = Math.min(cropHeight * scaleY, nh - srcY);

  console.log("[ImageCrop] drawCrop", {
    mediaSize: { mw, mh, nw, nh },
    container: { containerWidth, containerHeight },
    crop: { cropX, cropY, zoom, cropWidth, cropHeight },
    imgTopLeft: { imgLeft, imgTop },
    cropTopLeft: { cropLeft, cropTop },
    relative: { relX, relY },
    source: { srcX, srcY, srcW, srcH },
  });

  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outputW, outputH);
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
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);

  const imageSrcRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const isSavingRef = useRef(false);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  // Always-current refs for handleSave — avoids stale closure issues.
  const cropRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
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
        // Delay Cropper mount until the Dialog's open animation finishes so that
        // getBoundingClientRect() reflects the final container dimensions.
        setTimeout(() => {
          if (cancelled || !cropContainerRef.current) return;
          // Use offsetWidth for the square — the container has aspect-ratio 1:1 so
          // height always equals width, but getBoundingClientRect().height can lag
          // behind during dialog open animations and give a smaller value.
          const w = cropContainerRef.current.offsetWidth;
          containerDimsRef.current = { width: w, height: w };
          const cs = { width: w, height: w };
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
  const handleSetMediaSize = useCallback((ms: MediaSize) => {
    mediaSizeRef.current = ms;
    console.log("[ImageCrop] setMediaSize called:", ms);
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
        console.log("[ImageCrop] Using mediaSize from setMediaSize:", mediaSize);
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
        console.log("[ImageCrop] Computed mediaSize from natural+container dims:", mediaSize);
      } else {
        setLoadError("Crop area not ready. Please try again.");
        return;
      }

      console.log("[ImageCrop] handleSave inputs:", {
        crop: currentCrop,
        zoom: currentZoom,
        cropSize: currentCropSize,
        containerDims: dims,
        mediaSize,
        naturalSize: { nw: img.naturalWidth, nh: img.naturalHeight },
      });

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
                minZoom={1}
                maxZoom={4}
                restrictPosition={true}
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

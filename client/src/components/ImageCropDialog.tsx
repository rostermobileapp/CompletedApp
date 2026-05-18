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

// Exact replica of react-easy-crop's internal computeCroppedArea (rotation=0, aspect=1).
// mediaSize is the RENDERED image size in display-px at zoom=1 (NOT natural px).
// cropSize is the displayed crop square in display-px.
// crop.x / crop.y are display-px offsets from center (positive = image shifted right/down).
function computePixels(
  crop: { x: number; y: number },
  mediaSize: { width: number; height: number; naturalWidth: number; naturalHeight: number },
  cropSize: { width: number; height: number },
  zoom: number,
): Area {
  const { width: mw, height: mh, naturalWidth: nw, naturalHeight: nh } = mediaSize;
  const { width: cw, height: ch } = cropSize;
  const lim = (max: number, v: number) => Math.min(max, Math.max(0, v));

  const xPct = lim(100, ((mw - cw / zoom) / 2 - crop.x / zoom) / mw * 100);
  const yPct = lim(100, ((mh - ch / zoom) / 2 - crop.y / zoom) / mh * 100);
  const wPct = lim(100, cw / mw * 100 / zoom);
  const hPct = lim(100, ch / mh * 100 / zoom);

  const wPx = Math.round(lim(nw, wPct * nw / 100));
  const hPx = Math.round(lim(nh, hPct * nh / 100));

  // aspect=1: library picks the smaller axis to force exact square
  const isWider = nw >= nh;
  const side = isWider ? hPx : wPx;

  return {
    x: Math.round(lim(nw - side, xPct * nw / 100)),
    y: Math.round(lim(nh - side, yPct * nh / 100)),
    width: side,
    height: side,
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
      (blob) => { if (blob) resolve(blob); else reject(new Error("Failed to encode cropped image")); },
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
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);

  const imageSrcRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const isSavingRef = useRef(false);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  // Always-current refs for handleSave (avoids stale closures).
  const cropRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const cropSizeRef = useRef<{ width: number; height: number } | null>(null);
  // Container dims measured after dialog animation — used to recompute correct mediaSize.
  // We cannot use setMediaSize from the Cropper because state.mediaObjectFit starts as
  // undefined so computeSizes() always runs with the 'contain' default, giving wrong dims.
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
      containerDimsRef.current = null;
      setLoadError(null);
      return;
    }
    setLoadError(null);
    setCropSize(null);
    containerDimsRef.current = null;
    readFileAsDataUrl(file)
      .then((dataUrl) => {
        if (!cancelled) {
          setImageSrc(dataUrl);
          imageSrcRef.current = dataUrl;
          setCrop({ x: 0, y: 0 });
          cropRef.current = { x: 0, y: 0 };
          setZoom(1);
          zoomRef.current = 1;
          // Wait for the Dialog open animation so getBoundingClientRect() is stable.
          setTimeout(() => {
            if (!cancelled && cropContainerRef.current) {
              const rect = cropContainerRef.current.getBoundingClientRect();
              containerDimsRef.current = { width: rect.width, height: rect.height };
              const side = Math.min(rect.width, rect.height);
              const cs = { width: side, height: side };
              setCropSize(cs);
              cropSizeRef.current = cs;
            }
          }, 250);
        }
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

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;

    const currentImageSrc = imageSrcRef.current;
    const currentFile = fileRef.current;
    const currentCrop = cropRef.current;
    const currentZoom = zoomRef.current;
    const currentCropSize = cropSizeRef.current;
    const dims = containerDimsRef.current;

    if (!currentImageSrc || !currentFile) return;
    if (!currentCropSize || !dims) {
      setLoadError("Crop area not ready yet. Please try again.");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      // Load the image to get its natural dimensions.
      const image = await loadImage(currentImageSrc);
      const nw = image.naturalWidth;
      const nh = image.naturalHeight;

      // Replicate react-easy-crop's getObjectFit() + computeSizes() with objectFit="cover".
      //
      // The library's computeSizes() runs when the image loads, but state.mediaObjectFit
      // is still `undefined` at that point (it's set in componentDidUpdate which fires
      // after setState, not before). So it falls through to the 'contain' default and
      // stores wrong rendered dimensions. setMediaSize() therefore gives wrong values.
      //
      // We reproduce the correct "cover" math here:
      //   mediaAspect >= containerAspect → vertical-cover → { w: ch*mediaAspect, h: ch }
      //   mediaAspect <  containerAspect → horizontal-cover → { w: cw, h: cw/mediaAspect }
      const cw = dims.width;
      const ch = dims.height;
      const mediaAspect = nw / nh;
      const containerAspect = cw / ch;
      const mw = mediaAspect >= containerAspect ? ch * mediaAspect : cw;
      const mh = mediaAspect >= containerAspect ? ch : cw / mediaAspect;

      const mediaSize = { width: mw, height: mh, naturalWidth: nw, naturalHeight: nh };

      // Compute exact croppedAreaPixels from current crop/zoom refs.
      const area = computePixels(currentCrop, mediaSize, currentCropSize, currentZoom);

      const blob = await cropImageToBlob(currentImageSrc, area, outputSize, outputType, outputQuality);
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

  const dialogTitle = title ?? (cropShape === "round" ? "Position your profile photo" : "Position your image");
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
          <div
            ref={cropContainerRef}
            className="relative w-full bg-black rounded-md overflow-hidden"
            style={{ height: 300 }}
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
              disabled={!cropSize || isSaving}
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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import type { Area } from "react-easy-crop/types";
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

  const imageSrcRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const isSavingRef = useRef(false);
  const cropRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const croppedAreaPixelsRef = useRef<Area | null>(null);

  // Measure the crop container so react-easy-crop gets a concrete cropSize.
  // Without this, aspectRatio-based heights aren't picked up by the library.
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | undefined>(undefined);

  useLayoutEffect(() => {
    const el = cropContainerRef.current;
    if (!el) return;
    const update = (w: number, h: number) => {
      if (w > 0 && h > 0) {
        const side = Math.min(w, h) - 8;
        setCropSize({ width: side, height: side });
      }
    };
    update(el.offsetWidth, el.offsetHeight);
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      update(width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

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
      croppedAreaPixelsRef.current = null;
      setLoadError(null);
      return;
    }
    setLoadError(null);
    croppedAreaPixelsRef.current = null;

    readFileAsDataUrl(file)
      .then((dataUrl) => {
        if (cancelled) return;
        setImageSrc(dataUrl);
        imageSrcRef.current = dataUrl;
        setCrop({ x: 0, y: 0 });
        cropRef.current = { x: 0, y: 0 };
        setZoom(1);
        zoomRef.current = 1;
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

  // react-easy-crop calls this whenever the crop/zoom changes and provides
  // croppedAreaPixels — the source rectangle in natural image coordinates.
  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    croppedAreaPixelsRef.current = croppedAreaPixels;
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;

    const currentImageSrc = imageSrcRef.current;
    const currentFile = fileRef.current;
    const pixels = croppedAreaPixelsRef.current;

    if (!currentImageSrc || !currentFile) return;
    if (!pixels || pixels.width <= 0 || pixels.height <= 0) {
      setLoadError("Crop area not ready. Please move or zoom the image and try again.");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const img = await loadImage(currentImageSrc);

      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d")!;

      if (outputType === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outputSize, outputSize);
      }

      // Draw only the cropped portion of the original image into the output canvas.
      ctx.drawImage(
        img,
        pixels.x, pixels.y, pixels.width, pixels.height,
        0, 0, outputSize, outputSize,
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
          {/* Crop canvas — fills full dialog width as a square */}
          <div
            ref={cropContainerRef}
            className="relative w-full bg-black rounded-md overflow-hidden"
            style={{ aspectRatio: "1 / 1", minHeight: "260px" }}
          >
            {imageSrc ? (
              <Cropper
                key={imageSrc}
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape={cropShape}
                cropSize={cropSize}
                objectFit="cover"
                showGrid={false}
                minZoom={1}
                maxZoom={4}
                restrictPosition={true}
                onCropChange={handleCropChange}
                onZoomChange={handleZoomChange}
                onCropComplete={handleCropComplete}
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
              disabled={!imageSrc || isSaving}
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

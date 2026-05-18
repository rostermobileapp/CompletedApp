import { useCallback, useEffect, useRef, useState } from "react";
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
  // cropSize is measured from the real container after the dialog animation
  // settles, then passed explicitly to the Cropper so the circle and the save
  // math are always in sync.
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);

  const imageSrcRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const isSavingRef = useRef(false);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  // onCropComplete fires whenever the user stops interacting — store the latest
  // croppedAreaPixels in a ref so handleSave always has the most recent value.
  const croppedAreaPixelsRef = useRef<Area | null>(null);

  useEffect(() => { fileRef.current = file; }, [file]);

  useEffect(() => {
    let cancelled = false;
    if (!file || !open) {
      setImageSrc(null);
      imageSrcRef.current = null;
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      croppedAreaPixelsRef.current = null;
      setCropSize(null);
      setLoadError(null);
      return;
    }
    setLoadError(null);
    setCropSize(null);
    readFileAsDataUrl(file)
      .then((dataUrl) => {
        if (!cancelled) {
          setImageSrc(dataUrl);
          imageSrcRef.current = dataUrl;
          setCrop({ x: 0, y: 0 });
          setZoom(1);
          croppedAreaPixelsRef.current = null;
          // Wait for the Dialog open animation to finish, then measure the
          // container's real width and derive an explicit square cropSize.
          // Passing cropSize as a prop means the Cropper never has to guess —
          // the circle and the pixel crop math always agree.
          setTimeout(() => {
            if (!cancelled && cropContainerRef.current) {
              const w = cropContainerRef.current.getBoundingClientRect().width;
              const side = Math.min(w, 300);
              setCropSize({ width: side, height: side });
            }
          }, 250);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || "Failed to load image");
      });
    return () => { cancelled = true; };
  }, [file, open]);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    croppedAreaPixelsRef.current = croppedAreaPixels;
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;

    const currentImageSrc = imageSrcRef.current;
    const currentFile = fileRef.current;
    const area = croppedAreaPixelsRef.current;

    if (!currentImageSrc || !currentFile) return;
    if (!area) {
      setLoadError("Crop area not ready yet. Please try again.");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const blob = await cropImageToBlob(
        currentImageSrc,
        area,
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
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
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

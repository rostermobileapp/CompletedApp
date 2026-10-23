import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';

type Props = {
  teamId: string; awardId: string; imageUrl?: string | null;
  onSaved: () => void; onError: (message: string) => void; onRemove?: () => void;
};

export function AwardImageEditor({ teamId, awardId, imageUrl, onSaved, onError, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedImage, setSavedImage] = useState(false);

  async function choose(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      onError('Choose a PNG or JPG no larger than 5 MB.'); return;
    }
    try {
      const source = await createImageBitmap(file);
      const scale = Math.min(1, 256 / Math.max(source.width, source.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Image processing is unavailable.');
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/png').split(',')[1];
      setImage(data); setDirty(true); setSavedImage(false);
      source.close();
    } catch { onError('That image could not be processed. Try another file.'); }
  }
  async function save() {
    if (!image) return;
    setBusy(true);
    try {
      await apiRequest('POST', `/api/teams/${teamId}/awards/${awardId}/image`, { image });
      setDirty(false); setSavedImage(true); onSaved();
    } catch (e: any) { onError(e?.message || 'Image could not be saved.'); }
    finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background ring-1 ring-border/70">
        {image ? <img src={`data:image/png;base64,${image}`} alt="Award image preview" className="h-full w-full object-contain" />
          : imageUrl ? <img src={imageUrl} alt="Current award artwork" className="h-full w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Award artwork</p><p className="text-xs text-muted-foreground">PNG or JPG · up to 5 MB · saved as a crisp 256 px PNG</p>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>{imageUrl || image ? 'Change' : 'Upload'}</Button>
      {imageUrl && !image && onRemove && <Button type="button" variant="ghost" size="sm" onClick={onRemove}>Remove</Button>}
    </div>
    {image && <div className="mt-3 flex flex-wrap gap-2">
      {dirty && <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save image'}</Button>}
      {savedImage && <p role="status" className="basis-full text-xs font-medium text-primary">Image saved to this award.</p>}
    </div>}
  </div>;
}

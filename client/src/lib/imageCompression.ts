import imageCompression from 'browser-image-compression';

const PRESETS = {
  avatar:       { maxSizeMB: 0.3,  maxWidthOrHeight: 512,  useWebWorker: true, fileType: 'image/jpeg' as const, initialQuality: 0.85 },
  rosterPhoto:  { maxSizeMB: 0.4,  maxWidthOrHeight: 1080, useWebWorker: true, fileType: 'image/jpeg' as const, initialQuality: 0.85 },
  teamLogo:     { maxSizeMB: 0.2,  maxWidthOrHeight: 600,  useWebWorker: true, fileType: 'image/jpeg' as const, initialQuality: 0.9  },
  leagueAsset:  { maxSizeMB: 0.5,  maxWidthOrHeight: 1600, useWebWorker: true, fileType: 'image/jpeg' as const, initialQuality: 0.85 },
  messageImage: { maxSizeMB: 0.5,  maxWidthOrHeight: 1200, useWebWorker: true, fileType: 'image/jpeg' as const, initialQuality: 0.85 },
} as const;

type Preset = keyof typeof PRESETS;

const MAX_FINAL_SIZE_MB = 2;

export async function compressImage(file: File, preset: Preset = 'rosterPhoto'): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const nameLower = file.name.toLowerCase();
  if (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    nameLower.endsWith('.heic') ||
    nameLower.endsWith('.heif')
  ) {
    throw new Error(
      'HEIC photos are not supported. On iPhone, choose "Most Compatible" in Settings → Camera → Formats, or export as JPEG before uploading.'
    );
  }

  const options = PRESETS[preset];

  if (file.size <= options.maxSizeMB * 1024 * 1024) {
    console.log(`[compressImage] ${file.name}: already small enough (${(file.size / 1024).toFixed(0)} KB), skipping`);
    return file;
  }

  try {
    const compressed = await imageCompression(file, options);
    console.log(
      `[compressImage] ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)} MB → ${(compressed.size / 1024 / 1024).toFixed(2)} MB`
    );

    if (compressed.size > MAX_FINAL_SIZE_MB * 1024 * 1024) {
      throw new Error(
        `Image is still ${(compressed.size / 1024 / 1024).toFixed(1)} MB after compression. Please use a smaller image (under 2 MB).`
      );
    }

    return compressed;
  } catch (err) {
    if (err instanceof Error) {
      const msg = err.message;
      if (
        msg.includes('HEIC') ||
        msg.includes('still') ||
        msg.includes('smaller') ||
        msg.includes('2 MB')
      ) {
        throw err;
      }
    }
    console.error('[compressImage] compression failed, uploading original:', err);
    return file;
  }
}

import { Jimp } from "jimp";
import { TEAM_AWARD_LIMITS } from "../shared/teamAwards";

export function decodeAwardImage(value: unknown): Buffer {
  if (typeof value !== "string" || value.length > Math.ceil(TEAM_AWARD_LIMITS.imageBytes / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("Choose a PNG or JPG image up to 5 MB.");
  }
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > TEAM_AWARD_LIMITS.imageBytes) throw new Error("Image exceeds 5 MB.");
  let width = 0, height = 0;
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.length >= 24) {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 218 || marker === 217) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        height = bytes.readUInt16BE(offset + 5); width = bytes.readUInt16BE(offset + 7); break;
      }
      offset += length + 2;
    }
  }
  if (!width || !height || width * height > 16_777_216) {
    throw new Error("Choose a valid PNG/JPG image of at most 16 megapixels.");
  }
  return bytes;
}

export async function normalizeAwardImage(value: unknown): Promise<Buffer> {
  const image = await Jimp.read(decodeAwardImage(value));
  image.scaleToFit({ w: TEAM_AWARD_LIMITS.imageEdge, h: TEAM_AWARD_LIMITS.imageEdge });
  return image.getBuffer("image/png");
}

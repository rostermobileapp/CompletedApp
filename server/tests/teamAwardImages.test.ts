import test from "node:test";
import assert from "node:assert/strict";
import { Jimp } from "jimp";
import { decodeAwardImage, normalizeAwardImage } from "../teamAwardImages";

test("images are content-validated, bounded, normalized PNGs",async () => {
  const original = new Jimp({ width:512,height:128,color:0xffaa00ff });
  const png=await original.getBuffer("image/png");
  const normalized=await normalizeAwardImage(png.toString("base64"));
  const output=await Jimp.read(normalized);
  assert.equal(output.width,256); assert.equal(output.height,64);
  assert.throws(() => decodeAwardImage(Buffer.from("<svg>not a photo</svg>").toString("base64")),/valid PNG/);
  assert.throws(() => decodeAwardImage("x".repeat(7_000_000)),/5 MB/);
  const malicious=Buffer.from(png); malicious.writeUInt32BE(1_000_000,16);
  assert.throws(() => decodeAwardImage(malicious.toString("base64")),/megapixels/);
  const jpeg=await original.getBuffer("image/jpeg");
  assert.ok(decodeAwardImage(jpeg.toString("base64")));
});

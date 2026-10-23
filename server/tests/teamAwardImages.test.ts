import test from "node:test";
import assert from "node:assert/strict";
import { Jimp } from "jimp";
import { decodeAwardImage, normalizeAwardImage } from "../teamAwardImages";
import { removeAwardBackground } from "../../supabase/functions/_shared/award-background";

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
test("background provider failure never requires replacing the original",async () => {
  const original=new Uint8Array([1,2,3]);
  await assert.rejects(removeAwardBackground(original,"removebg","test-key",
    (async () => new Response("unavailable",{status:503})) as typeof fetch),/original/);
  assert.deepEqual(original,new Uint8Array([1,2,3]));
  await assert.rejects(removeAwardBackground(original,"unknown","test-key"),/not configured/);
  await assert.rejects(removeAwardBackground(original,"removebg",""),/not configured/);
});
test("both providers use the server-side credential boundary and return verified PNG",async () => {
  const png=await new Jimp({width:1,height:1,color:0}).getBuffer("image/png");
  for (const provider of ["removebg","photoroom"]) {
    const result=await removeAwardBackground(new Uint8Array(png),provider,"test-key",(async (url,init) => {
      assert.equal((init?.headers as any)["X-Api-Key"],"test-key");
      assert.ok(String(url).startsWith(provider==="removebg" ? "https://api.remove.bg/" : "https://sdk.photoroom.com/"));
      return new Response(png,{headers:{"Content-Type":"image/png"}});
    }) as typeof fetch);
    assert.deepEqual(Buffer.from(result),png);
  }
  await assert.rejects(removeAwardBackground(new Uint8Array(png),"removebg","test-key",
    (async () => new Response("<html>",{headers:{"Content-Type":"text/html"}})) as typeof fetch),/unsupported/);
});

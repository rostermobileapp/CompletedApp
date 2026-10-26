import { isolateDevelopmentEnvironment } from "../server/nonproductionEnvironment";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { randomUUID } from "node:crypto";

async function main() {
  const env = isolateDevelopmentEnvironment(process.env);
  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws as any },
  });
  const buckets = await client.storage.listBuckets();
  if (buckets.error) throw buckets.error;
  const existing = buckets.data.find(bucket => bucket.id === "private");
  if (existing?.public) throw new Error("Refusing to change an existing public bucket");
  if (!existing) {
    const created = await client.storage.createBucket("private", { public: false });
    if (created.error) throw created.error;
  }
  const name = `profile-images/dev-fixture-${randomUUID()}.png`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
  const uploaded = await client.storage.from("private").upload(name, png, { contentType: "image/png", upsert: false });
  if (uploaded.error) throw uploaded.error;
  const downloaded = await client.storage.from("private").download(name);
  if (downloaded.error) throw downloaded.error;
  if ((await downloaded.data.arrayBuffer()).byteLength !== png.byteLength) {
    throw new Error("Synthetic storage round trip did not match");
  }
  const signed = await client.storage.from("private").createSignedUploadUrl(`profile-images/dev-reserved-${randomUUID()}.png`);
  if (signed.error) throw signed.error;
  if (new URL(signed.data.signedUrl).origin !== new URL(env.SUPABASE_URL!).origin) {
    throw new Error("Signed upload URL does not belong to the development project");
  }
  console.info("[Dev storage] Private bucket and synthetic upload/download verified on the development project.");
}
main().catch(error => {
  console.error("[Dev storage] Setup stopped.", { code: error?.code ?? error?.statusCode ?? "STORAGE_SETUP_REFUSED" });
  process.exitCode = 1;
});

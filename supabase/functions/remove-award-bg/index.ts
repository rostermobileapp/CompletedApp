// @ts-nocheck -- Supabase Edge Runtime (Deno); checked separately from the Node app.
import { createClient } from "npm:@supabase/supabase-js@2.78.0";
import { Jimp } from "npm:jimp@1.6.0";
import { removeAwardBackground } from "../_shared/award-background.ts";

const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
Deno.serve(async req => {
  if (req.method !== "POST") return json({ message: "Use POST." }, 405);
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ message: "Sign in as the team captain." }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7));
  if (authError || !user) return json({ message: "Sign in as the team captain." }, 401);
  try {
    if (Number(req.headers.get("content-length") || 0) > 8 * 1024 * 1024) return json({ message: "Image exceeds 5 MB." }, 413);
    let total = 0;
    const chunks: Uint8Array[] = [];
    const reader = req.body?.getReader();
    if (!reader) return json({ message: "Choose an image." }, 400);
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 8 * 1024 * 1024) { await reader.cancel(); return json({ message: "Image exceeds 5 MB." }, 413); }
      chunks.push(value);
    }
    const all = new Uint8Array(total);
    let offset = 0; for (const c of chunks) { all.set(c, offset); offset += c.length; }
    const { teamId, awardId, image } = JSON.parse(new TextDecoder().decode(all));
    if (typeof teamId !== "string" || teamId.length > 100 ||
        typeof awardId !== "string" || !/^[a-f0-9-]{36}$/i.test(awardId) ||
        typeof image !== "string" || image.length > 6990508 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length % 4 !== 0) {
      return json({ message: "Choose a valid image and team award." }, 400);
    }
    // All callers, including direct Edge calls, must reserve an authorized slot.
    // Reject missing provider configuration before consuming the team's quota.
    const provider = Deno.env.get("AWARD_BG_PROVIDER") || "removebg";
    const key = Deno.env.get("AWARD_BG_API_KEY");
    if (!key || !["removebg", "photoroom"].includes(provider)) {
      return json({ message: "Background removal is not configured. You can still save the original." }, 503);
    }
    const bytes = Uint8Array.from(atob(image), c => c.charCodeAt(0));
    // Edge accepts the already-normalized PNG from Express, but does not trust it.
    if (bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) {
      return json({ message: "Upload a PNG/JPG through the award image editor." }, 400);
    }
    const dimensions = new DataView(bytes.buffer);
    if (!dimensions.getUint32(16) || !dimensions.getUint32(20) ||
        dimensions.getUint32(16) > 256 || dimensions.getUint32(20) > 256) {
      return json({ message: "Resize the image to at most 256 pixels first." }, 400);
    }
    const { error } = await client.rpc("team_award_reserve_removal", { p_team: teamId, p_id: awardId, p_user: user.id });
    if (error) return json({ message: error.code === "23514"
      ? "This team has used its background removals for this month. You can still save the original."
      : "Only the team captain can remove award backgrounds." }, error.code === "23514" ? 429 : 403);
    const removed = await removeAwardBackground(bytes, provider, key);
    const decoded = await Jimp.read(removed);
    decoded.scaleToFit({ w:256,h:256 });
    const output = await decoded.getBuffer("image/png");
    let binary = ""; for (const b of output) binary += String.fromCharCode(b);
    return json({ image: btoa(binary) });
  } catch {
    return json({ message: "Background removal failed. You can still save the original image." }, 503);
  }
});

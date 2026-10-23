import type { Express, RequestHandler } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { z } from "zod";
import { normalizeAwardImage } from "./teamAwardImages";
import { TEAM_AWARD_CADENCES, TEAM_AWARD_PRESETS } from "../shared/teamAwards";

// Caller-scoped clients keep JWT/RLS authority; NEVER use the service key here.
function caller(req: any): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: req.headers.authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as any },
  });
}
const id = z.string().uuid();
const teamId = z.string().min(1).max(100);
const save = z.object({
  id: id.optional(), name: z.string().trim().min(1).max(40),
  description: z.string().max(140).default(""), cadence: z.enum(TEAM_AWARD_CADENCES),
  presetIcon: z.enum(TEAM_AWARD_PRESETS), removeImage: z.boolean().default(false),
}).strict();
const setupMissing = (error: any) => ["PGRST202", "42P01", "42883"].includes(error?.code);
async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}
async function signImages(client: SupabaseClient, awards: any[]) {
  await Promise.all(awards.map(async a => {
    if (!a.imageUrl) return;
    const expected = `${a.teamId}/${a.id}.png`;
    if (a.imageUrl !== expected) { a.imageUrl = null; return; }
    const { data, error } = await client.storage.from("team-award-images")
      .createSignedUrl(expected, 300, { transform: undefined });
    // Preset fallback is intentional; a missing image must not hide the award.
    a.imageUrl = !error && data ? `${data.signedUrl}&v=${encodeURIComponent(a.imageVersion)}` : null;
  }));
}
function errorResponse(res: any, error: any) {
  if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
  if (setupMissing(error)) return res.status(503).json({ message: "Custom Team Awards setup is not installed yet.", setupRequired: true });
  const codes: Record<string, number> = { "42501":403, "23505":409, "23514":400, "22023":400, "P0002":404, "22P02":400 };
  const status = codes[error?.code] ?? 500;
  return res.status(status).json({ message: status === 500 ? "Unable to complete this award request. Please try again." : error.message });
}
export function registerTeamAwardRoutes(app: Express, auth: RequestHandler, clientFor = caller,
  notifyRecipient: (userId: string) => void = () => {}) {
  const route = (work: (req: any, res: any, client: SupabaseClient) => Promise<unknown>): RequestHandler =>
    async (req: any, res) => {
      // Demo replaces the app identity, not the bearer JWT. Never cross that boundary.
      if (req.demoContext) return res.status(403).json({ message: "Custom Team Awards are unavailable in Demo." });
      res.setHeader("Cache-Control", "no-store");
      try { await work(req, res, clientFor(req)); } catch (error) { errorResponse(res, error); }
    };
  app.get("/api/team-awards/config", auth, route(async (_req, res, client) => {
    try { res.json({ enabled: await rpc(client, "ta_enabled") }); }
    catch (error) {
      if (setupMissing(error)) return res.json({ enabled: false, setupRequired: true });
      throw error;
    }
  }));
  app.get("/api/team-awards/holders", auth, route(async (_req, res, client) => {
    const awards = await rpc(client, "team_award_holders");
    await signImages(client, awards); res.json(awards);
  }));
  app.get("/api/team-awards/events/pending", auth, route(async (_req, res, client) => {
    try {
      const events = await rpc(client, "team_award_pending_celebrations");
      // Stored identity is awardId, while the signing boundary expects id.
      const artwork = events.map((event: any) => ({ ...event, id: event.awardId }));
      await signImages(client, artwork);
      res.json({ events: events.map((event: any, index: number) => ({ ...event, imageUrl: artwork[index].imageUrl })) });
    } catch (error) {
      if (setupMissing(error)) return res.json({ events: [], setupRequired: true });
      throw error;
    }
  }));
  app.post("/api/team-awards/events/:eventId/acknowledge", auth, route(async (req, res, client) => {
    await rpc(client, "team_award_acknowledge_celebration", { p_event: id.parse(req.params.eventId) });
    res.json({ ok: true });
  }));
  app.get("/api/teams/:teamId/awards", auth, route(async (req, res, client) => {
    const bundle = await rpc(client, "team_award_list", { p_team: teamId.parse(req.params.teamId) });
    await signImages(client, bundle.awards); res.json(bundle);
  }));
  app.post("/api/teams/:teamId/awards", auth, route(async (req, res, client) => {
    const body = save.parse(req.body);
    const awardId = await rpc(client, "team_award_save", {
      p_team: teamId.parse(req.params.teamId), p_id: body.id ?? null, p_name: body.name,
      p_description: body.description, p_cadence: body.cadence, p_preset: body.presetIcon, p_remove_image: body.removeImage,
    });
    res.json({ id: awardId });
  }));
  app.patch("/api/teams/:teamId/awards/:awardId", auth, route(async (req, res, client) => {
    z.object({ archived: z.literal(true) }).strict().parse(req.body);
    await rpc(client, "team_award_archive", { p_team: teamId.parse(req.params.teamId), p_id: id.parse(req.params.awardId) });
    res.json({ ok: true });
  }));
  app.patch("/api/teams/:teamId/award-settings", auth, route(async (req, res, client) => {
    const body = z.object({ timezone: z.string().min(1).max(100) }).strict().parse(req.body);
    await rpc(client, "team_award_set_timezone", { p_team: teamId.parse(req.params.teamId), p_timezone: body.timezone });
    res.json({ ok: true });
  }));
  app.post("/api/teams/:teamId/awards/:awardId/grants", auth, route(async (req, res, client) => {
    const body = z.object({ playerId: z.string().min(1).max(100), periodKey: z.string().min(1).max(100), reassign: z.boolean().default(false) }).strict().parse(req.body);
    const result = await rpc(client, "team_award_grant", {
      p_team: teamId.parse(req.params.teamId), p_id: id.parse(req.params.awardId),
      p_player: body.playerId, p_period: body.periodKey, p_reassign: body.reassign,
    });
    if (result.changed) {
      try { notifyRecipient(body.playerId); }
      catch { console.error("[TeamAwards] Live refresh unavailable; recognition remains queued."); }
    }
    res.json(result);
  }));
  app.post("/api/teams/:teamId/awards/:awardId/image", auth, route(async (req, res, client) => {
    const t = teamId.parse(req.params.teamId), a = id.parse(req.params.awardId);
    // Authorize before expensive decoding; Storage performs a second check on write.
    const bundle = await rpc(client, "team_award_list", { p_team: t });
    if (!bundle.canManage || !bundle.awards.some((v: any) => v.id === a && !v.archived)) {
      return res.status(403).json({ message: "Only the team captain can change award images." });
    }
    let png: Buffer;
    try { png = await normalizeAwardImage(req.body?.image); }
    catch { return res.status(400).json({ message: "Choose a valid PNG/JPG image up to 5 MB and 16 megapixels." }); }
    const { error } = await client.storage.from("team-award-images").upload(`${t}/${a}.png`, png,
      { contentType: "image/png", upsert: true, cacheControl: "0" });
    if (error) return res.status(503).json({ message: "Image could not be saved. Your award is safe; try uploading again." });
    await rpc(client, "team_award_attach_image", { p_team: t, p_id: a });
    res.json({ ok: true });
  }));
}

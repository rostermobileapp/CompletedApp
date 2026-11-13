import { withSupabase } from "npm:@supabase/server@1";
import { recalculateGame, recalculateSourceGame, recalculateTeam } from "./calculator.ts";

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, ctx) => {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let requestBody: Record<string, unknown>;
    try {
      requestBody = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const targets = ["team_id", "game_id", "source_game_id"] as const;
    const supplied = targets.filter((key) => requestBody[key] !== undefined);
    if (supplied.length !== 1) {
      return Response.json({ error: "Provide exactly one recalculation target" }, { status: 400 });
    }
    const target = requestBody[supplied[0]];
    if (typeof target !== "string" || target.length < 1 || target.length > 100) {
      return Response.json({ error: "A valid recalculation target is required" }, { status: 400 });
    }
    try {
      const result = supplied[0] === "game_id"
        ? await recalculateGame(ctx.supabaseAdmin, target)
        : supplied[0] === "source_game_id"
          ? await recalculateSourceGame(ctx.supabaseAdmin, target)
          : await recalculateTeam(ctx.supabaseAdmin, target);
      return Response.json({ ok: true, ...result });
    } catch (error) {
      console.error("Win-chance recalculation failed", error);
      return Response.json({ error: "Prediction update failed" }, { status: 500 });
    }
  }),
};

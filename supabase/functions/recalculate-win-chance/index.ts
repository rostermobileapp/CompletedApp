import { withSupabase } from "npm:@supabase/server@1";
import { recalculateTeam } from "./calculator.ts";

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, ctx) => {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let teamId: unknown;
    try {
      const body = await request.json();
      teamId = body?.team_id;
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (typeof teamId !== "string" || teamId.length < 1 || teamId.length > 100) {
      return Response.json({ error: "A valid team_id is required" }, { status: 400 });
    }
    try {
      return Response.json({ ok: true, ...await recalculateTeam(ctx.supabaseAdmin, teamId) });
    } catch (error) {
      console.error("Win-chance recalculation failed", error);
      return Response.json({ error: "Prediction update failed" }, { status: 500 });
    }
  }),
};

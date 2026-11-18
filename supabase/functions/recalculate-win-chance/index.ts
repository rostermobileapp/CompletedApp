import { withSupabase } from "npm:@supabase/server@1";
import { handleWinChanceRequest } from "./handler.ts";

export default {
  fetch: withSupabase({ auth: "secret" }, (request, ctx) =>
    handleWinChanceRequest(request, ctx.supabaseAdmin)),
};

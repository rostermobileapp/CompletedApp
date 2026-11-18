import { recalculateGame, recalculateSourceGame, recalculateSourceGames, recalculateTeam } from "./calculator.ts";

export const WIN_CHANCE_CONTRACT = "win-chance-targets-v2";
export const WIN_CHANCE_TARGETS = ["team_id", "game_id", "source_game_id", "source_game_ids"] as const;

type Calculators = {
  recalculateGame: typeof recalculateGame;
  recalculateSourceGame: typeof recalculateSourceGame;
  recalculateSourceGames: typeof recalculateSourceGames;
  recalculateTeam: typeof recalculateTeam;
};
const calculators = { recalculateGame, recalculateSourceGame, recalculateSourceGames, recalculateTeam };

/** Authentication remains in index.ts; this handler never constructs a client. */
export async function handleWinChanceRequest(request: Request, admin: any, calculate: Calculators = calculators) {
  // Authenticated, read-only deployment verification. Older functions return
  // 405 here, so callers must verify this before sending validate_only requests.
  if (request.method === "GET" && new URL(request.url).searchParams.get("contract") === "1") {
    return Response.json({ ok: true, contract: WIN_CHANCE_CONTRACT, targets: WIN_CHANCE_TARGETS });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let requestBody: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    requestBody = value as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const supplied = WIN_CHANCE_TARGETS.filter((key) => requestBody[key] !== undefined);
  if (supplied.length !== 1) {
    return Response.json({ error: "Provide exactly one recalculation target" }, { status: 400 });
  }
  const target = requestBody[supplied[0]];
  if (supplied[0] === "source_game_ids") {
    if (!Array.isArray(target) || target.length < 1 || target.length > 25
      || target.some(id => typeof id !== "string" || id.trim().length < 1 || id.length > 100)) {
      return Response.json({ error: "Provide between 1 and 25 valid source game IDs" }, { status: 400 });
    }
  } else if (typeof target !== "string" || target.trim().length < 1 || target.length > 100) {
    return Response.json({ error: "A valid recalculation target is required" }, { status: 400 });
  }
  if (requestBody.validate_only !== undefined && typeof requestBody.validate_only !== "boolean") {
    return Response.json({ error: "validate_only must be a boolean" }, { status: 400 });
  }
  // Validate every real request shape without reading game data or writing any
  // predictions. Used only after the authenticated contract handshake above.
  if (requestBody.validate_only === true) {
    return Response.json({ ok: true, validated: true, contract: WIN_CHANCE_CONTRACT, target: supplied[0] });
  }
  try {
    const result = supplied[0] === "game_id"
      ? await calculate.recalculateGame(admin, target as string)
      : supplied[0] === "source_game_id"
        ? await calculate.recalculateSourceGame(admin, target as string)
        : supplied[0] === "source_game_ids"
          ? await calculate.recalculateSourceGames(admin, target as string[])
          : await calculate.recalculateTeam(admin, target as string);
    return Response.json({ ok: true, ...result });
  } catch {
    console.error("Win-chance recalculation failed");
    return Response.json({ error: "Prediction update failed" }, { status: 500 });
  }
}

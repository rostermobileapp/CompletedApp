import { sql, type SQL } from "drizzle-orm";
import { countSeasonPatches, seasonPatchWindow, type PatchStatsAward, type PatchStatsWindow } from "../shared/seasonPatchCounts";

type PatchStatsExecutor = {
  execute(query: SQL): Promise<{ rows: Record<string, any>[] }>;
};

/** One batched lookup for the actual players in the authorized stats response. */
export async function getSeasonPatchCounts(
  executor: PatchStatsExecutor,
  input: { leagueId: string; seasonId?: string; userIds: (string | null)[] },
): Promise<Map<string, number>> {
  const userIds = Array.from(new Set(input.userIds.filter((id): id is string => !!id)));
  if (!userIds.length) return new Map();
  let window: PatchStatsWindow | undefined;
  if (input.seasonId) {
    const result = await executor.execute(sql`
      SELECT s.start_date, s.end_date, s.is_active, l.timezone,
        MIN(g.scheduled_at) AS first_game, MAX(g.scheduled_at) AS last_game
      FROM seasons s
      JOIN leagues l ON l.id = s.league_id
      LEFT JOIN games g ON g.season_id = s.id AND g.league_id = l.id
      WHERE s.id = ${input.seasonId} AND s.league_id = ${input.leagueId}
      GROUP BY s.id, l.timezone
    `);
    const season = result.rows[0];
    if (!season) throw new Error("Patch stats season does not belong to this league");
    const date = (value: unknown): Date | null => value == null ? null : new Date(value as string | Date);
    const resolved = seasonPatchWindow({
      startDate: date(season.start_date), endDate: date(season.end_date),
      firstGame: date(season.first_game), lastGame: date(season.last_game),
      isActive: season.is_active === true,
      timezone: season.timezone || "America/New_York",
    });
    if (!resolved) return new Map();
    window = resolved;
  }
  const result = await executor.execute(sql`
    SELECT a.user_id, a.badge_definition_id, a.tier, a.scope_key, a.count,
      a.awarded_at, d.achievement_type
    FROM badge_awards a
    JOIN badge_definitions d ON d.id = a.badge_definition_id
    WHERE a.user_id IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})
      ${window ? sql`AND a.awarded_at < ${window.endExclusive.toISOString()}::timestamp` : sql``}
  `);
  const awards: PatchStatsAward[] = result.rows.map(row => ({
    userId: row.user_id, badgeDefinitionId: row.badge_definition_id, tier: row.tier,
    scopeKey: row.scope_key, count: Number(row.count),
    achievementType: row.achievement_type, awardedAt: new Date(row.awarded_at),
  }));
  return countSeasonPatches(awards, window);
}

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  badgeAwards,
  badgeDefinitions,
  badgeEarnedEvents,
  badgeProgress,
  badgeTiers,
  gameAttendance,
  gameGoals,
  gameGoalies,
  gameStars,
  gameRsvps,
  games,
  leagueMemberships,
  playerStats,
  substituteRequests,
  teamMemberships,
  type BadgeDefinition,
  type BadgeEarnedEvent,
} from "@shared/schema";
import { db } from "./db";
import { newlyReachedTiers, reachedTiers } from "./badgeTierEligibility";
import { THREE_STARS_TIERS } from "@shared/threeStarsTiers";
import { CENTURY_CLUB_TIERS } from "@shared/centuryClubTiers";
import { HAT_TRICK_TIERS } from "@shared/hatTrickTiers";

export type BadgeCategory = "nhl_trophy" | "team_badge" | "achievement";
export type BadgeAchievementType = "multiplier" | "tiered" | "onetime";
export type BadgeTierName = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legend" | "god_mode";

export type TrophyCaseAccess = "eligible" | "missing_dob" | "invalid_dob" | "under_21";

export function getTrophyCaseAccess(dateOfBirth: string | null | undefined, today = new Date()): TrophyCaseAccess {
  if (!dateOfBirth) return "missing_dob";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return "invalid_dob";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed > today
  ) {
    return "invalid_dob";
  }

  let age = today.getFullYear() - year;
  const birthdayHasPassed = today.getMonth() > month - 1
    || (today.getMonth() === month - 1 && today.getDate() >= day);
  if (!birthdayHasPassed) age -= 1;

  return age >= 21 ? "eligible" : "under_21";
}

export type BadgeCatalogInput = {
  slug?: string;
  name: string;
  description: string;
  lockedHint?: string | null;
  category: BadgeCategory;
  achievementType?: BadgeAchievementType | null;
  triggerType?: "manual" | "metric" | "event";
  triggerKey?: string | null;
  triggerConfig?: Record<string, unknown>;
  imagePath?: string | null;
  placeholderColor?: string;
  ownerTeamId?: string | null;
  ownerSeasonId?: string | null;
  tiers?: Array<{
    tier: BadgeTierName;
    threshold: number;
    imagePath?: string | null;
    color?: string | null;
  }>;
};

const TIER_COLORS: Record<BadgeTierName, string> = {
  bronze: "#8B5A1A",
  silver: "#909090",
  gold: "#C9A84C",
  platinum: "#4a6a8a",
  diamond: "#b9d4de",
  legend: "#1a0a1a",
  god_mode: "#F97316",
};

const defaultTier = (tier: BadgeTierName, threshold: number) => ({
  tier,
  threshold,
  color: TIER_COLORS[tier],
  imagePath: null,
});

const DEFAULT_BADGES: BadgeCatalogInput[] = [
  ["hart_trophy", "Hart Trophy", "Most Valuable Player.", "nhl_trophy"],
  ["vezina_trophy", "Vezina Trophy", "Best Goaltender.", "nhl_trophy"],
  ["norris_trophy", "Norris Trophy", "Best Defenseman.", "nhl_trophy"],
  ["art_ross_trophy", "Art Ross Trophy", "Points Leader.", "nhl_trophy"],
  ["richard_trophy", "Maurice Richard Trophy", "Goals Leader.", "nhl_trophy"],
  ["lady_byng_trophy", "Lady Byng Trophy", "Sportsmanship.", "nhl_trophy"],
  ["selke_trophy", "Selke Trophy", "Best Defensive Forward.", "nhl_trophy"],
  ["conn_smythe", "Conn Smythe Trophy", "Playoff MVP.", "nhl_trophy"],
  ["jennings_trophy", "William Jennings Trophy", "Fewest Goals Against.", "nhl_trophy"],
  ["jack_adams", "Jack Adams Award", "Coach of the Year.", "nhl_trophy"],
  ["the_bender", "The Bender", "Should not have laced up... but did anyway.", "team_badge"],
  ["the_architect", "The Architect", "Most assists on the season.", "team_badge"],
  ["the_brick_wall", "The Brick Wall", "Fewest goals allowed.", "team_badge"],
  ["the_enforcer", "The Enforcer", "Most penalty minutes.", "team_badge"],
  ["the_sniper", "The Sniper", "Led the team in goals.", "team_badge"],
  ["the_houseplant", "The Houseplant", "Most games played, fewest points.", "team_badge"],
  ["the_iron_man", "The Iron Man", "Played every single game.", "team_badge"],
].map(([slug, name, description, category]) => ({
  slug,
  name,
  description,
  category: category as BadgeCategory,
  triggerType: "manual" as const,
  placeholderColor: category === "nhl_trophy" ? "#C9A84C" : "#3A7EEC",
}));

const achievement = (
  slug: string,
  name: string,
  description: string,
  achievementType: BadgeAchievementType,
  triggerType: "metric" | "event",
  triggerKey: string,
  triggerConfig: Record<string, unknown> = {},
  tiers: BadgeCatalogInput["tiers"] = [],
): BadgeCatalogInput => ({
  slug,
  name,
  description,
  category: "achievement",
  achievementType,
  triggerType,
  triggerKey,
  triggerConfig,
  placeholderColor: "#C9A84C",
  tiers,
});

DEFAULT_BADGES.push(
  achievement("hat_trick", "Hat Trick", "Games with 3 or more goals in one season. Each qualifying game counts once.", "tiered", "metric", "season_hat_tricks", {}, [
    ...HAT_TRICK_TIERS.map(({ tier, threshold, imagePath }) => ({
      ...defaultTier(tier, threshold), imagePath,
    })),
  ]),
  achievement("iron_man", "Iron Man", "Play consecutive games without missing one.", "tiered", "metric", "consecutive_games_played", {}, [
    defaultTier("bronze", 5), defaultTier("silver", 10), defaultTier("gold", 15), defaultTier("platinum", 25),
  ]),
  achievement("century_club", "Century Club", "Games and scrimmages played this calendar year. Resets January 1.", "tiered", "metric", "calendar_year_appearances", {}, [
    ...CENTURY_CLUB_TIERS.map(({ tier, threshold, imagePath }) => ({
      ...defaultTier(tier, threshold), imagePath,
    })),
  ]),
  achievement("broom", "Broom", "Career shutouts as a goalie.", "tiered", "metric", "career_shutouts", {}, [
    defaultTier("bronze", 1), defaultTier("silver", 3), defaultTier("gold", 10), defaultTier("platinum", 25),
  ]),
  achievement("beer_me", "Beer Me", "Post-game dedication.", "tiered", "metric", "season_beers", {}, [
    defaultTier("bronze", 1), defaultTier("silver", 10), defaultTier("gold", 25), defaultTier("platinum", 50), defaultTier("legend", 100), defaultTier("god_mode", 250),
  ]),
  achievement("on_fire", "On Fire", "Multi-game scoring streaks.", "tiered", "metric", "scoring_streak_games", {}, [
    defaultTier("bronze", 3), defaultTier("silver", 5), defaultTier("gold", 10), defaultTier("platinum", 20),
  ]),
  achievement("three_stars", "3 Stars", "Earn 3 Stars points: 3 for first star, 2 for second, and 1 for third.", "tiered", "metric", "career_three_stars", {}, [
    ...THREE_STARS_TIERS.map(({ tier, threshold, imagePath }) => ({
      ...defaultTier(tier, threshold),
      imagePath,
    })),
  ]),
  achievement("rsvp_king", "RSVP King", "First to respond to every game invite in a season.", "multiplier", "metric", "season_first_rsvp_streak"),
  achievement("team_player", "Team Player", "Filled a sub spot for another team.", "multiplier", "metric", "career_sub_appearances"),
  achievement("rookie_card", "Rookie Card", "Your first game ever logged on Roster.", "onetime", "event", "first_game_logged"),
  achievement("sub", "Sub", "First time subbing in for another player.", "onetime", "event", "first_sub_appearance"),
  achievement("league_hopper", "League Hopper", "Played in 3 or more different leagues.", "onetime", "metric", "career_leagues_played", { threshold: 3 }),
  achievement("early_bird", "Early Bird", "RSVP'd Yes more than 48 hours before every game in a season.", "onetime", "event", "season_48hr_rsvp_perfect"),
  achievement("ghost", "Ghost", "Marked Out for 3 or more games in a row.", "onetime", "metric", "consecutive_games_out", { threshold: 3 }),
  achievement("sub_magnet", "Sub Magnet", "Had the most subs fill in for you across a season.", "onetime", "event", "season_most_subs_winner"),
);

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  nhl_trophy: "League Awards",
  team_badge: "Team Awards",
  achievement: "Achievements",
};

export async function ensureDefaultBadges() {
  for (const badge of DEFAULT_BADGES) {
    if (!badge.slug) continue;
    const [existing] = await db.select({ id: badgeDefinitions.id })
      .from(badgeDefinitions)
      .where(eq(badgeDefinitions.slug, badge.slug))
      .limit(1);
    if (existing) {
      if ((badge.slug === "three_stars" || badge.slug === "century_club" || badge.slug === "hat_trick") && badge.tiers?.length) {
        if (badge.slug === "century_club" || badge.slug === "hat_trick") {
          await db.update(badgeDefinitions).set({
            triggerKey: badge.triggerKey,
            description: badge.description,
          }).where(eq(badgeDefinitions.id, existing.id));
        } else {
          await db.update(badgeDefinitions).set({ description: badge.description })
          .where(and(
            eq(badgeDefinitions.id, existing.id),
            eq(badgeDefinitions.description, "Named one of the 3 stars of the game."),
          ));
        }
        // Keep shipped tier art and thresholds in sync on existing installations.
        for (const tier of badge.tiers) {
          await db.insert(badgeTiers).values({
            badgeDefinitionId: existing.id,
            tier: tier.tier,
            threshold: tier.threshold,
            imagePath: tier.imagePath ?? null,
            color: tier.color ?? TIER_COLORS[tier.tier],
          }).onConflictDoUpdate({
            target: [badgeTiers.badgeDefinitionId, badgeTiers.tier],
            set: {
              threshold: tier.threshold,
              imagePath: tier.imagePath ?? null,
              color: tier.color ?? TIER_COLORS[tier.tier],
            },
          });
        }
      }
      continue;
    }
    const [created] = await db.insert(badgeDefinitions).values({
      slug: badge.slug,
      name: badge.name,
      description: badge.description,
      category: badge.category,
      achievementType: badge.achievementType ?? null,
      triggerType: badge.triggerType ?? "manual",
      triggerKey: badge.triggerKey ?? null,
      triggerConfig: badge.triggerConfig ?? {},
      imagePath: badge.imagePath ?? null,
      placeholderColor: badge.placeholderColor ?? "#C9A84C",
      status: "published",
      publishedAt: new Date(),
    }).returning();
    if (created && badge.tiers?.length) {
      await db.insert(badgeTiers).values(badge.tiers.map((tier) => ({
        badgeDefinitionId: created.id,
        tier: tier.tier,
        threshold: tier.threshold,
        imagePath: tier.imagePath ?? null,
        color: tier.color ?? TIER_COLORS[tier.tier],
      })));
    }
  }
}

export async function getCareerThreeStarPoints(userId: string): Promise<number> {
  const rows = await db.select({
    points: sql<number>`COALESCE(SUM(
      (CASE WHEN ${gameStars.firstStarUserId} = ${userId} THEN 3 ELSE 0 END) +
      (CASE WHEN ${gameStars.secondStarUserId} = ${userId} THEN 2 ELSE 0 END) +
      (CASE WHEN ${gameStars.thirdStarUserId} = ${userId} THEN 1 ELSE 0 END)
    ), 0)::int`,
  }).from(gameStars).where(sql`
    ${gameStars.firstStarUserId} = ${userId} OR
    ${gameStars.secondStarUserId} = ${userId} OR
    ${gameStars.thirdStarUserId} = ${userId}
  `);
  return Number(rows[0]?.points ?? 0);
}

export function currentCenturyClubYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" }).format(now));
}

// Game attendance is scorekeeper-confirmed. Scrimmages have no attendance log,
// so an approved player on a past, non-cancelled scrimmage is the closest record.
export async function getCalendarYearAppearances(userId: string, year = currentCenturyClubYear()): Promise<number> {
  const start = `${year}-01-01 00:00:00`;
  const end = `${year + 1}-01-01 00:00:00`;
  const result = await db.execute(sql`
    SELECT (
      (SELECT COUNT(DISTINCT ga.game_id) FROM game_attendance ga
       JOIN games g ON g.id = ga.game_id
       WHERE ga.user_id = ${userId} AND g.is_completed = true
         AND g.scheduled_at >= ${start}::timestamp AND g.scheduled_at < ${end}::timestamp)
      +
      (SELECT COUNT(DISTINCT sr.scrimmage_id) FROM scrimmage_requests sr
       JOIN scrimmages s ON s.id = sr.scrimmage_id
       WHERE sr.player_id = ${userId} AND sr.status = 'approved'
         AND s.status <> 'cancelled' AND s.time_tbd = false
         AND s.date_time < (NOW() AT TIME ZONE s.timezone)
         AND s.date_time >= ${start}::timestamp AND s.date_time < ${end}::timestamp)
    )::int AS count
  `);
  return Number(result.rows[0]?.count ?? 0);
}

export async function getSeasonHatTrickCount(userId: string, seasonId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM (
      SELECT gg.game_id FROM game_goals gg
      JOIN games g ON g.id = gg.game_id
      WHERE gg.scorer_id = ${userId} AND g.season_id = ${seasonId}
        AND g.is_completed = true
      GROUP BY gg.game_id HAVING COUNT(*) >= 3
    ) qualifying_games
  `);
  return Number(result.rows[0]?.count ?? 0);
}

// Backfill previously completed seasons without replaying old milestone popups.
// Legacy global awards remain in history but cannot count toward a season's tiers.
export async function reconcileSeasonHatTricks() {
  const [definition] = await db.select().from(badgeDefinitions)
    .where(and(eq(badgeDefinitions.slug, "hat_trick"), eq(badgeDefinitions.status, "published"))).limit(1);
  if (!definition) return;
  const tiers = await db.select().from(badgeTiers)
    .where(eq(badgeTiers.badgeDefinitionId, definition.id)).orderBy(asc(badgeTiers.threshold));
  const result = await db.execute(sql`
    SELECT scorer_id AS user_id, season_id, COUNT(*)::int AS count FROM (
      SELECT gg.scorer_id, g.season_id, gg.game_id
      FROM game_goals gg JOIN games g ON g.id = gg.game_id
      WHERE gg.scorer_id IS NOT NULL AND g.season_id IS NOT NULL AND g.is_completed = true
      GROUP BY gg.scorer_id, g.season_id, gg.game_id HAVING COUNT(*) >= 3
    ) qualifying_games
    GROUP BY scorer_id, season_id
  `);
  for (const row of result.rows) {
    const userId = String(row.user_id);
    const seasonId = String(row.season_id);
    const count = Number(row.count);
    const reached = reachedTiers(tiers, count);
    await db.transaction(async (tx) => {
      for (const tier of reached) {
        await tx.insert(badgeAwards).values({
          badgeDefinitionId: definition.id, userId, seasonId,
          scopeKey: `season:${seasonId}:tier:${tier.tier}`, tier: tier.tier,
          source: "evaluator", metadata: { value: count },
        }).onConflictDoNothing();
      }
      await tx.insert(badgeProgress).values({
        badgeDefinitionId: definition.id, userId, scopeKey: `season:${seasonId}`,
        progress: count, count, earnedTiers: reached.map((tier) => tier.tier),
        currentTier: reached.at(-1)?.tier ?? null,
      }).onConflictDoUpdate({
        target: [badgeProgress.badgeDefinitionId, badgeProgress.userId, badgeProgress.scopeKey],
        set: {
          progress: count, count,
          earnedTiers: reached.map((tier) => tier.tier),
          currentTier: reached.at(-1)?.tier ?? null,
          updatedAt: new Date(),
        },
      });
    });
  }
}

// Preserve old career awards as history, but seed current-year tiers without
// sending retroactive announcements when the metric changes.
export async function reconcileCalendarYearCenturyClub() {
  const year = currentCenturyClubYear();
  const [definition] = await db.select().from(badgeDefinitions)
    .where(and(eq(badgeDefinitions.slug, "century_club"), eq(badgeDefinitions.status, "published"))).limit(1);
  if (!definition) return;
  const tiers = await db.select().from(badgeTiers)
    .where(eq(badgeTiers.badgeDefinitionId, definition.id)).orderBy(asc(badgeTiers.threshold));
  const start = `${year}-01-01 00:00:00`;
  const end = `${year + 1}-01-01 00:00:00`;
  const candidates = await db.execute(sql`
    SELECT user_id, COUNT(*)::int AS count FROM (
      SELECT ga.user_id FROM game_attendance ga JOIN games g ON g.id = ga.game_id
      WHERE ga.user_id IS NOT NULL AND g.is_completed = true
        AND g.scheduled_at >= ${start}::timestamp AND g.scheduled_at < ${end}::timestamp
      UNION
      SELECT sr.player_id AS user_id FROM scrimmage_requests sr JOIN scrimmages s ON s.id = sr.scrimmage_id
      WHERE sr.status = 'approved' AND s.status <> 'cancelled' AND s.time_tbd = false
        AND s.date_time < (NOW() AT TIME ZONE s.timezone)
        AND s.date_time >= ${start}::timestamp AND s.date_time < ${end}::timestamp
    ) participants GROUP BY user_id
  `);
  if (!candidates.rows.length) return;
  const progressRows: (typeof badgeProgress.$inferInsert)[] = [];
  const awardRows: (typeof badgeAwards.$inferInsert)[] = [];
  for (const row of candidates.rows) {
    const userId = String(row.user_id);
    const count = Number(row.count);
    const reached = reachedTiers(tiers, count);
    awardRows.push(...reached.map((tier) => ({
      badgeDefinitionId: definition.id, userId,
      scopeKey: `year:${year}:tier:${tier.tier}`, tier: tier.tier,
      count: 1, source: "evaluator", metadata: { value: count, year },
    })));
    progressRows.push({
      badgeDefinitionId: definition.id, userId, scopeKey: `year:${year}`,
      progress: count, count, earnedTiers: reached.map((tier) => tier.tier),
      currentTier: reached.at(-1)?.tier ?? null,
    });
  }
  await db.transaction(async (tx) => {
    if (awardRows.length) await tx.insert(badgeAwards).values(awardRows).onConflictDoNothing();
    await tx.insert(badgeProgress).values(progressRows)
      .onConflictDoUpdate({
        target: [badgeProgress.badgeDefinitionId, badgeProgress.userId, badgeProgress.scopeKey],
        set: {
          progress: sql`excluded.progress`, count: sql`excluded.count`,
          earnedTiers: sql`excluded.earned_tiers`, currentTier: sql`excluded.current_tier`,
          updatedAt: new Date(),
        },
      });
  });
}

// Reconcile awards earned before 3 Stars switched from nomination count to points.
// Historical crossings get award records, but no delayed announcement events.
export async function reconcileHistoricalThreeStarPoints() {
  const [definition] = await db.select().from(badgeDefinitions)
    .where(and(eq(badgeDefinitions.slug, "three_stars"), eq(badgeDefinitions.status, "published"))).limit(1);
  if (!definition) return;
  const tiers = await db.select().from(badgeTiers)
    .where(eq(badgeTiers.badgeDefinitionId, definition.id)).orderBy(asc(badgeTiers.threshold));
  const totals = await db.execute(sql`
    SELECT user_id, SUM(points)::int AS points FROM (
      SELECT first_star_user_id AS user_id, 3 AS points FROM game_stars
      UNION ALL SELECT second_star_user_id, 2 FROM game_stars
      UNION ALL SELECT third_star_user_id, 1 FROM game_stars
    ) scored GROUP BY user_id
  `);
  for (const row of totals.rows) {
    const userId = String(row.user_id);
    const points = Number(row.points);
    const reached = reachedTiers(tiers, points);
    await db.transaction(async (tx) => {
      for (const tier of reached) {
        await tx.insert(badgeAwards).values({
          badgeDefinitionId: definition.id, userId, scopeKey: `global:tier:${tier.tier}`,
          tier: tier.tier, count: 1, source: "evaluator", metadata: { value: points },
        }).onConflictDoNothing();
      }
      await tx.insert(badgeProgress).values({
        badgeDefinitionId: definition.id, userId, scopeKey: "global",
        progress: points, count: points,
        earnedTiers: reached.map((tier) => tier.tier), currentTier: reached.at(-1)?.tier ?? null,
      }).onConflictDoUpdate({
        target: [badgeProgress.badgeDefinitionId, badgeProgress.userId, badgeProgress.scopeKey],
        set: {
          progress: points, count: points,
          earnedTiers: reached.map((tier) => tier.tier), currentTier: reached.at(-1)?.tier ?? null,
          updatedAt: new Date(),
        },
      });
    });
  }
}

async function definitionsWithTiers(includeArchived = false) {
  const definitions = await db.select().from(badgeDefinitions)
    .where(includeArchived ? sql`TRUE` : eq(badgeDefinitions.status, "published"))
    .orderBy(asc(badgeDefinitions.category), asc(badgeDefinitions.name));
  if (!definitions.length) return [];
  const tiers = await db.select().from(badgeTiers)
    .where(inArray(badgeTiers.badgeDefinitionId, definitions.map((d) => d.id)))
    .orderBy(asc(badgeTiers.threshold));
  const tiersByDefinition = new Map<string, typeof tiers>();
  for (const tier of tiers) tiersByDefinition.set(tier.badgeDefinitionId, [...(tiersByDefinition.get(tier.badgeDefinitionId) ?? []), tier]);
  return definitions.map((definition) => ({ ...definition, tiers: tiersByDefinition.get(definition.id) ?? [] }));
}

function scopeKeyFor(definition: Pick<BadgeDefinition, "category">, context?: { leagueId?: string | null; seasonId?: string | null; teamId?: string | null }) {
  if (definition.category === "achievement") return "global";
  if (definition.category === "nhl_trophy") {
    if (!context?.leagueId || !context.seasonId) throw new Error("League awards require a league and season");
    return `league:${context.leagueId}:season:${context.seasonId}`;
  }
  if (!context?.teamId || !context.seasonId) throw new Error("Team awards require a team and season");
  return `team:${context.teamId}:season:${context.seasonId}`;
}

async function broadcastEarnedEvent(userId: string, event: BadgeEarnedEvent, definition: BadgeDefinition, payload: Record<string, unknown>) {
  try {
    const { broadcastToUser } = await import("./routes");
    if (broadcastToUser(userId, { type: "badge_earned", eventId: event.id, badge: { ...definition, ...payload } })) {
      await db.update(badgeEarnedEvents).set({ deliveredAt: new Date() }).where(eq(badgeEarnedEvents.id, event.id));
    }
  } catch (error) {
    console.error("[Badges] Failed to broadcast earned event:", error);
  }
}

async function emitEarnedEvent(userId: string, awardId: string, definition: BadgeDefinition, payload: Record<string, unknown>) {
  const [event] = await db.insert(badgeEarnedEvents).values({
    userId,
    badgeAwardId: awardId,
    badgeDefinitionId: definition.id,
    eventType: "badge_earned",
    payload,
  }).returning();
  await broadcastEarnedEvent(userId, event, definition, payload);
  return event;
}

async function getMetricValue(userId: string, triggerKey: string, context?: { seasonId?: string | null }) {
  const longestRun = (values: boolean[]) => values.reduce(
    (result, value) => ({ current: value ? result.current + 1 : 0, longest: Math.max(result.longest, value ? result.current + 1 : 0) }),
    { current: 0, longest: 0 },
  ).longest;
  switch (triggerKey) {
    case "career_games_played": {
      const rows = await db.select({ count: sql<number>`count(*)::int` })
        .from(gameAttendance).innerJoin(games, eq(gameAttendance.gameId, games.id))
        .where(and(eq(gameAttendance.userId, userId), eq(games.isCompleted, true)));
      return Number(rows[0]?.count ?? 0);
    }
    case "calendar_year_appearances":
      return getCalendarYearAppearances(userId);
    case "season_hat_tricks":
      return context?.seasonId ? getSeasonHatTrickCount(userId, context.seasonId) : 0;
    case "career_three_stars": {
      return getCareerThreeStarPoints(userId);
    }
    case "career_sub_appearances": {
      const rows = await db.select({ count: sql<number>`count(*)::int` }).from(substituteRequests)
        .where(and(eq(substituteRequests.substitutePlayerId, userId), eq(substituteRequests.status, "approved")));
      return Number(rows[0]?.count ?? 0);
    }
    case "career_leagues_played": {
      const rows = await db.select({ count: sql<number>`count(distinct ${leagueMemberships.leagueId})::int` })
        .from(leagueMemberships).where(and(eq(leagueMemberships.userId, userId), eq(leagueMemberships.status, "approved")));
      return Number(rows[0]?.count ?? 0);
    }
    case "season_beers": {
      const result = context?.seasonId
        ? await db.execute(sql`
            SELECT COALESCE(SUM(gbc.count), 0)::int AS count
            FROM game_beer_counts gbc JOIN games g ON g.id = gbc.game_id
            WHERE gbc.user_id = ${userId} AND g.season_id = ${context.seasonId}
          `)
        : await db.execute(sql`
            SELECT COALESCE(MAX(season_count), 0)::int AS count
            FROM (
              SELECT SUM(gbc.count)::int AS season_count
              FROM game_beer_counts gbc JOIN games g ON g.id = gbc.game_id
              WHERE gbc.user_id = ${userId}
              GROUP BY g.season_id
            ) season_totals
          `);
      return Number((result.rows?.[0] as any)?.count ?? 0);
    }
    case "career_shutouts":
      return Number((await db.select({ count: sql<number>`count(*)::int` })
        .from(gameGoalies).innerJoin(games, eq(gameGoalies.gameId, games.id))
        .where(and(eq(gameGoalies.goalieUserId, userId), eq(games.isCompleted, true), eq(gameGoalies.goalsAgainst, 0))))[0]?.count ?? 0);
    case "consecutive_games_played":
    case "scoring_streak_games": {
      const attended = await db.select({ gameId: gameAttendance.gameId, scheduledAt: games.scheduledAt })
        .from(gameAttendance).innerJoin(games, eq(gameAttendance.gameId, games.id))
        .where(and(eq(gameAttendance.userId, userId), eq(games.isCompleted, true)))
        .orderBy(asc(games.scheduledAt));
      if (!attended.length) return 0;
      if (triggerKey === "consecutive_games_played") return attended.length;
      const goals = await db.select({ gameId: gameGoals.gameId }).from(gameGoals)
        .where(and(eq(gameGoals.scorerId, userId), inArray(gameGoals.gameId, attended.map((game) => game.gameId))));
      const goalGames = new Set(goals.map((goal) => goal.gameId));
      return longestRun(attended.map((game) => goalGames.has(game.gameId)));
    }
    case "consecutive_games_out": {
      const rsvps = await db.select({ status: gameRsvps.status, scheduledAt: games.scheduledAt })
        .from(gameRsvps).innerJoin(games, eq(gameRsvps.gameId, games.id))
        .where(and(eq(gameRsvps.userId, userId), eq(games.isCompleted, true)))
        .orderBy(asc(games.scheduledAt));
      return longestRun(rsvps.map((rsvp) => rsvp.status === "not_attending"));
    }
    case "season_first_rsvp_streak":
    default:
      return 0;
  }
}

type DefinitionWithTiers = Awaited<ReturnType<typeof definitionsWithTiers>>[number];

export async function evaluateSeasonBeerBadgeForUser(userId: string, definition: DefinitionWithTiers, seasonId: string) {
  // Lock the progress row so a game request and the SQL-change worker cannot
  // both announce the same threshold crossing.
  const emitted = await db.transaction(async (tx) => {
    const [previous] = await tx.select().from(badgeProgress).where(and(
      eq(badgeProgress.badgeDefinitionId, definition.id),
      eq(badgeProgress.userId, userId),
      eq(badgeProgress.scopeKey, "global"),
    )).for("update").limit(1);
    const result = await tx.execute(sql`
      SELECT COALESCE(SUM(gbc.count), 0)::int AS count
      FROM game_beer_counts gbc JOIN games g ON g.id = gbc.game_id
      WHERE gbc.user_id = ${userId} AND g.season_id = ${seasonId}
    `);
    const count = Number((result.rows?.[0] as any)?.count ?? 0);
    const reached = reachedTiers(definition.tiers, count);
    const events: Array<{ event: BadgeEarnedEvent; payload: Record<string, unknown> }> = [];

    for (const tier of newlyReachedTiers(definition.tiers, previous?.progress ?? 0, count)) {
      const scopeKey = `global:tier:${tier.tier}`;
      const [inserted] = await tx.insert(badgeAwards).values({
        badgeDefinitionId: definition.id, userId, scopeKey, tier: tier.tier,
        seasonId, count: 1, source: "evaluator", metadata: { value: count },
      }).onConflictDoNothing().returning();
      // A corrected count can fall below a threshold and later reach it again.
      // Keep the historical award row, but create a new event for that crossing.
      const [existing] = inserted ? [] : await tx.select({ id: badgeAwards.id }).from(badgeAwards).where(and(
        eq(badgeAwards.badgeDefinitionId, definition.id),
        eq(badgeAwards.userId, userId),
        eq(badgeAwards.scopeKey, scopeKey),
      )).limit(1);
      const awardId = inserted?.id ?? (previous ? existing?.id : null);
      if (!awardId) continue;
      const payload = {
        tier: tier.tier, count, awardId, seasonId,
        imagePath: tier.imagePath ?? definition.imagePath ?? null,
      };
      const [event] = await tx.insert(badgeEarnedEvents).values({
        userId, badgeAwardId: awardId, badgeDefinitionId: definition.id,
        eventType: "badge_earned", payload,
      }).returning();
      events.push({ event, payload });
    }

    // A replayed event for a tier no longer reached must not appear later.
    for (const tier of definition.tiers.filter((item) => count < item.threshold)) {
      await tx.update(badgeEarnedEvents).set({ acknowledgedAt: new Date() }).where(and(
        eq(badgeEarnedEvents.userId, userId),
        eq(badgeEarnedEvents.badgeDefinitionId, definition.id),
        sql`${badgeEarnedEvents.acknowledgedAt} IS NULL`,
        sql`${badgeEarnedEvents.payload}->>'tier' = ${tier.tier}`,
      ));
    }

    const earnedTiers = reached.map((tier) => tier.tier);
    await tx.insert(badgeProgress).values({
      badgeDefinitionId: definition.id, userId, scopeKey: "global",
      progress: count, count, earnedTiers, currentTier: earnedTiers.at(-1) ?? null,
    }).onConflictDoUpdate({
      target: [badgeProgress.badgeDefinitionId, badgeProgress.userId, badgeProgress.scopeKey],
      set: { progress: count, count, earnedTiers, currentTier: earnedTiers.at(-1) ?? null, updatedAt: new Date() },
    });
    return events;
  });

  for (const { event, payload } of emitted) {
    await broadcastEarnedEvent(userId, event, definition, payload);
  }
  return emitted.map(({ event }) => event);
}

export async function evaluateSeasonHatTrickBadgeForUser(userId: string, definition: DefinitionWithTiers, seasonId: string) {
  const emitted = await db.transaction(async (tx) => {
    // Serialize evaluations for the same player and season, including corrected
    // goals committed immediately after another evaluation started.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`hat_trick:${userId}:${seasonId}`}))`);
    const scopeKey = `season:${seasonId}`;
    const [previous] = await tx.select().from(badgeProgress).where(and(
      eq(badgeProgress.badgeDefinitionId, definition.id),
      eq(badgeProgress.userId, userId),
      eq(badgeProgress.scopeKey, scopeKey),
    )).for("update").limit(1);
    const result = await tx.execute(sql`
      SELECT COUNT(*)::int AS count FROM (
        SELECT gg.game_id FROM game_goals gg JOIN games g ON g.id = gg.game_id
        WHERE gg.scorer_id = ${userId} AND g.season_id = ${seasonId} AND g.is_completed = true
        GROUP BY gg.game_id HAVING COUNT(*) >= 3
      ) qualifying_games
    `);
    const count = Number(result.rows[0]?.count ?? 0);
    const reached = reachedTiers(definition.tiers, count);
    const events: Array<{ event: BadgeEarnedEvent; payload: Record<string, unknown> }> = [];
    for (const tier of newlyReachedTiers(definition.tiers, previous?.progress ?? 0, count)) {
      const awardScopeKey = `${scopeKey}:tier:${tier.tier}`;
      const [inserted] = await tx.insert(badgeAwards).values({
        badgeDefinitionId: definition.id, userId, seasonId,
        scopeKey: awardScopeKey, tier: tier.tier, source: "evaluator",
        metadata: { value: count },
      }).onConflictDoNothing().returning();
      const [historical] = inserted ? [] : await tx.select({ id: badgeAwards.id }).from(badgeAwards).where(and(
        eq(badgeAwards.badgeDefinitionId, definition.id),
        eq(badgeAwards.userId, userId),
        eq(badgeAwards.scopeKey, awardScopeKey),
      )).limit(1);
      // Don't replay old milestones when only backfilling a missing progress row.
      const awardId = inserted?.id ?? (previous ? historical?.id : null);
      if (!awardId) continue;
      const payload = { tier: tier.tier, count, awardId, seasonId, imagePath: tier.imagePath ?? definition.imagePath ?? null };
      const [event] = await tx.insert(badgeEarnedEvents).values({
        userId, badgeAwardId: awardId, badgeDefinitionId: definition.id,
        eventType: "badge_earned", payload,
      }).returning();
      events.push({ event, payload });
    }
    for (const tier of definition.tiers.filter((item) => count < item.threshold)) {
      await tx.update(badgeEarnedEvents).set({ acknowledgedAt: new Date() }).where(and(
        eq(badgeEarnedEvents.userId, userId),
        eq(badgeEarnedEvents.badgeDefinitionId, definition.id),
        sql`${badgeEarnedEvents.acknowledgedAt} IS NULL`,
        sql`${badgeEarnedEvents.payload}->>'seasonId' = ${seasonId}`,
        sql`${badgeEarnedEvents.payload}->>'tier' = ${tier.tier}`,
      ));
    }
    await tx.insert(badgeProgress).values({
      badgeDefinitionId: definition.id, userId, scopeKey,
      progress: count, count, earnedTiers: reached.map((tier) => tier.tier),
      currentTier: reached.at(-1)?.tier ?? null,
    }).onConflictDoUpdate({
      target: [badgeProgress.badgeDefinitionId, badgeProgress.userId, badgeProgress.scopeKey],
      set: {
        progress: count, count, earnedTiers: reached.map((tier) => tier.tier),
        currentTier: reached.at(-1)?.tier ?? null, updatedAt: new Date(),
      },
    });
    return events;
  });
  for (const { event, payload } of emitted) await broadcastEarnedEvent(userId, event, definition, payload);
  return emitted.map(({ event }) => event);
}

export async function evaluateBadgesForUser(
  userId: string,
  context?: { leagueId?: string | null; seasonId?: string | null; teamId?: string | null },
  onlyTriggerKey?: string,
) {
  const definitions = await definitionsWithTiers();
  const earned: Array<Record<string, unknown>> = [];
  for (const definition of definitions.filter((item) => item.category === "achievement" && item.achievementType
    && (!onlyTriggerKey || item.triggerKey === onlyTriggerKey))) {
    if (definition.triggerKey === "season_beers") {
      // Never evaluate a season badge from a combined cross-season total.
      if (context?.seasonId) earned.push(...await evaluateSeasonBeerBadgeForUser(userId, definition, context.seasonId));
      continue;
    }
    if (definition.triggerKey === "season_hat_tricks") {
      if (context?.seasonId) earned.push(...await evaluateSeasonHatTrickBadgeForUser(userId, definition, context.seasonId));
      continue;
    }
    const centuryYear = definition.triggerKey === "calendar_year_appearances" ? currentCenturyClubYear() : null;
    const scopeKey = centuryYear === null ? "global" : `year:${centuryYear}`;
    const currentValue = await getMetricValue(userId, definition.triggerKey ?? "", context);
    const config = (definition.triggerConfig ?? {}) as Record<string, unknown>;
    const threshold = Number(config.threshold ?? 1);
    const [current] = await db.select().from(badgeProgress).where(and(
      eq(badgeProgress.badgeDefinitionId, definition.id),
      eq(badgeProgress.userId, userId),
      eq(badgeProgress.scopeKey, scopeKey),
    )).limit(1);
    const earnedTiers = new Set<string>(current?.earnedTiers ?? []);
    if (definition.achievementType === "tiered") {
      const reached = (definition.tiers ?? []).filter((tier) => currentValue >= tier.threshold && !earnedTiers.has(tier.tier));
      for (const tier of reached) {
        const awardKey = `${scopeKey}:tier:${tier.tier}`;
        const [award] = await db.insert(badgeAwards).values({
          badgeDefinitionId: definition.id, userId, scopeKey: awardKey, tier: tier.tier,
          count: 1, source: "evaluator", metadata: { value: currentValue, ...(centuryYear === null ? {} : { year: centuryYear }) },
        }).onConflictDoNothing().returning();
        if (award) {
          earnedTiers.add(tier.tier);
          earned.push(await emitEarnedEvent(userId, award.id, definition, {
            tier: tier.tier,
            count: currentValue,
            awardId: award.id,
            imagePath: tier.imagePath ?? definition.imagePath ?? null,
            ...(centuryYear === null ? {} : { year: centuryYear }),
          }));
        }
      }
      const currentTier = (definition.tiers ?? []).filter((tier) => currentValue >= tier.threshold).at(-1)?.tier ?? null;
      await db.insert(badgeProgress).values({
        badgeDefinitionId: definition.id, userId, scopeKey, progress: currentValue,
        count: currentValue, earnedTiers: Array.from(earnedTiers) as any, currentTier,
      }).onConflictDoUpdate({
        target: [badgeProgress.badgeDefinitionId, badgeProgress.userId, badgeProgress.scopeKey],
        set: { progress: currentValue, count: currentValue, earnedTiers: Array.from(earnedTiers) as any, currentTier, updatedAt: new Date() },
      });
    } else if (definition.achievementType === "multiplier") {
      if (currentValue > Number(current?.count ?? 0)) {
        const [award] = await db.insert(badgeAwards).values({
          badgeDefinitionId: definition.id, userId, scopeKey: `global:count:${currentValue}`,
          count: currentValue, source: "evaluator", metadata: { value: currentValue },
        }).onConflictDoNothing().returning();
        if (award) earned.push(await emitEarnedEvent(userId, award.id, definition, { count: currentValue, awardId: award.id }));
      }
      await db.insert(badgeProgress).values({
        badgeDefinitionId: definition.id, userId, scopeKey, progress: currentValue, count: currentValue, earnedTiers: [],
      }).onConflictDoUpdate({
        target: [badgeProgress.badgeDefinitionId, badgeProgress.userId, badgeProgress.scopeKey],
        set: { progress: currentValue, count: currentValue, updatedAt: new Date() },
      });
    } else if (currentValue >= threshold) {
      const existing = await db.select({ id: badgeAwards.id }).from(badgeAwards).where(and(
        eq(badgeAwards.badgeDefinitionId, definition.id), eq(badgeAwards.userId, userId), eq(badgeAwards.scopeKey, scopeKey),
      )).limit(1);
      if (!existing.length) {
        const [award] = await db.insert(badgeAwards).values({
          badgeDefinitionId: definition.id, userId, scopeKey, count: 1, source: "evaluator",
        }).returning();
        earned.push(await emitEarnedEvent(userId, award.id, definition, { count: 1, awardId: award.id }));
      }
    }
  }
  return earned;
}

export async function awardManualBadge(input: {
  badgeDefinitionId: string;
  userId: string;
  awardedBy: string;
  leagueId?: string | null;
  seasonId?: string | null;
  teamId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [definition] = await db.select().from(badgeDefinitions).where(and(
    eq(badgeDefinitions.id, input.badgeDefinitionId),
    eq(badgeDefinitions.status, "published"),
  )).limit(1);
  if (!definition) throw new Error("Badge definition not found");
  if (definition.category === "achievement") throw new Error("Achievements are earned automatically");
  const scopeKey = scopeKeyFor(definition, input);
  const [award] = await db.insert(badgeAwards).values({
    badgeDefinitionId: definition.id, userId: input.userId, awardedBy: input.awardedBy,
    leagueId: input.leagueId ?? null, seasonId: input.seasonId ?? null, teamId: input.teamId ?? null,
    scopeKey, source: "manual", metadata: input.metadata ?? {},
  }).onConflictDoNothing().returning();
  if (!award) return { duplicate: true, award: null, event: null };
  const event = await emitEarnedEvent(input.userId, award.id, definition, { awardId: award.id, count: 1 });
  return { duplicate: false, award, event };
}

export async function getTrophyCase(userId: string, requestedHatTrickSeasonId?: string) {
  const definitions = await definitionsWithTiers();
  const centuryYear = currentCenturyClubYear();
  const [awards, progress, goalieMembership, goalieAppearance, beerCount, threeStarPoints, centuryCount, hatTrickSeasonsResult] = await Promise.all([
    db.select().from(badgeAwards).where(eq(badgeAwards.userId, userId)).orderBy(desc(badgeAwards.awardedAt)),
    db.select().from(badgeProgress).where(eq(badgeProgress.userId, userId)),
    db.select({ id: leagueMemberships.id }).from(leagueMemberships).where(and(
      eq(leagueMemberships.userId, userId),
      eq(leagueMemberships.isGoalie, true),
      eq(leagueMemberships.status, "approved"),
    )).limit(1),
    db.select({ gameId: gameGoalies.gameId }).from(gameGoalies)
      .where(eq(gameGoalies.goalieUserId, userId)).limit(1),
    getMetricValue(userId, "season_beers"),
    getCareerThreeStarPoints(userId),
    getCalendarYearAppearances(userId, centuryYear),
    db.execute(sql`
      SELECT s.id, s.name FROM seasons s
      WHERE s.id IN (
        SELECT t.season_id FROM team_memberships tm
          JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = ${userId}
        UNION
        SELECT g.season_id FROM game_attendance ga
          JOIN games g ON g.id = ga.game_id WHERE ga.user_id = ${userId}
        UNION
        SELECT g.season_id FROM game_goals gg
          JOIN games g ON g.id = gg.game_id WHERE gg.scorer_id = ${userId}
        UNION
        SELECT ba.season_id FROM badge_awards ba
          JOIN badge_definitions bd ON bd.id = ba.badge_definition_id
          WHERE ba.user_id = ${userId} AND bd.slug = 'hat_trick' AND ba.season_id IS NOT NULL
      )
      ORDER BY s.is_active DESC, s.start_date DESC NULLS LAST, s.created_at DESC
    `),
  ]);
  const hatTrickSeasons = hatTrickSeasonsResult.rows.map((row) => ({ id: String(row.id), name: String(row.name) }));
  if (requestedHatTrickSeasonId && !hatTrickSeasons.some((season) => season.id === requestedHatTrickSeasonId)) {
    throw new Error("Hat Trick season not available for this player");
  }
  const selectedHatTrickSeasonId = requestedHatTrickSeasonId ?? hatTrickSeasons[0]?.id ?? null;
  const hatTrickCount = selectedHatTrickSeasonId ? await getSeasonHatTrickCount(userId, selectedHatTrickSeasonId) : 0;
  const awardsByDefinition = new Map<string, typeof awards>();
  for (const award of awards) awardsByDefinition.set(award.badgeDefinitionId, [...(awardsByDefinition.get(award.badgeDefinitionId) ?? []), award]);
  const progressByScope = new Map(progress.map((item) => [`${item.badgeDefinitionId}:${item.scopeKey}`, item]));
  const badges = definitions.map((definition) => {
    const isCenturyBadge = definition.triggerKey === "calendar_year_appearances";
    const isHatTrickBadge = definition.triggerKey === "season_hat_tricks";
    const allDefinitionAwards = awardsByDefinition.get(definition.id) ?? [];
    const legacyAwards = isHatTrickBadge
      ? allDefinitionAwards.filter((award) => award.scopeKey.startsWith("global:tier:"))
      : [];
    const definitionAwards = allDefinitionAwards.filter((award) =>
      (!isCenturyBadge || award.scopeKey.startsWith(`year:${centuryYear}:tier:`))
      && (!isHatTrickBadge || (selectedHatTrickSeasonId !== null && award.scopeKey.startsWith(`season:${selectedHatTrickSeasonId}:tier:`))));
    const currentProgress = progressByScope.get(`${definition.id}:${isHatTrickBadge
      ? `season:${selectedHatTrickSeasonId}` : isCenturyBadge ? `year:${centuryYear}` : "global"}`);
    const isBeerBadge = definition.triggerKey === "season_beers";
    const liveTierValue = isBeerBadge ? beerCount
      : definition.triggerKey === "career_three_stars" ? threeStarPoints
      : isCenturyBadge ? centuryCount : isHatTrickBadge ? hatTrickCount : null;
    const earnedTiers = liveTierValue !== null
      ? reachedTiers(definition.tiers, liveTierValue).map((tier) => tier.tier)
      : currentProgress?.earnedTiers ?? definitionAwards.filter((award) => award.tier).map((award) => award.tier);
    const visibleAwards = liveTierValue !== null
      ? definitionAwards.filter((award) => award.tier && earnedTiers.includes(award.tier))
      : definitionAwards;
    const isEarned = liveTierValue !== null ? earnedTiers.length > 0 : definition.category === "achievement"
      ? definition.achievementType === "tiered"
        ? (currentProgress?.earnedTiers?.length ?? 0) > 0
        : (currentProgress?.count ?? 0) > 0 || definitionAwards.length > 0
      : definitionAwards.length > 0;
    const nextTier = definition.tiers.find((tier) => !earnedTiers.includes(tier.tier));
    return {
      ...definition,
      isEarned,
      earnedAt: visibleAwards[0]?.awardedAt ?? null,
      count: liveTierValue ?? currentProgress?.count ?? definitionAwards[0]?.count ?? 0,
      earnedTiers,
      currentProgress: liveTierValue ?? currentProgress?.progress ?? 0,
      nextThreshold: nextTier?.threshold ?? null,
      awards: visibleAwards,
      legacyAwards,
    };
  });
  return {
    isGoalie: goalieMembership.length > 0 || goalieAppearance.length > 0,
    hatTrickSeasons,
    selectedHatTrickSeasonId,
    sections: (["nhl_trophy", "team_badge", "achievement"] as BadgeCategory[]).map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      badges: badges.filter((badge) => badge.category === category),
    })),
  };
}

// Catalog-only preview; never reads or writes a player's awards.
export async function getTrophyCasePreview() {
  const definitions = await definitionsWithTiers();
  const badges = definitions.map((definition) => ({
    id: definition.id,
    slug: definition.slug,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    achievementType: definition.achievementType,
    imagePath: definition.imagePath,
    placeholderColor: definition.placeholderColor,
    lockedHint: definition.lockedHint,
    tiers: definition.tiers.map(({ tier, threshold, imagePath, color }) => ({ tier, threshold, imagePath, color })),
    isEarned: true,
    earnedAt: null,
    count: definition.achievementType === "tiered"
      ? Math.max(0, ...definition.tiers.map((tier) => tier.threshold))
      : 1,
    earnedTiers: definition.tiers.map((tier) => tier.tier),
    currentProgress: Math.max(0, ...definition.tiers.map((tier) => tier.threshold)),
    nextThreshold: null,
    awards: [],
  }));
  return {
    isGoalie: true,
    sections: (["nhl_trophy", "team_badge", "achievement"] as BadgeCategory[]).map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      badges: badges.filter((badge) => badge.category === category),
    })),
  };
}

export async function getPendingBadgeEvents(userId: string) {
  // A scrimmage becomes an appearance when it takes place, not when a request
  // is approved. Evaluate on the normal announcement poll so it can award the
  // newly reached tier even without a subsequent game-finalization event.
  await evaluateBadgesForUser(userId, undefined, "calendar_year_appearances");
  const events = await db.select({
    id: badgeEarnedEvents.id,
    eventType: badgeEarnedEvents.eventType,
    payload: badgeEarnedEvents.payload,
    createdAt: badgeEarnedEvents.createdAt,
    definition: badgeDefinitions,
  }).from(badgeEarnedEvents)
    .innerJoin(badgeDefinitions, eq(badgeEarnedEvents.badgeDefinitionId, badgeDefinitions.id))
    .where(and(eq(badgeEarnedEvents.userId, userId), sql`${badgeEarnedEvents.acknowledgedAt} IS NULL`))
    .orderBy(asc(badgeEarnedEvents.createdAt));

  const centuryYear = currentCenturyClubYear();
  const currentEvents = events.filter((event) => event.definition.triggerKey !== "calendar_year_appearances"
    || (event.payload as Record<string, unknown>)?.year === centuryYear);
  const tieredEvents = currentEvents.filter((event) => typeof (event.payload as Record<string, unknown>)?.tier === "string");
  if (!tieredEvents.length) return currentEvents.filter((event) => event.definition.triggerKey !== "season_beers");

  const definitionIds = Array.from(new Set(tieredEvents.map((event) => event.definition.id)));
  const tiers = await db.select({
    badgeDefinitionId: badgeTiers.badgeDefinitionId,
    tier: badgeTiers.tier,
    imagePath: badgeTiers.imagePath,
    threshold: badgeTiers.threshold,
  }).from(badgeTiers).where(inArray(badgeTiers.badgeDefinitionId, definitionIds));
  const tiersByEventKey = new Map(tiers.map((tier) => [`${tier.badgeDefinitionId}:${tier.tier}`, tier]));
  const beerEvents = tieredEvents.filter((event) => event.definition.triggerKey === "season_beers");
  const seasonIds = Array.from(new Set(beerEvents.map((event) => {
    const seasonId = (event.payload as Record<string, unknown>).seasonId;
    return typeof seasonId === "string" ? seasonId : "";
  })));
  const beerCounts = new Map(await Promise.all(seasonIds.map(async (seasonId) => [
    seasonId, await getMetricValue(userId, "season_beers", seasonId ? { seasonId } : undefined),
  ] as const)));
  const hatTrickSeasonIds = Array.from(new Set(tieredEvents
    .filter((event) => event.definition.triggerKey === "season_hat_tricks")
    .map((event) => (event.payload as Record<string, unknown>).seasonId)
    .filter((seasonId): seasonId is string => typeof seasonId === "string" && seasonId.length > 0)));
  const hatTrickCounts = new Map(await Promise.all(hatTrickSeasonIds.map(async (seasonId) => [
    seasonId, await getSeasonHatTrickCount(userId, seasonId),
  ] as const)));
  const centuryCount = tieredEvents.some((event) => event.definition.triggerKey === "calendar_year_appearances")
    ? await getCalendarYearAppearances(userId, centuryYear) : 0;

  return currentEvents.filter((event) => {
    const payload = event.payload as Record<string, unknown>;
    if (event.definition.triggerKey === "calendar_year_appearances") {
      const tier = tiersByEventKey.get(`${event.definition.id}:${payload.tier}`);
      return !!tier && centuryCount >= tier.threshold;
    }
    if (event.definition.triggerKey === "season_hat_tricks") {
      const tier = tiersByEventKey.get(`${event.definition.id}:${payload.tier}`);
      return !!tier && typeof payload.seasonId === "string"
        && (hatTrickCounts.get(payload.seasonId) ?? 0) >= tier.threshold;
    }
    if (event.definition.triggerKey !== "season_beers") return true;
    const tier = tiersByEventKey.get(`${event.definition.id}:${payload.tier}`);
    const seasonId = typeof payload.seasonId === "string" ? payload.seasonId : "";
    return !!tier && (beerCounts.get(seasonId) ?? 0) >= tier.threshold;
  }).map((event) => {
    const payload = event.payload as Record<string, unknown>;
    if (typeof payload.tier !== "string") return event;
    const existingImagePath = typeof payload.imagePath === "string" ? payload.imagePath : null;
    const imagePath = tiersByEventKey.get(`${event.definition.id}:${payload.tier}`)?.imagePath
      ?? existingImagePath
      ?? null;
    return imagePath ? { ...event, payload: { ...payload, imagePath } } : event;
  });
}

export async function acknowledgeBadgeEvent(userId: string, eventId: string) {
  return db.update(badgeEarnedEvents).set({ acknowledgedAt: new Date() }).where(and(
    eq(badgeEarnedEvents.id, eventId), eq(badgeEarnedEvents.userId, userId),
  )).returning();
}

export async function getBadgeCatalog(includeArchived = true) {
  return definitionsWithTiers(includeArchived);
}
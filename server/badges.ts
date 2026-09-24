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
} from "@shared/schema";
import { db } from "./db";

export type BadgeCategory = "nhl_trophy" | "team_badge" | "achievement";
export type BadgeAchievementType = "multiplier" | "tiered" | "onetime";
export type BadgeTierName = "bronze" | "silver" | "gold" | "platinum" | "legend" | "god_mode";

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
  achievement("hat_trick", "Hat Trick", "Score 3 goals in a single game.", "tiered", "metric", "career_hat_tricks", {}, [
    defaultTier("bronze", 1), defaultTier("silver", 3), defaultTier("gold", 5), defaultTier("platinum", 10),
  ]),
  achievement("iron_man", "Iron Man", "Play consecutive games without missing one.", "tiered", "metric", "consecutive_games_played", {}, [
    defaultTier("bronze", 5), defaultTier("silver", 10), defaultTier("gold", 15), defaultTier("platinum", 25),
  ]),
  achievement("century_club", "Century Club", "Total games played.", "tiered", "metric", "career_games_played", {}, [
    defaultTier("bronze", 25), defaultTier("silver", 50), defaultTier("gold", 100), defaultTier("platinum", 250),
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
  achievement("three_stars", "3 Stars", "Named one of the 3 stars of the game.", "tiered", "metric", "career_three_stars", {}, [
    defaultTier("bronze", 5), defaultTier("silver", 10), defaultTier("gold", 15), defaultTier("platinum", 25),
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
    if (existing) continue;
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

async function emitEarnedEvent(userId: string, awardId: string, definition: BadgeDefinition, payload: Record<string, unknown>) {
  const [event] = await db.insert(badgeEarnedEvents).values({
    userId,
    badgeAwardId: awardId,
    badgeDefinitionId: definition.id,
    eventType: "badge_earned",
    payload,
  }).returning();
  try {
    const { broadcastToUser } = await import("./routes");
    if (broadcastToUser(userId, { type: "badge_earned", eventId: event.id, badge: { ...definition, ...payload } })) {
      await db.update(badgeEarnedEvents).set({ deliveredAt: new Date() }).where(eq(badgeEarnedEvents.id, event.id));
    }
  } catch (error) {
    console.error("[Badges] Failed to broadcast earned event:", error);
  }
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
    case "career_hat_tricks": {
      const rows = await db.execute(sql`
        SELECT COUNT(*)::int AS count FROM (
          SELECT gg.game_id FROM game_goals gg
          JOIN games g ON g.id = gg.game_id
          WHERE gg.scorer_id = ${userId} AND g.is_completed = true
          GROUP BY gg.game_id HAVING COUNT(*) >= 3
        ) hat_tricks
      `);
      return Number((rows.rows?.[0] as any)?.count ?? 0);
    }
    case "career_three_stars": {
      const rows = await db.select({ count: sql<number>`count(*)::int` }).from(gameStars)
        .where(sql`${gameStars.firstStarUserId} = ${userId} OR ${gameStars.secondStarUserId} = ${userId} OR ${gameStars.thirdStarUserId} = ${userId}`);
      return Number(rows[0]?.count ?? 0);
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
      const seasonFilter = context?.seasonId ? sql`AND g.season_id = ${context.seasonId}` : sql``;
      const result = await db.execute(sql`
        SELECT COALESCE(SUM(gbc.count), 0)::int AS count
        FROM game_beer_counts gbc JOIN games g ON g.id = gbc.game_id
        WHERE gbc.user_id = ${userId} ${seasonFilter}
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

export async function evaluateBadgesForUser(userId: string, context?: { leagueId?: string | null; seasonId?: string | null; teamId?: string | null }) {
  const definitions = await definitionsWithTiers();
  const earned: Array<Record<string, unknown>> = [];
  for (const definition of definitions.filter((item) => item.category === "achievement" && item.achievementType)) {
    const scopeKey = "global";
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
        const awardKey = `global:tier:${tier.tier}`;
        const [award] = await db.insert(badgeAwards).values({
          badgeDefinitionId: definition.id, userId, scopeKey: awardKey, tier: tier.tier,
          count: 1, source: "evaluator", metadata: { value: currentValue },
        }).onConflictDoNothing().returning();
        if (award) {
          earnedTiers.add(tier.tier);
          earned.push(await emitEarnedEvent(userId, award.id, definition, {
            tier: tier.tier,
            count: currentValue,
            awardId: award.id,
            imagePath: tier.imagePath ?? definition.imagePath ?? null,
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

export async function getTrophyCase(userId: string) {
  const definitions = await definitionsWithTiers();
  const [awards, progress, goalieMembership, goalieAppearance] = await Promise.all([
    db.select().from(badgeAwards).where(eq(badgeAwards.userId, userId)).orderBy(desc(badgeAwards.awardedAt)),
    db.select().from(badgeProgress).where(eq(badgeProgress.userId, userId)),
    db.select({ id: leagueMemberships.id }).from(leagueMemberships).where(and(
      eq(leagueMemberships.userId, userId),
      eq(leagueMemberships.isGoalie, true),
      eq(leagueMemberships.status, "approved"),
    )).limit(1),
    db.select({ gameId: gameGoalies.gameId }).from(gameGoalies)
      .where(eq(gameGoalies.goalieUserId, userId)).limit(1),
  ]);
  const awardsByDefinition = new Map<string, typeof awards>();
  for (const award of awards) awardsByDefinition.set(award.badgeDefinitionId, [...(awardsByDefinition.get(award.badgeDefinitionId) ?? []), award]);
  const progressByDefinition = new Map(progress.map((item) => [item.badgeDefinitionId, item]));
  const badges = definitions.map((definition) => {
    const definitionAwards = awardsByDefinition.get(definition.id) ?? [];
    const currentProgress = progressByDefinition.get(definition.id);
    const isEarned = definition.category === "achievement"
      ? definition.achievementType === "tiered"
        ? (currentProgress?.earnedTiers?.length ?? 0) > 0
        : (currentProgress?.count ?? 0) > 0 || definitionAwards.length > 0
      : definitionAwards.length > 0;
    const nextTier = definition.tiers.find((tier) => !currentProgress?.earnedTiers?.includes(tier.tier as any));
    return {
      ...definition,
      isEarned,
      earnedAt: definitionAwards[0]?.awardedAt ?? null,
      count: currentProgress?.count ?? definitionAwards[0]?.count ?? 0,
      earnedTiers: currentProgress?.earnedTiers ?? definitionAwards.filter((award) => award.tier).map((award) => award.tier),
      currentProgress: currentProgress?.progress ?? 0,
      nextThreshold: nextTier?.threshold ?? null,
      awards: definitionAwards,
    };
  });
  return {
    isGoalie: goalieMembership.length > 0 || goalieAppearance.length > 0,
    sections: (["nhl_trophy", "team_badge", "achievement"] as BadgeCategory[]).map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      badges: badges.filter((badge) => badge.category === category),
    })),
  };
}

export async function getPendingBadgeEvents(userId: string) {
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

  const tieredEvents = events.filter((event) => typeof (event.payload as Record<string, unknown>)?.tier === "string");
  if (!tieredEvents.length) return events;

  const definitionIds = Array.from(new Set(tieredEvents.map((event) => event.definition.id)));
  const tiers = await db.select({
    badgeDefinitionId: badgeTiers.badgeDefinitionId,
    tier: badgeTiers.tier,
    imagePath: badgeTiers.imagePath,
  }).from(badgeTiers).where(inArray(badgeTiers.badgeDefinitionId, definitionIds));
  const tierImagePaths = new Map(tiers.map((tier) => [`${tier.badgeDefinitionId}:${tier.tier}`, tier.imagePath]));

  return events.map((event) => {
    const payload = event.payload as Record<string, unknown>;
    if (typeof payload.tier !== "string") return event;
    const existingImagePath = typeof payload.imagePath === "string" ? payload.imagePath : null;
    const imagePath = existingImagePath
      ?? tierImagePaths.get(`${event.definition.id}:${payload.tier}`)
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
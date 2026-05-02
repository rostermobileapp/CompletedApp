import type { Express } from "express";
import { db } from "./db";
import {
  drafts,
  draftPicks,
  draftBuddyPairs,
  draftChatMessages,
  leagues,
  leagueMemberships,
  teams,
  users,
  playerStats,
  draftSetupConfigSchema,
  type Draft,
} from "@shared/schema";
import { eq, and, asc, sql, inArray, isNull } from "drizzle-orm";
import {
  startDraft,
  pauseDraft,
  resumeDraft,
  makePick,
  commissionerPick,
  postChat,
  getDraftStateBundle,
  undoLastPick,
} from "./draftEngine";

// Auth middleware will be passed from caller
type IsAuth = (req: any, res: any, next: any) => void;

/**
 * Verify the requesting user is the commissioner of the league.
 */
async function isLeagueCommissioner(leagueId: string, userId: string): Promise<boolean> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  return !!league && league.commissionerId === userId;
}

/**
 * Verify the requesting user is a captain of any team in the draft order.
 */
async function isCaptainInDraft(draftId: string, userId: string): Promise<boolean> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return false;
  const draftOrder = (draft.draftOrder as string[]) || [];
  if (draftOrder.length === 0) return false;
  const teamRows = await db.select().from(teams).where(inArray(teams.id, draftOrder));
  return teamRows.some((t) => t.captainId === userId);
}

/**
 * Verify the requesting user has read access to the draft (commissioner OR
 * approved league member). Captains and members of the league can view draft
 * state; non-members cannot.
 */
async function canViewLeagueDraft(leagueId: string, userId: string): Promise<boolean> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) return false;
  if (league.commissionerId === userId) return true;
  const [m] = await db
    .select({ id: leagueMemberships.id })
    .from(leagueMemberships)
    .where(
      and(
        eq(leagueMemberships.leagueId, leagueId),
        eq(leagueMemberships.userId, userId),
        eq(leagueMemberships.status, "approved"),
      ),
    )
    .limit(1);
  return !!m;
}

export async function canViewDraft(draftId: string, userId: string): Promise<boolean> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return false;
  return canViewLeagueDraft(draft.leagueId, userId);
}

export async function canChatInDraft(draftId: string, userId: string): Promise<boolean> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return false;
  if (await isLeagueCommissioner(draft.leagueId, userId)) return true;
  return isCaptainInDraft(draftId, userId);
}

export function registerDraftRoutes(app: Express, isAuthenticated: IsAuth) {
  // === GET draft for a league/season ===
  app.get(
    "/api/leagues/:leagueId/seasons/:seasonId/draft",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { leagueId, seasonId } = req.params;
        const userId = req.user.claims.sub;
        if (!(await canViewLeagueDraft(leagueId, userId))) {
          return res.status(403).json({ message: "Not authorized to view this draft" });
        }
        const [draft] = await db
          .select()
          .from(drafts)
          .where(and(eq(drafts.leagueId, leagueId), eq(drafts.seasonId, seasonId)));
        if (!draft) return res.status(404).json({ message: "No draft found" });
        const buddyPairs = await db
          .select()
          .from(draftBuddyPairs)
          .where(eq(draftBuddyPairs.draftId, draft.id));
        return res.json({ draft, buddyPairs });
      } catch (err) {
        console.error("GET draft error:", err);
        res.status(500).json({ message: "Failed to fetch draft" });
      }
    },
  );

  app.get("/api/drafts/:draftId", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      if (!(await canViewDraft(draftId, userId))) {
        return res.status(403).json({ message: "Not authorized to view this draft" });
      }
      const bundle = await getDraftStateBundle(draftId);
      if (!bundle) return res.status(404).json({ message: "Draft not found" });
      return res.json(bundle);
    } catch (err) {
      console.error("GET draft state error:", err);
      res.status(500).json({ message: "Failed to fetch draft state" });
    }
  });

  // List draft eligible players (for setup + draft room)
  app.get("/api/leagues/:leagueId/draft-players", isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;
      if (!(await canViewLeagueDraft(leagueId, userId))) {
        return res.status(403).json({ message: "Not authorized to view this league" });
      }
      const rows = await db
        .select({
          membership: leagueMemberships,
          user: users,
        })
        .from(leagueMemberships)
        .innerJoin(users, eq(users.id, leagueMemberships.userId))
        .where(
          and(
            eq(leagueMemberships.leagueId, leagueId),
            eq(leagueMemberships.status, "approved"),
          ),
        );
      return res.json(rows);
    } catch (err) {
      console.error("List draft players error:", err);
      res.status(500).json({ message: "Failed to fetch players" });
    }
  });

  // === Create or upsert draft config (wizard "Save") ===
  app.post(
    "/api/leagues/:leagueId/seasons/:seasonId/draft",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { leagueId, seasonId } = req.params;
        const userId = req.user.claims.sub;
        if (!(await isLeagueCommissioner(leagueId, userId))) {
          return res.status(403).json({ message: "Only the commissioner can configure the draft" });
        }
        const config = draftSetupConfigSchema.parse(req.body);

        // Default totalRounds = teams in season if not provided
        const seasonTeams = await db
          .select()
          .from(teams)
          .where(eq(teams.leagueId, leagueId));
        const totalRounds = config.totalRounds ?? Math.max(8, Math.ceil(seasonTeams.length * 1.2));
        const draftOrder = config.draftOrder ?? seasonTeams.map((t) => t.id);

        // Map extended draftStyle → legacy roundType
        const legacyRoundType =
          config.draftStyle === "linear"
            ? "linear"
            : "snake"; // snake covers snake / 3rd_round_reversal / auction fallbacks

        // Check existing
        const [existing] = await db
          .select()
          .from(drafts)
          .where(and(eq(drafts.leagueId, leagueId), eq(drafts.seasonId, seasonId)));

        let draftRow: Draft;
        if (existing) {
          if (existing.status === "active" || existing.status === "completed") {
            return res.status(400).json({ message: "Cannot edit a started or completed draft" });
          }
          const [updated] = await db
            .update(drafts)
            .set({
              draftStyle: config.draftStyle,
              roundType: legacyRoundType as any,
              goalieMethod: config.goalieMethod,
              timerExpiryRule: config.timerExpiryRule,
              timePerPick: config.timePerPick,
              skillRankingEnabled: config.skillRankingEnabled,
              skillScale: config.skillScale ?? null,
              playerNotes: config.playerNotes ?? {},
              goalieAssignments: config.goalieAssignments ?? {},
              draftOrder,
              totalRounds,
              updatedAt: new Date(),
            })
            .where(eq(drafts.id, existing.id))
            .returning();
          draftRow = updated;
        } else {
          const [created] = await db
            .insert(drafts)
            .values({
              leagueId,
              seasonId,
              name: `Draft for season ${seasonId.slice(0, 6)}`,
              draftStyle: config.draftStyle,
              roundType: legacyRoundType as any,
              goalieMethod: config.goalieMethod,
              timerExpiryRule: config.timerExpiryRule,
              timePerPick: config.timePerPick,
              skillRankingEnabled: config.skillRankingEnabled,
              skillScale: config.skillScale ?? null,
              playerNotes: config.playerNotes ?? {},
              goalieAssignments: config.goalieAssignments ?? {},
              draftOrder,
              totalRounds,
              createdBy: userId,
            })
            .returning();
          draftRow = created;
        }

        // Replace buddy pairs (idempotent)
        await db.delete(draftBuddyPairs).where(eq(draftBuddyPairs.draftId, draftRow.id));
        if (config.buddyPairs && config.buddyPairs.length) {
          for (const pair of config.buddyPairs) {
            await db.insert(draftBuddyPairs).values({ draftId: draftRow.id, userIds: pair });
          }
        }

        // Persist skill levels (per-user) onto leagueMemberships if provided
        if (config.skillLevels) {
          for (const [userIdSkill, tier] of Object.entries(config.skillLevels)) {
            await db
              .update(leagueMemberships)
              .set({ skillLevel: tier })
              .where(
                and(
                  eq(leagueMemberships.leagueId, leagueId),
                  eq(leagueMemberships.userId, userIdSkill),
                ),
              );
          }
        }

        const buddyPairs = await db
          .select()
          .from(draftBuddyPairs)
          .where(eq(draftBuddyPairs.draftId, draftRow.id));
        res.json({ draft: draftRow, buddyPairs });
      } catch (err: any) {
        console.error("Save draft config error:", err);
        if (err?.issues) {
          return res.status(400).json({ message: "Invalid draft config", errors: err.issues });
        }
        res.status(500).json({ message: "Failed to save draft config" });
      }
    },
  );

  // === Lock draft (mark ready to start) ===
  app.post("/api/drafts/:draftId/lock", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can lock the draft" });
      }
      // Validate skill tiers if enabled
      if (draft.skillRankingEnabled) {
        const missing = await db
          .select()
          .from(leagueMemberships)
          .where(
            and(
              eq(leagueMemberships.leagueId, draft.leagueId),
              eq(leagueMemberships.status, "approved"),
              isNull(leagueMemberships.skillLevel),
            ),
          );
        if (missing.length) {
          return res.status(400).json({
            message: `${missing.length} player(s) missing skill tier`,
            missingCount: missing.length,
          });
        }
      }
      const [updated] = await db
        .update(drafts)
        .set({ lockedAt: new Date(), updatedAt: new Date() })
        .where(eq(drafts.id, draftId))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error("Lock draft error:", err);
      res.status(500).json({ message: "Failed to lock draft" });
    }
  });

  // === Start draft ===
  app.post("/api/drafts/:draftId/start", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can start the draft" });
      }
      const result = await startDraft(draftId);
      if (!result.ok) return res.status(400).json({ message: result.error });
      res.json({ ok: true });
    } catch (err) {
      console.error("Start draft error:", err);
      res.status(500).json({ message: "Failed to start draft" });
    }
  });

  app.post("/api/drafts/:draftId/pause", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can pause the draft" });
      }
      await pauseDraft(draftId);
      res.json({ ok: true });
    } catch (err) {
      console.error("Pause draft error:", err);
      res.status(500).json({ message: "Failed to pause draft" });
    }
  });

  app.post("/api/drafts/:draftId/resume", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can resume the draft" });
      }
      await resumeDraft(draftId);
      res.json({ ok: true });
    } catch (err) {
      console.error("Resume draft error:", err);
      res.status(500).json({ message: "Failed to resume draft" });
    }
  });

  // === Make a pick ===
  app.post("/api/drafts/:draftId/pick", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const { playerId } = req.body || {};
      if (!playerId) return res.status(400).json({ message: "playerId required" });
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      const isCommish = await isLeagueCommissioner(draft.leagueId, userId);
      const result = isCommish
        ? await commissionerPick(draftId, playerId)
        : await makePick(draftId, userId, playerId);
      if (!result.ok) return res.status(400).json({ message: result.error });
      res.json({ ok: true });
    } catch (err) {
      console.error("Make pick error:", err);
      res.status(500).json({ message: "Failed to make pick" });
    }
  });

  // === Undo last pick (commissioner only, within UNDO_WINDOW_MS) ===
  app.post("/api/drafts/:draftId/undo", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can undo a pick" });
      }
      const result = await undoLastPick(draftId);
      if (!result.ok) return res.status(400).json({ message: result.error });
      res.json({ ok: true });
    } catch (err) {
      console.error("Undo pick error:", err);
      res.status(500).json({ message: "Failed to undo pick" });
    }
  });

  // === Post chat ===
  app.post("/api/drafts/:draftId/chat", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const { body } = req.body || {};
      if (!body || typeof body !== "string") return res.status(400).json({ message: "body required" });
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      const isCommish = await isLeagueCommissioner(draft.leagueId, userId);
      const isCaptain = await isCaptainInDraft(draftId, userId);
      if (!isCommish && !isCaptain) {
        return res.status(403).json({ message: "Only captains and commissioner can chat" });
      }
      await postChat(draftId, userId, body);
      res.json({ ok: true });
    } catch (err) {
      console.error("Post chat error:", err);
      res.status(500).json({ message: "Failed to post chat" });
    }
  });

  // === Get player stats for trading card (hockey-first) ===
  app.get("/api/drafts/:draftId/players/:userId/card", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId, userId } = req.params;
      const requesterId = req.user.claims.sub;
      if (!(await canViewDraft(draftId, requesterId))) {
        return res.status(403).json({ message: "Not authorized to view this draft" });
      }
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });
      const [membership] = await db
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, draft.leagueId),
            eq(leagueMemberships.userId, userId),
          ),
        );
      const stats = await db
        .select()
        .from(playerStats)
        .where(and(eq(playerStats.userId, userId), eq(playerStats.leagueId, draft.leagueId)));
      const playerNotes = (draft.playerNotes as Record<string, string>) || {};
      res.json({
        user,
        membership,
        stats,
        note: playerNotes[userId] || "",
        leagueId: draft.leagueId,
      });
    } catch (err) {
      console.error("Player card error:", err);
      res.status(500).json({ message: "Failed to fetch player card" });
    }
  });
}

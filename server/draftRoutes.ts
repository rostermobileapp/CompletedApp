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
  seasons,
  draftSetupConfigSchema,
  type Draft,
} from "@shared/schema";
import { eq, and, or, asc, desc, ne, sql, inArray, isNull } from "drizzle-orm";
import { storage } from "./storage";
import { broadcastNotificationUpdate } from "./routes";
import {
  startDraft,
  pauseDraft,
  resumeDraft,
  makePick,
  commissionerPick,
  postChat,
  getDraftStateBundle,
  undoLastPick,
  requestCaptainReady,
  markCaptainReady,
  cancelDraftToPending,
  computePickingTeam,
  terminateDraft,
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

      // ── Attach prior-season stats (goals/assists) per player ──
      // Resolve "prior season" as the most recently created season in this
      // league other than the current draft's season. If a `seasonId` query
      // param is supplied (e.g. the active draft's season), exclude it;
      // otherwise just use the most recent season.
      const currentSeasonId = (req.query?.seasonId as string | undefined) || null;
      const priorSeasonRows = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(
          currentSeasonId
            ? and(eq(seasons.leagueId, leagueId), ne(seasons.id, currentSeasonId))
            : eq(seasons.leagueId, leagueId),
        )
        .orderBy(desc(seasons.createdAt))
        .limit(1);
      const priorSeasonId = priorSeasonRows[0]?.id;

      const priorStatsByUser: Record<string, { goals: number; assists: number }> = {};
      if (priorSeasonId && rows.length) {
        const userIds = rows.map((r) => r.user.id);
        const stats = await db
          .select({
            userId: playerStats.userId,
            goals: playerStats.goals,
            assists: playerStats.assists,
          })
          .from(playerStats)
          .where(
            and(
              eq(playerStats.leagueId, leagueId),
              eq(playerStats.seasonId, priorSeasonId),
              inArray(playerStats.userId, userIds),
            ),
          );
        for (const s of stats) {
          priorStatsByUser[s.userId] = { goals: s.goals || 0, assists: s.assists || 0 };
        }
      }

      const enriched = rows.map((r) => ({
        ...r,
        priorStats: priorStatsByUser[r.user.id] || { goals: 0, assists: 0 },
      }));
      return res.json(enriched);
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
              pickMode: config.pickMode ?? "captains",
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
              status: "pending",
              draftStyle: config.draftStyle,
              roundType: legacyRoundType as any,
              goalieMethod: config.goalieMethod,
              pickMode: config.pickMode ?? "captains",
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

        // Apply captain assignments directly to teams (commissioner-trusted, pre-draft).
        // In commissioner pick-mode, captains are unused — clear any prior assignments
        // so the awaiting-captains lobby doesn't gate-keep on stale captains.
        if ((config.pickMode ?? "captains") === "commissioner") {
          await db
            .update(teams)
            .set({ captainId: null })
            .where(eq(teams.leagueId, leagueId));
        } else if (config.captainAssignments) {
          for (const [teamId, captainUserId] of Object.entries(config.captainAssignments)) {
            if (captainUserId) {
              await db.update(teams).set({ captainId: captainUserId }).where(eq(teams.id, teamId));
            }
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

  // === Start draft (puts draft into the awaiting_captains lobby) ===
  // Captains are notified and must each click READY before the commissioner
  // can press "Begin" via /api/drafts/:draftId/begin.
  app.post("/api/drafts/:draftId/start", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can start the draft" });
      }
      // In commissioner pick-mode there are no captains to ready up — the
      // commissioner runs every pick. Skip the lobby entirely and transition
      // straight from pending to active.
      if (draft.pickMode === "commissioner") {
        const begun = await startDraft(draftId);
        if (!begun.ok) return res.status(400).json({ message: begun.error });
        return res.json({ ok: true, status: "active" });
      }

      const result = await requestCaptainReady(draftId, userId);
      if (!result.ok) return res.status(400).json({ message: result.error });

      // Notify each captain (excluding the commissioner) so they can confirm.
      const [league] = await db.select().from(leagues).where(eq(leagues.id, draft.leagueId));
      const leagueName = league?.name || "your league";
      const [commish] = await db.select().from(users).where(eq(users.id, userId));
      const commishName =
        (commish?.firstName || "").trim() ||
        commish?.displayName ||
        "Your commissioner";
      for (const captainUserId of result.captainUserIds || []) {
        if (captainUserId === userId) continue;
        try {
          await storage.createNotification({
            userId: captainUserId,
            type: "general",
            title: "Draft starting soon",
            message: `${commishName} is starting the ${leagueName} draft — tap to get ready.`,
            actionUrl: `/draft/${draftId}`,
            actionText: "Open draft",
          });
          broadcastNotificationUpdate(captainUserId);
        } catch (e) {
          console.error("[draft] failed to notify captain", captainUserId, e);
        }
      }
      res.json({ ok: true, status: "awaiting_captains" });
    } catch (err) {
      console.error("Start draft error:", err);
      res.status(500).json({ message: "Failed to start draft" });
    }
  });

  // === Captain marks themselves ready in the lobby ===
  app.post("/api/drafts/:draftId/captain-ready", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      const isCommish = await isLeagueCommissioner(draft.leagueId, userId);
      const isCap = await isCaptainInDraft(draftId, userId);
      if (!isCommish && !isCap) {
        return res.status(403).json({ message: "Only captains and commissioner can ready up" });
      }
      const result = await markCaptainReady(draftId, userId);
      if (!result.ok) return res.status(400).json({ message: result.error });
      res.json({ ok: true });
    } catch (err) {
      console.error("Captain ready error:", err);
      res.status(500).json({ message: "Failed to mark ready" });
    }
  });

  // === Commissioner re-sends READY notifications to captains who are not
  //     yet ready ===
  app.post("/api/drafts/:draftId/resend-ready", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can resend invites" });
      }
      if (draft.status !== "awaiting_captains") {
        return res.status(400).json({ message: "Draft is not in the captain-ready lobby" });
      }
      const draftOrder = (draft.draftOrder as string[]) || [];
      const teamRows = await db.select().from(teams).where(inArray(teams.id, draftOrder));
      const ready = (draft.captainReadyState as Record<string, boolean>) || {};
      const pendingCaptains = teamRows
        .map((t) => t.captainId)
        .filter((x): x is string => !!x && !ready[x] && x !== userId);

      const [league] = await db.select().from(leagues).where(eq(leagues.id, draft.leagueId));
      const leagueName = league?.name || "your league";
      const [commish] = await db.select().from(users).where(eq(users.id, userId));
      const commishName =
        (commish?.firstName || "").trim() ||
        commish?.displayName ||
        "Your commissioner";
      let sent = 0;
      for (const captainUserId of pendingCaptains) {
        try {
          await storage.createNotification({
            userId: captainUserId,
            type: "general",
            title: "Reminder: Draft starting soon",
            message: `${commishName} is waiting on you for the ${leagueName} draft — tap to get ready.`,
            actionUrl: `/draft/${draftId}`,
            actionText: "Open draft",
          });
          broadcastNotificationUpdate(captainUserId);
          sent++;
        } catch (e) {
          console.error("[draft] failed to resend captain", captainUserId, e);
        }
      }
      res.json({ ok: true, sent, pending: pendingCaptains.length });
    } catch (err) {
      console.error("Resend ready error:", err);
      res.status(500).json({ message: "Failed to resend invites" });
    }
  });

  // === Commissioner cancels the lobby back to pending ===
  app.post("/api/drafts/:draftId/cancel-lobby", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can cancel the lobby" });
      }
      const result = await cancelDraftToPending(draftId);
      if (!result.ok) return res.status(400).json({ message: result.error });
      res.json({ ok: true, status: "pending" });
    } catch (err) {
      console.error("Cancel lobby error:", err);
      res.status(500).json({ message: "Failed to cancel lobby" });
    }
  });

  // === Commissioner resets a draft back to pending ===
  // Works from any status (pending, awaiting_captains, active, paused, completed).
  // Deletes all picks, removes the teamMembership rows those picks created, and
  // resets the draft to a clean pending state so setup can start over.
  app.post("/api/drafts/:draftId/reset", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can reset the draft" });
      }

      // Collect player IDs from picks so we can clean up teamMemberships
      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draftId));

      const draftOrder = (draft.draftOrder as string[]) || [];

      // Remove teamMembership rows that were created by the draft for these
      // teams — only rows that resulted from a draft pick (not pre-existing ones).
      if (picks.length > 0 && draftOrder.length > 0) {
        const pickedPlayerIds = [...new Set(picks.map(p => p.playerId).filter(Boolean))] as string[];
        if (pickedPlayerIds.length > 0) {
          const { teamMemberships } = await import("@shared/schema");
          await db
            .delete(teamMemberships)
            .where(
              and(
                inArray(teamMemberships.teamId, draftOrder),
                inArray(teamMemberships.userId, pickedPlayerIds),
              ),
            );
        }
      }

      // Delete all picks for this draft
      await db.delete(draftPicks).where(eq(draftPicks.draftId, draftId));

      // Reset the draft row to a clean pending state
      await db
        .update(drafts)
        .set({
          status: "pending",
          currentPickIndex: 0,
          captainReadyState: {},
          completedAt: null,
          startedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(drafts.id, draftId));

      res.json({ ok: true, status: "pending" });
    } catch (err) {
      console.error("Reset draft error:", err);
      res.status(500).json({ message: "Failed to reset draft" });
    }
  });

  // === Commissioner terminates the draft early ===
  // Commits all picks made so far to team memberships and marks the draft
  // completed, exactly like a natural end-of-rounds completion.
  app.post("/api/drafts/:draftId/terminate", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can terminate the draft" });
      }
      if (draft.status === "completed") {
        return res.status(400).json({ message: "Draft is already completed" });
      }
      await terminateDraft(draftId);
      res.json({ ok: true });
    } catch (err) {
      console.error("Terminate draft error:", err);
      res.status(500).json({ message: "Failed to terminate draft" });
    }
  });

  // === Commissioner actually begins the draft (transitions to active) ===
  // Server-enforced gate: startDraft refuses to transition unless every
  // captain in draftOrder has confirmed READY.
  app.post("/api/drafts/:draftId/begin", isAuthenticated, async (req: any, res) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.claims.sub;
      const [draft] = await db.select().from(drafts).where(eq(drafts.id, draftId));
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!(await isLeagueCommissioner(draft.leagueId, userId))) {
        return res.status(403).json({ message: "Only the commissioner can begin the draft" });
      }
      const result = await startDraft(draftId);
      if (!result.ok) return res.status(400).json({ message: result.error });
      res.json({ ok: true, status: "active" });
    } catch (err) {
      console.error("Begin draft error:", err);
      res.status(500).json({ message: "Failed to begin draft" });
    }
  });

  // === List drafts the current user has an active stake in ===
  // Returns drafts where the user is the league commissioner OR is the captain
  // of a team in draftOrder, AND the draft is active/paused/awaiting_captains.
  // Used by the persistent banner so users can return to an in-progress draft
  // from anywhere in the app, including live round/captain/deadline info so
  // the banner can render an inline countdown + pulse.
  app.get("/api/user/active-drafts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const candidates = await db
        .select({
          draft: drafts,
          leagueName: leagues.name,
          commissionerId: leagues.commissionerId,
        })
        .from(drafts)
        .innerJoin(leagues, eq(leagues.id, drafts.leagueId))
        .where(
          or(
            eq(drafts.status, "active"),
            eq(drafts.status, "paused"),
            eq(drafts.status, "awaiting_captains"),
          ),
        );
      if (!candidates.length) return res.json([]);

      const myTeams = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.captainId, userId));
      const myTeamIds = new Set(myTeams.map((t) => t.id));

      // Pre-load the team + captain lookup tables for the candidates so we
      // can attach the current picking captain's display name.
      const allTeamIds = new Set<string>();
      for (const row of candidates) {
        for (const tid of (row.draft.draftOrder as string[]) || []) allTeamIds.add(tid);
      }
      const teamRows = allTeamIds.size
        ? await db.select().from(teams).where(inArray(teams.id, Array.from(allTeamIds)))
        : [];
      const teamById = new Map(teamRows.map((t) => [t.id, t]));
      const captainIds = teamRows
        .map((t) => t.captainId)
        .filter((x): x is string => !!x);
      const captainRows = captainIds.length
        ? await db.select().from(users).where(inArray(users.id, captainIds))
        : [];
      const userById = new Map(captainRows.map((u) => [u.id, u]));

      const result: Array<{
        id: string;
        leagueId: string;
        leagueName: string;
        status: string;
        role: "commissioner" | "captain";
        currentRound: number;
        totalRounds: number;
        currentTurn: number;
        currentTurnDeadline: string | null;
        pickingCaptainName: string | null;
        readyCount?: number;
        captainCount?: number;
      }> = [];
      for (const row of candidates) {
        const isCommish = row.commissionerId === userId;
        const order = (row.draft.draftOrder as string[]) || [];
        const isCaptain = order.some((tid) => myTeamIds.has(tid));
        if (!isCommish && !isCaptain) continue;
        // Use the same snake/linear-aware logic as the engine so the banner
        // shows the correct captain for the current turn (matters in even
        // rounds of a snake draft where order reverses).
        const style =
          (row.draft.draftStyle as string) ||
          (row.draft as any).roundType ||
          "snake";
        const teamId =
          row.draft.status === "active" || row.draft.status === "paused"
            ? computePickingTeam(
                order,
                row.draft.currentRound || 1,
                row.draft.currentTurn || 1,
                style,
              )
            : null;
        const team = teamId ? teamById.get(teamId) : null;
        const cap = team?.captainId ? userById.get(team.captainId) : null;
        const pickingCaptainName = cap
          ? (`${cap.firstName || ""} ${cap.lastName || ""}`.trim() ||
              cap.displayName ||
              cap.email ||
              "Captain")
          : null;
        const ready =
          (row.draft.captainReadyState as Record<string, boolean>) || {};
        const orderCaptainIds = order
          .map((tid) => teamById.get(tid)?.captainId)
          .filter((x): x is string => !!x);
        result.push({
          id: row.draft.id,
          leagueId: row.draft.leagueId,
          leagueName: row.leagueName || "League",
          status: row.draft.status,
          role: isCommish ? "commissioner" : "captain",
          currentRound: row.draft.currentRound || 1,
          totalRounds: row.draft.totalRounds || 1,
          currentTurn: row.draft.currentTurn || 1,
          currentTurnDeadline: row.draft.currentTurnDeadline
            ? new Date(row.draft.currentTurnDeadline).toISOString()
            : null,
          pickingCaptainName,
          readyCount: orderCaptainIds.filter((cid) => ready[cid]).length,
          captainCount: orderCaptainIds.length,
        });
      }
      res.json(result);
    } catch (err) {
      console.error("Active drafts error:", err);
      res.status(500).json({ message: "Failed to fetch active drafts" });
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

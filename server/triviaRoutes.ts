import type { Express } from "express";
import { isAuthenticated } from "./supabaseAuth";
import { pool } from "./db";
import { getTrophyCaseAccess } from "./badges";
import { hasPaidTrophyCaseAccess } from "../shared/trophyCaseAccess";
import { TRIVIA_TEST_DISPLAY_IDS, isTriviaDateKey, isTriviaTestMode } from "@shared/trivia";
import {
  canAccessTriviaPatches,
  getTodayTrivia,
  getTriviaPatches,
  getTriviaStats,
  isTriviaEligible,
  resetTriviaAnswer,
  submitTriviaAnswer,
} from "./trivia";

type TriviaRequest = {
  user?: { claims?: { sub?: string } };
  body?: Record<string, unknown>;
};

async function getViewer(req: TriviaRequest) {
  const userId = req.user?.claims?.sub;
  if (!userId) return null;
  const result = await pool.query(
    `SELECT id, display_id, role, is_primary_commissioner, date_of_birth
     FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    displayId: row.display_id as string | null,
    role: row.role as string | null,
    isPrimaryCommissioner: row.is_primary_commissioner === true,
    dateOfBirth: row.date_of_birth as string | null,
  };
}

function sendPatchAccessDenied(res: any, viewer: Awaited<ReturnType<typeof getViewer>>) {
  if (!viewer || !canAccessTriviaPatches(viewer)) {
    const paid = viewer ? hasPaidTrophyCaseAccess(viewer) : false;
    if (!paid) {
      res.status(403).json({
        code: "TROPHY_CASE_PREMIUM_REQUIRED",
        message: "Trophy Case access requires Player Pro or Commissioner access.",
      });
    } else {
      const access = getTrophyCaseAccess(viewer?.dateOfBirth);
      res.status(403).json({
        code: "TROPHY_CASE_AGE_REQUIRED",
        reason: access,
        message: access === "under_21"
          ? "The Trophy Case is available only to users age 21 and older."
          : "Enter your date of birth in your profile to verify that you are age 21 or older.",
      });
    }
    return true;
  }
  return false;
}

export function registerTriviaRoutes(app: Express): void {
  const triviaAccess = async (req: any, res: any, next: any) => {
    try {
      const viewer = await getViewer(req);
      if (!viewer || !isTriviaEligible(viewer.displayId)) {
        return res.status(403).json({ code: "TRIVIA_UNAVAILABLE", message: "Daily trivia is not available for this account." });
      }
      req.triviaViewer = viewer;
      return next();
    } catch (error) {
      console.error("[Trivia] Failed to check trivia eligibility:", error);
      return res.status(500).json({ message: "Failed to check trivia eligibility." });
    }
  };

  app.get("/api/trivia/today", isAuthenticated, triviaAccess, async (req: any, res: any) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.json(await getTodayTrivia(req.triviaViewer.id, req.triviaViewer, undefined, { includeUnansweredPatch: false }));
    } catch (error) {
      console.error("[Trivia] Failed to load today's question:", error);
      return res.status(503).json({ code: "TRIVIA_UNAVAILABLE", message: error instanceof Error ? error.message : "Failed to load today's trivia." });
    }
  });

  app.get("/api/trivia/stats", isAuthenticated, triviaAccess, async (req: any, res: any) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.json(await getTriviaStats(req.triviaViewer.id));
    } catch (error) {
      console.error("[Trivia] Failed to load trivia stats:", error);
      return res.status(500).json({ message: "Failed to load trivia stats." });
    }
  });

  app.get("/api/trivia/patches", isAuthenticated, triviaAccess, async (req: any, res: any) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      if (sendPatchAccessDenied(res, req.triviaViewer)) return;
      return res.json(await getTriviaPatches(req.triviaViewer.id));
    } catch (error) {
      console.error("[Trivia] Failed to load trivia patches:", error);
      return res.status(500).json({ message: "Failed to load trivia patches." });
    }
  });

  app.post("/api/trivia/answer", isAuthenticated, triviaAccess, async (req: TriviaRequest & any, res: any) => {
    try {
      const body = req.body ?? {};
      if (!Number.isInteger(body.chosen_index) || body.chosen_index < 0 || body.chosen_index > 3) {
        return res.status(400).json({ message: "chosen_index must be an integer from zero through three." });
      }
      if (!isTriviaDateKey(body.trivia_date)) {
        return res.status(400).json({ message: "trivia_date must be a valid Eastern calendar date." });
      }
      const result = await submitTriviaAnswer({
        userId: req.triviaViewer.id,
        viewer: req.triviaViewer,
        chosenIndex: body.chosen_index,
        triviaDate: body.trivia_date,
      });
      if (result.status === "stale") {
        return res.status(409).json({ code: "TRIVIA_DATE_EXPIRED", message: "That trivia day has ended. Load today's question to continue." });
      }
      if (result.status === "conflict") {
        return res.status(409).json({ code: "TRIVIA_ALREADY_ANSWERED", message: "Today's answer was already submitted." });
      }
      return res.json(result.feedback);
    } catch (error) {
      console.error("[Trivia] Failed to save answer:", error);
      return res.status(500).json({ message: error instanceof Error ? error.message : "Failed to save trivia answer." });
    }
  });

  // A test-only reset endpoint is intentionally limited to the allowlisted
  // U00001 account, and the data helper repeats that identity check in SQL.
  app.post("/api/trivia/test-reset", isAuthenticated, triviaAccess, async (req: TriviaRequest & any, res: any) => {
    try {
      if (!isTriviaTestMode()) {
        return res.status(403).json({
          code: "TRIVIA_RESET_DISABLED",
          message: "Trivia answer reset is disabled outside test mode.",
        });
      }
      if (req.triviaViewer.displayId !== TRIVIA_TEST_DISPLAY_IDS[0]) {
        return res.status(403).json({ message: "Only the U00001 test account may reset trivia answers." });
      }
      const dateKey = req.body?.trivia_date;
      if (!isTriviaDateKey(dateKey)) return res.status(400).json({ message: "trivia_date must be a valid Eastern calendar date." });
      return res.json(await resetTriviaAnswer(dateKey));
    } catch (error) {
      console.error("[Trivia] Failed to reset test answer:", error);
      return res.status(500).json({ message: error instanceof Error ? error.message : "Failed to reset test answer." });
    }
  });
}
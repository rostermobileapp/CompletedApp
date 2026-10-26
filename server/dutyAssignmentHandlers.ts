import type { Express, RequestHandler } from "express";

export type DutyPlayer = { userId: string; firstName: string | null; lastName: string | null };
export type DutyContext = {
  gameId: string;
  teamId: string;
  tournamentTeamIds: string[];
  substituteGameId: string | null;
  teamEventId: string | null;
};

export interface DutyAssignmentDependencies {
  resolveContext(gameId: string, teamId: string): Promise<DutyContext>;
  isCaptain(teamId: string, userId: string): Promise<boolean>;
  getPlayers(context: DutyContext): Promise<DutyPlayer[]>;
  getAvailableTemplates(teamId: string, gameId: string): Promise<{ id: string }[]>;
  save(context: DutyContext, dutyTemplateId: string, userId: string | null): Promise<void>;
}

export class DutyAssignmentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Shared by the picker and write path so selection never bypasses eligibility. */
export function registerDutyAssignmentHandlers(
  app: Express,
  auth: RequestHandler,
  dependencies: DutyAssignmentDependencies,
) {
  const handle = (assign: boolean): RequestHandler => async (req, res) => {
    try {
      const teamId = assign ? req.body?.teamId : req.params.teamId;
      if (typeof teamId !== "string" || !teamId.trim()) {
        throw new DutyAssignmentError(400, "Team ID is required");
      }
      if (assign && req.body.userId !== null &&
        (typeof req.body.userId !== "string" || !req.body.userId.trim())) {
        throw new DutyAssignmentError(400, "Choose a player or explicitly clear the assignment");
      }
      const context = await dependencies.resolveContext(req.params.gameId, teamId);
      if (!await dependencies.isCaptain(context.teamId, (req as any).user.claims.sub)) {
        throw new DutyAssignmentError(403, "Only team captains can assign duties");
      }
      if (!assign) {
        res.json(await dependencies.getPlayers(context));
        return;
      }
      const templates = await dependencies.getAvailableTemplates(context.teamId, context.gameId);
      if (!templates.some(template => template.id === req.params.dutyTemplateId)) {
        throw new DutyAssignmentError(404, "Duty is not available for this team and game");
      }
      const userId = req.body.userId as string | null;
      if (userId !== null) {
        const players = await dependencies.getPlayers(context);
        if (!players.some(player => player.userId === userId)) {
          throw new DutyAssignmentError(400, "Choose a team player or an approved substitute for this game");
        }
      }
      await dependencies.save(context, req.params.dutyTemplateId, userId);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof DutyAssignmentError) {
        res.status(error.status).json({ message: error.message });
      } else {
        console.error("[DutyAssignment] Request failed");
        res.status(500).json({ message: "Could not update or load duty assignments" });
      }
    }
  };
  app.get("/api/games/:gameId/teams/:teamId/duty-players", auth, handle(false));
  app.put("/api/games/:gameId/duties/:dutyTemplateId/assignment", auth, handle(true));
}

import { and, eq, gte, lte } from "drizzle-orm";
import { leagueMemberships, leagueProGrants, leagueProSeats, leagues } from "../shared/schema";
import type { db } from "./db";

type Database = Pick<typeof db, "select">;
const membership = and(
  eq(leagueMemberships.userId, leagueProSeats.userId),
  eq(leagueMemberships.leagueId, leagueProSeats.leagueId),
  eq(leagueMemberships.status, "approved"),
);
const conditions = (userId: string, month: string, leagueId?: string) => and(
  eq(leagueProSeats.userId, userId),
  eq(leagueProGrants.status, "paid"),
  eq(leagueProGrants.leagueId, leagueProSeats.leagueId),
  lte(leagueProGrants.startMonth, month), gte(leagueProGrants.endMonth, month),
  leagueId ? eq(leagueProSeats.leagueId, leagueId) : undefined,
);

export async function readActiveProSeats(database: Database, userId: string, month: string) {
  const rows = await database.select({ seat: leagueProSeats, grant: leagueProGrants, leagueName: leagues.name })
    .from(leagueProSeats)
    .innerJoin(leagueProGrants, eq(leagueProSeats.grantId, leagueProGrants.id))
    .innerJoin(leagues, eq(leagues.id, leagueProSeats.leagueId))
    .innerJoin(leagueMemberships, membership)
    .where(conditions(userId, month));
  return rows.map(row => ({ ...row.seat, grant: row.grant, leagueName: row.leagueName }));
}
export async function readHasActiveProSeat(database: Database, userId: string, leagueId: string, month: string) {
  const rows = await database.select({ id: leagueProSeats.id }).from(leagueProSeats)
    .innerJoin(leagueProGrants, eq(leagueProSeats.grantId, leagueProGrants.id))
    .innerJoin(leagueMemberships, membership)
    .where(conditions(userId, month, leagueId)).limit(1);
  return rows.length > 0;
}

type BoundaryDb = { query(text: string, values?: any[]): Promise<{ rows: any[] }> };

/** Legacy Adult lines/chat endpoints must not bypass the school-specific
 * coaching scope, consent checks or playing-eligibility restrictions. Check
 * both classifiers because older school teams can have an Adult program tag. */
export async function adultTeamOperationsAllowed(db: BoundaryDb, teamId: string): Promise<boolean> {
  const [team] = (await db.query(`SELECT t.program_type='adult'
    AND (t.league_id IS NULL OR l.league_type='adult') AS allowed
    FROM public.teams t LEFT JOIN public.leagues l ON l.id=t.league_id
    WHERE t.id=$1`, [teamId])).rows;
  return team?.allowed === true;
}

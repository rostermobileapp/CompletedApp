type Query = { query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount: number | null }> };
export interface AwardPush {
  userId: string; title: string; message: string; data: Record<string,string>; idempotencyKey: string; timeoutMs: number;
}
/** Pure dependency boundary: tests use a disposable database and a fake push sender. */
export async function deliverTeamAwardPushBatch(pool: Query, send: (push: AwardPush) => Promise<boolean>) {
  const installed = await pool.query("SELECT to_regclass('public.team_award_config') IS NOT NULL AS ready");
  if (!installed.rows[0]?.ready) return;
  const config = await pool.query("SELECT enabled FROM team_award_config WHERE id=true");
  if (!config.rows[0]?.enabled) return;
  const claimed = await pool.query(`
    UPDATE team_award_pushes p SET claimed_at=now(),attempts=attempts+1
    WHERE p.id IN (SELECT id FROM team_award_pushes WHERE sent_at IS NULL AND discarded_at IS NULL
      AND (claimed_at IS NULL OR claimed_at < now()-interval '5 minutes')
      AND attempts<6 AND created_at>now()-interval '1 day'
      ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING *`);
  for (const push of claimed.rows) {
    const current = await pool.query(`
      SELECT 1 FROM award_grants g JOIN team_awards a ON a.id=g.award_id
      JOIN team_award_pushes p ON p.grant_id=g.id AND p.id=$3 AND p.discarded_at IS NULL AND p.sent_at IS NULL
      WHERE g.id=$1 AND g.player_id=$2 AND g.holder_valid AND NOT a.archived
        AND ta_rostered(a.team_id,g.player_id)
        AND g.id=(SELECT id FROM award_grants WHERE award_id=a.id ORDER BY granted_at DESC,id DESC LIMIT 1)`,
      [push.grant_id,push.player_id,push.id]);
    if (!current.rowCount) {
      await pool.query("UPDATE team_award_pushes SET discarded_at=now() WHERE id=$1 AND claimed_at=$2", [push.id,push.claimed_at]);
      continue;
    }
    const sent = await send({
      userId: push.player_id, title: `You earned ${push.award_name}!`,
      message: "Your captain recognized you with a team award. Open My Team to see it.",
      data: { type:"team_award",teamId:push.team_id }, idempotencyKey:push.id, timeoutMs:20_000,
    });
    if (sent) await pool.query("UPDATE team_award_pushes SET sent_at=now() WHERE id=$1 AND claimed_at=$2", [push.id,push.claimed_at]);
  }
}

import { isolateDevelopmentEnvironment } from "../server/nonproductionEnvironment";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const fixtures = [
  { email: "commissioner@roster-dev.invalid", first: "Dev", last: "Commissioner", role: "commissioner", display: "U90001" },
  { email: "captain@roster-dev.invalid", first: "Dev", last: "Captain", role: "player_pro", display: "U90002" },
  { email: "player@roster-dev.invalid", first: "Dev", last: "Player", role: "free_tier", display: "U90003" },
];

async function main() {
  const env = isolateDevelopmentEnvironment(process.env);
  const sql = postgres(env.DEV_DATABASE_URL!, {
    max: 1, connect_timeout: 10, idle_timeout: 1,
    ssl: { rejectUnauthorized: true, ca: readFileSync(new URL("../server/certs/supabase-ca.pem", import.meta.url), "utf8") },
  });
  try {
    const [unexpected] = await sql`
      SELECT count(*)::int AS count FROM auth.users
      WHERE email NOT IN (${fixtures[0].email},${fixtures[1].email},${fixtures[2].email})
    `;
    if (unexpected.count) throw new Error("Development contains non-fixture Auth identities");
    const identities: string[] = [];
    for (const fixture of fixtures) {
      const [existing] = await sql`SELECT id FROM auth.users WHERE email=${fixture.email}`;
      let id = existing?.id as string | undefined;
      if (!id) {
        // Admin creation with email_confirm does not send an invitation or
        // confirmation email. Passwords are random and never printed/persisted.
        const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            email: fixture.email, password: randomBytes(32).toString("base64url"),
            email_confirm: true, user_metadata: { first_name: fixture.first, last_name: fixture.last },
          }),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Synthetic Auth identity creation failed");
        id = (await response.json()).id;
      }
      if (!id) throw new Error("Synthetic Auth identity missing");
      identities.push(id);
      await sql`
        INSERT INTO users (id,email,first_name,last_name,role,display_id)
        VALUES (${id},${fixture.email},${fixture.first},${fixture.last},${fixture.role},${fixture.display})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    await sql.begin(async tx => {
      await tx`
        INSERT INTO leagues (id,name,unique_league_id,sport,commissioner_id,timezone)
        VALUES ('dev-league','Synthetic Dev League','L90001','hockey',${identities[0]},'America/New_York')
        ON CONFLICT (id) DO NOTHING
      `;
      await tx`
        INSERT INTO seasons (id,name,league_id,start_date,end_date)
        VALUES ('dev-season','Synthetic Season','dev-league','2026-01-01','2026-12-31')
        ON CONFLICT (id) DO NOTHING
      `;
      await tx`
        INSERT INTO teams (id,name,unique_team_id,league_id,season_id,captain_id,creator_id)
        VALUES ('dev-team','Synthetic Dev Team','T90001','dev-league','dev-season',${identities[1]},${identities[0]})
        ON CONFLICT (id) DO NOTHING
      `;
      for (const [index, id] of identities.entries()) {
        await tx`
          INSERT INTO league_memberships (id,user_id,league_id,status,assigned_team_id)
          VALUES (${`dev-league-member-${index}`},${id},'dev-league','approved','dev-team')
          ON CONFLICT (id) DO NOTHING
        `;
        await tx`
          INSERT INTO team_memberships (id,user_id,team_id,status,is_captain)
          VALUES (${`dev-team-member-${index}`},${id},'dev-team','approved',${index === 1})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    });
    console.info("[Dev fixtures] Synthetic commissioner, captain, player, league, season and team are ready. No emails were requested.");
  } finally {
    await sql.end({ timeout: 2 });
  }
}
main().catch(error => {
  console.error("[Dev fixtures] Setup stopped.", { code: error?.code ?? "FIXTURE_SETUP_REFUSED" });
  process.exitCode = 1;
});

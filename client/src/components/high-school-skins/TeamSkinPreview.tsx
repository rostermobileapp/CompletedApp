import { useMemo, useState } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getSkin, ROLE_LABELS, type SkinContext, type SkinTeam, type TeamRole } from "@shared/teamSkin";
import { TeamSkinShell } from "./TeamSkinShell";

const roles: TeamRole[] = ["head_coach", "assistant_coach", "team_manager", "athletic_director", "parent", "player"];
/** Isolated-DEV, memory-only review. These are explicitly synthetic UI
 * contexts, not logins, role grants, migrations or a child activation path. */
export function TeamSkinPreview() {
  const [role, setRole] = useState<TeamRole>("head_coach");
  const [teamId, setTeamId] = useState("varsity");
  const location = useMemo(() => memoryLocation({ path: "/high-school/home" }), []);
  const teams: SkinTeam[] = [
    { id: "varsity", name: "Northfield Varsity", program_type: "high_school", role, status: "approved" },
    ...(role === "player" ? [] : [
      { id: "jv", name: "Northfield JV", program_type: "high_school", role: "team_manager", status: "approved" },
      { id: "adult", name: "Adult league team", program_type: "adult", role: "player", status: "approved" },
    ] as SkinTeam[]),
  ];
  const context: SkinContext = { actor: { id: "synthetic-review", type: role === "player" ? "child" : "adult" }, teams, restricted: true };
  const activeTeam = teams.find(t => t.id === teamId) ?? teams[0];
  const selectTeam = (id: string) => { setTeamId(id); location.navigate("/high-school/home"); };
  return <div>
    <aside className="relative z-[200] border-b border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
      <label>Phase 1 synthetic review — <select data-testid="skin-fixture-selector" value={role}
        onChange={e => { setRole(e.target.value as TeamRole); selectTeam("varsity"); }}>
        {roles.map(r => <option key={r} value={r}>{r === "player" ? "Child player" : ROLE_LABELS[r]}</option>)}
      </select></label>
      <span className="ml-3">No accounts, requests, billing or child activation.</span>
    </aside>
    {getSkin(context.actor, activeTeam) === "adult"
      ? <main className="p-8"><h1>Adult skin retained</h1><p>Real adult screens are intentionally not mounted in this synthetic review.</p>
          <button onClick={() => selectTeam("varsity")}>Return to school team</button></main>
      : <Router hook={location.hook}>
          <TeamSkinShell key={`${role}:${activeTeam.id}`} context={context} activeTeam={activeTeam} onTeamChange={selectTeam} />
        </Router>}
  </div>;
}

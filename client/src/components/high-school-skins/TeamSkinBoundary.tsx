import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getSkin, ROLE_LABELS, type SkinContext } from "@shared/teamSkin";
import { useAuth } from "@/hooks/useAuth";
import { useDemo } from "@/context/DemoContext";
import { useDashboardSelection } from "@/hooks/useDashboardSelection";
import { TeamSkinFacts } from "@/context/TeamSkinFacts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { childSkinSession, requestChildSession } from "@/lib/highSchoolChildSession";
import { isDevParentClient, parentVerificationSession } from "@/lib/parentVerificationSession";
import { resetTeamRequestScope } from "@/lib/teamRequestScope";
import { TeamSkinShell } from "./TeamSkinShell";
import { TeamSkinPreview } from "./TeamSkinPreview";
import ParentVerification from "@/pages/ParentVerification";
import { FamilySetup } from "@/components/high-school-family/FamilySetup";
import { LiveFamilyBoundary } from "@/components/high-school-family/LiveFamilyBoundary";
import { ProductionChildSession } from "@/components/high-school-onboarding/ProductionChildSession";

function PendingSkin({ failed = false }: { failed?: boolean }) {
  return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" role="status">
    <h1 className="text-xl font-semibold">{failed ? "Team access could not be verified" : "Checking team access"}</h1>
    <p>{failed ? "No team features have been loaded. Please try again." : "Your approved team and role determine this space."}</p>
    {failed && <button onClick={() => window.location.reload()}>Try again</button>}
  </main>;
}
function RecoverTeam({ context, onChoose, onAccount }: { context: SkinContext; onChoose: (id: string) => void; onAccount?: () => void }) {
  return <main className="tss tss-denied" data-testid="skin-team-recovery">
    <section className="tss-denied-card">
      <h1>Choose an approved team</h1>
      <p>Your saved team is no longer available in this account. Choose one of your approved teams to continue.</p>
      <div className="flex flex-col gap-3 mt-6">
        {context.teams.map(team => <button key={team.id} type="button" className="tss-return-button" style={{ marginTop: 0 }}
          aria-label={`Use ${team.name} as ${ROLE_LABELS[team.role]}`}
          onClick={() => onChoose(team.id)}>
          {team.name} — {ROLE_LABELS[team.role]}
        </button>)}
      </div>
      {onAccount && <button className="tss-return-button" onClick={onAccount}>Back to my account</button>}
    </section>
  </main>;
}
/** The only switch that may mount the legacy adult runtime. */
export function ResolvedSkinRuntime({ context, adult, entry }: {
  context: SkinContext; adult: ReactNode; entry: ReactNode;
}) {
  const selection = useDashboardSelection();
  const [path, navigate] = useLocation();
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const selectedType = selection.selectedType;
  const selectedId = selection.selectedId;
  const team = context.actor.type === "child" ? context.teams.find(t => t.program_type === "high_school" && t.role === "player")
    : selectedType === "team"
    ? context.teams.find(t => t.id === selectedId)
    : context.teams.find(t => t.program_type === "high_school");
  const hasAdultTeam = context.teams.some(t => t.program_type === "adult");
  // Preserve league/tournament navigation for actual adult contexts. A school-
  // only account cannot select a league/localStorage value to enter adult mode.
  const adultSelection = context.actor.type === "adult" &&
    ((!context.restricted && !context.teams.some(t => t.program_type === "high_school")) ||
    (selectedType === "team" ? team?.program_type === "adult" :
      hasAdultTeam || (!context.restricted && !context.teams.length)));
  let skin: ReturnType<typeof getSkin> | null = adultSelection ? "adult" : null;
  if (!adultSelection && team) {
    try { skin = getSkin(context.actor, team); } catch { /* fail closed */ }
  }
  const family = context.actor.type === "adult" && path === "/high-school/family";
  const scope = `${context.actor.type}:${context.actor.id}:${family ? "family" : skin === "adult" ? "adult" : `${team?.id}:${team?.role}`}`;
  useLayoutEffect(() => {
    const clearPreviousSurface = () => {
      resetTeamRequestScope();
      const predicate = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== "team-skin-context";
      void queryClient.cancelQueries({ predicate });
      // Do not let a late old-surface response repopulate another profile.
      queryClient.removeQueries({ predicate });
    };
    clearPreviousSurface();
    setReadyScope(scope);
    // Logout, expired verification and a revoked role also unmount this gate.
    return clearPreviousSurface;
  }, [scope]);
  useLayoutEffect(() => {
    if (context.actor.type === "child" && ["/under-18", "/under-18/code"].includes(path)) {
      navigate("/high-school/home", { replace: true });
    }
  }, [context.actor.type, path, navigate]);
  useLayoutEffect(() => {
    // A school-only account may arrive with no team selection or another
    // account's league/tournament selection. Persist its approved school
    // context so a later membership refresh cannot silently change the skin.
    if (context.actor.type === "adult" && !adultSelection && team && selection.selectedType !== "team") {
      selection.setTeamSelection(team.id);
    }
  }, [context.actor.type, adultSelection, team?.id, selection.selectedType]);
  const changeTeam = (id: string) => {
    const target = context.teams.find(t => t.id === id);
    if (context.actor.type === "child" || !target) return;
    resetTeamRequestScope();
    selection.setTeamSelection(id);
    navigate(target.program_type === "adult" ? "/" : "/high-school/home");
  };
  // Clear the old cache before new child hooks may subscribe to it, not after
  // rendering the destination's queries during the same commit.
  if (readyScope !== scope) return <PendingSkin />;
  if (family) return <FamilySetup onExit={() => {
    const ownTeam = context.teams.find(t => t.program_type === "adult");
    if (ownTeam) selection.setTeamSelection(ownTeam.id);
    navigate(ownTeam || !context.teams.length ? "/profile" : "/high-school/home");
  }} onTeamChange={id => {
    resetTeamRequestScope();
    selection.setTeamSelection(id);
    navigate("/high-school/home");
  }} />;
  if (context.actor.type === "adult" && selectedType === "team" && !team && context.teams.length) {
    return <RecoverTeam context={context} onChoose={changeTeam} />;
  }
  // Storage observers and route observers can update in separate commits.
  // A school URL must never mount the old adult providers during that handoff.
  // A stable stale/deep-linked adult selection offers explicit approved-team
  // recovery rather than loading excluded adult features in a school context.
  if (skin === "adult" && path.startsWith("/high-school/")) {
    return <RecoverTeam context={context} onChoose={changeTeam} onAccount={() => navigate("/profile")} />;
  }
  if (skin === "adult") return <TeamSkinFacts.Provider value={context}>{adult}</TeamSkinFacts.Provider>;
  if (!skin || !team) {
    // No canonical approved roles yet: preserve the existing onboarding flow,
    // not its draft's requested role as an operational privilege.
    if (!context.teams.length && context.actor.type === "adult") return <>{entry}</>;
    return <PendingSkin failed />;
  }
  return <TeamSkinFacts.Provider value={context}>
    <TeamSkinShell
      key={scope}
      context={context}
      activeTeam={team}
      onTeamChange={changeTeam}
      operational={context.actor.type === "adult" &&
        ["head_coach", "assistant_coach", "team_manager", "athletic_director"].includes(team.role)}
    />
  </TeamSkinFacts.Provider>;
}
function AdultDiscovery({ adult, entry }: { adult: ReactNode; entry: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { isActive: demo } = useDemo();
  const [path] = useLocation();
  const standalone = path === "/high-school/skins-preview" || path.startsWith("/under-18");
  const revision = useSyncExternalStore(parentVerificationSession.subscribe, parentVerificationSession.snapshot);
  const query = useQuery<SkinContext>({
    queryKey: ["team-skin-context", user?.id, revision],
    queryFn: async ({ signal }) => (await apiRequest("GET", "/api/high-school/skin-context", undefined, signal)).json(),
    enabled: !!user && !isLoading && !demo && !standalone,
    staleTime: 0, retry: false, refetchOnWindowFocus: true, refetchInterval: 30_000,
  });
  if (path === "/high-school/skins-preview") return <TeamSkinPreview />;
  if (path.startsWith("/under-18")) return <>{entry}</>;
  if (demo) return <>{adult}</>;
  if (isLoading) return <PendingSkin />;
  if (!user) return <>{entry}</>;
  if (query.isError) {
    if ((path === "/" || path === "/app") &&
      (query.error as { data?: { code?: string } }).data?.code === "PARENT_VERIFICATION_REQUIRED") return <>{adult}</>;
    if ((query.error as { data?: { code?: string } }).data?.code === "PARENT_VERIFICATION_REQUIRED") {
      return <ParentVerification />;
    }
    return <PendingSkin failed />;
  }
  if (!query.data || query.data.actor.id !== user.id) return <PendingSkin />;
  return <ResolvedSkinRuntime key={user.id} context={query.data} adult={adult} entry={entry} />;
}
function ChildDiscovery({ token, entry }: { token: string; entry: ReactNode }) {
  const query = useQuery<SkinContext>({
    queryKey: ["team-skin-context", "child", childSkinSession.revision()],
    queryFn: ({ signal }) => requestChildSession(token, "GET", "/api/high-school/child-device/skin-context", undefined, signal),
    staleTime: 0, retry: false, gcTime: 0, refetchOnWindowFocus: true, refetchInterval: 30_000,
  });
  if (query.isError) return <PendingSkin failed />;
  if (!query.data || query.data.actor.type !== "child") return <PendingSkin />;
  return <ResolvedSkinRuntime context={query.data} adult={null} entry={entry} />;
}
export function ProductionSchoolRuntime({children,entry}:{children:ReactNode;entry:ReactNode}) {
  return <AdultDiscovery adult={children} entry={entry}/>;
}
function IsolatedBoundary({ children, entry }: { children: ReactNode; entry: ReactNode }) {
  const token = useSyncExternalStore(childSkinSession.subscribe, childSkinSession.snapshot);
  return token ? <ChildDiscovery token={token} entry={entry} /> : <AdultDiscovery adult={children} entry={entry} />;
}
export function TeamSkinBoundary({ children, entry }: { children: ReactNode; entry: ReactNode }) {
  const childToken=useSyncExternalStore(childSkinSession.subscribe,childSkinSession.snapshot);
  const [path]=useLocation();
  if(import.meta.env.PROD&&childToken)return <ProductionChildSession token={childToken}/>;
  // Pairing is independent of any remembered shared provider login. It must
  // neither inherit parent authority nor ask the child for a parent email code.
  if(import.meta.env.PROD&&path.startsWith("/under-18"))return <>{entry}</>;
  if (import.meta.env.PROD) return <LiveFamilyBoundary entry={entry}>{children}</LiveFamilyBoundary>;
  if (!isDevParentClient) return <>{children}</>;
  return <IsolatedBoundary entry={entry}>{children}</IsolatedBoundary>;
}

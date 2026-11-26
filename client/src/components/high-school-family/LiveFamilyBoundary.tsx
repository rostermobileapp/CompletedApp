import { lazy, Suspense, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parentVerificationSession } from "@/lib/parentVerificationSession";
import { resetTeamRequestScope } from "@/lib/teamRequestScope";
import ParentVerification from "@/pages/ParentVerification";
import ResetPassword from "@/pages/ResetPassword";
import ForgotPassword from "@/pages/ForgotPassword";
import { FamilySetup } from "./FamilySetup";
import { useDashboardSelection } from "@/hooks/useDashboardSelection";
import { FamilyStaffReview } from "./FamilyStaffReview";
import { useProductionOnboardingAccess } from "@/hooks/useProductionOnboardingAccess";
import HighSchoolYouthOnboarding from "@/pages/HighSchoolYouthOnboarding";
import { ProductionOnboardingTest } from "@/components/high-school-onboarding/ProductionOnboardingTest";
import { FamilyDevices } from "./FamilyDevices";

const SchoolRuntime=lazy(()=>import("@/components/high-school-skins/TeamSkinBoundary")
  .then(module=>({default:module.ProductionSchoolRuntime})));

/** Keep the ordinary live Family boundary intact; load school onboarding and
 * dashboards only after the separate server-owned test gate accepts the user. */
export function LiveFamilyBoundary({ children, entry }: { children: ReactNode; entry: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [path, navigate] = useLocation();
  const selection = useDashboardSelection();
  const [exitError, setExitError] = useState("");
  const revision = useSyncExternalStore(parentVerificationSession.subscribe, parentVerificationSession.snapshot);
  const recovery = path === "/reset-password" || path === "/forgot-password";
  const status = useQuery<{ enrolled: boolean; verified: boolean }>({
    queryKey: ["live-parent-status", user?.id, revision],
    queryFn: async ({ signal }) => (await apiRequest("GET", "/api/high-school/parent-verification/status", undefined, signal)).json(),
    enabled: !!user && !isLoading && !recovery, staleTime: 0, retry: false,
    refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
  const protectedWithoutProof = status.data?.enrolled && !status.data.verified;
  const family = path === "/high-school/family";
  const verification = path === "/high-school/parent-verification";
  const review = path === "/high-school/family-review";
  const ready = !isLoading && !!user && !!status.data && !status.isError;
  const testRoute=/^\/high-school\/(?:testing|onboarding(?:\/approvals)?|home|schedule|roster|chat|more|payments|team)$/.test(path);
  const testAccess=useProductionOnboardingAccess(ready&&!protectedWithoutProof&&(testRoute||family)&&!recovery);
  const parentSurface = family || verification || review || testRoute || path.startsWith("/high-school/");
  const home = path === "/" || path === "/app";
  const loadAdultTeams = async () => (await apiRequest("GET", "/api/high-school/family/adult-team-ids")).json() as Promise<{ teamIds: string[] }>;
  const adultTeams = useQuery<{ teamIds: string[] }>({
    queryKey: ["family-adult-team-ids", user?.id],
    queryFn: loadAdultTeams,
    enabled: ready && status.data?.enrolled === true && !family && !verification && !review && !recovery && !testRoute && selection.selectedType === "team",
    staleTime: 0, retry: false,
  });
  const invalidHomeTeam = home && status.data?.enrolled && selection.selectedType === "team"
    && !!adultTeams.data && !adultTeams.data.teamIds.includes(selection.selectedId ?? "");
  useLayoutEffect(() => {
    // A remembered school-team selection must not trap Home in the recovery
    // page or mount that team's legacy dashboard. Keep valid adult selections.
    if (invalidHomeTeam) selection.clearSelection();
  }, [invalidHomeTeam, selection.clearSelection]);
  const scope = `${user?.id ?? "signed-out"}:${revision}:${recovery ? "recovery" : family ? "family" : review ? "review" : verification ? "verification" : ready ? "adult" : "locked"}:${status.data?.enrolled ? `${selection.selectedType}:${selection.selectedId}` : ""}`;
  const [cleanScope, setCleanScope] = useState("");
  useLayoutEffect(() => {
    // A family/authority transition unmounts all adult polling and sockets.
    resetTeamRequestScope();
    const predicate = (q: { queryKey: readonly unknown[] }) =>
      !["live-parent-status", "family-availability", "family-adult-team-ids","production-onboarding-access"].includes(String(q.queryKey[0]));
    void queryClient.cancelQueries({ predicate });
    queryClient.removeQueries({ predicate });
    setCleanScope(scope);
    return () => { resetTeamRequestScope(); };
  }, [scope]);
  if (cleanScope !== scope) return <main role="status" className="min-h-screen grid place-items-center">Checking account access…</main>;
  if (path === "/reset-password") return <ResetPassword />;
  if (path === "/forgot-password") return <ForgotPassword />;
  if (isLoading) return <main role="status" className="min-h-screen grid place-items-center">Checking account access…</main>;
  if (!user) return <>{entry}</>;
  if (status.isError) return parentSurface ? <ParentVerification unavailable /> : <>{children}</>;
  if (!status.data) return <main role="status" className="min-h-screen grid place-items-center">Checking account access…</main>;
  if ((parentSurface && protectedWithoutProof) || verification) return <ParentVerification enrolled={status.data.enrolled} verified={status.data.verified} />;
  const backToAdult = async () => {
    try {
      const { teamIds } = await loadAdultTeams();
      if (selection.selectedType==="team"&&teamIds.includes(selection.selectedId??"")) {
        // Preserve the parent's current, authorized adult team.
      } else if (teamIds[0]) selection.setTeamSelection(teamIds[0]); else selection.clearSelection();
      setExitError(""); navigate("/");
    } catch { setExitError("Adult team access could not be checked. Please retry."); }
  };
  if (family) return <>{exitError && <p role="alert">{exitError}</p>}
    <FamilySetup onExit={() => void backToAdult()} onTeamChange={() => navigate("/high-school/family")}
      devicePanel={testAccess.data?.enabled?<FamilyDevices actorId={user.id}/>:undefined}
      teamAccessAvailable={false} /></>;
  if (review) return <LiveFamilyRequests actorId={user.id} onExit={() => void backToAdult()} />;
  if(testRoute){
    if(testAccess.isLoading)return <main role="status">Checking production test access…</main>;
    if(!testAccess.data?.enabled)return <main className="p-6 text-center"><h1>This production test is not available for your account</h1><button onClick={()=>navigate("/profile")}>Back to my account</button></main>;
    if(path==="/high-school/testing"||path==="/high-school/onboarding/approvals")
      return <ProductionOnboardingTest actorId={user.id} approvals={path.endsWith("/approvals")}/>;
    if(path==="/high-school/onboarding")return <HighSchoolYouthOnboarding key={user.id}
      onAdult={()=>navigate("/profile")} onParent={()=>navigate("/high-school/family")}/>;
    return <Suspense fallback={<main role="status">Loading school team…</main>}>
      <SchoolRuntime entry={entry}>{children}</SchoolRuntime>
    </Suspense>;
  }
  if (status.data.enrolled && selection.selectedType === "team") {
    if (invalidHomeTeam) return <main role="status">Returning to Home…</main>;
    if (!adultTeams.data && !adultTeams.isError) return <main role="status">Checking adult team access…</main>;
    if (adultTeams.isError || !adultTeams.data?.teamIds.includes(selection.selectedId ?? "")) {
      return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Choose an adult team to continue</h1>
        <p>School dashboards are not enabled by family setup. No adult team features have been loaded for this selection.</p>
        {exitError && <p role="alert">{exitError}</p>}
        <button onClick={() => void backToAdult()}>Return to my adult account</button>
        <button onClick={() => navigate("/high-school/family")}>Family setup</button>
      </main>;
    }
  }
  if (path.startsWith("/high-school/")) return <main className="p-6 text-center">
    <h1>This school feature is not available yet</h1><button onClick={() => navigate("/high-school/family")}>Family setup</button>
  </main>;
  return <>{children}</>;
}

/** Existing approval UI only; no staff events, chat, billing or dashboards. */
function LiveFamilyRequests({ actorId, onExit }: { actorId: string; onExit: () => void }) {
  const [teamId, setTeamId] = useState("");
  const teams = useQuery<{ teams: { id: string; name: string }[] }>({
    queryKey: ["family-staff-teams", actorId],
    queryFn: async () => (await apiRequest("GET", "/api/high-school/family/staff/teams")).json(), retry: false,
  });
  return <main className="hsy family-setup" aria-label="Family request review">
    <div className="hsy-frame">
      <header className="family-topline family-review-topline">
        <div>
          <span className="family-brand">RosterHockey</span>
          <span className="family-brand-subtitle">Family request review</span>
        </div>
        <div className="family-top-actions">
          <button className="family-quiet-button" onClick={onExit}>Back to my account</button>
        </div>
      </header>
      <section className="hsy-content family-staff-review">
        <div className="family-staff-heading">
          <div>
            <span className="family-kicker">Team access</span>
            <h1>Review family requests</h1>
            <p>Choose a team to review its pending family requests.</p>
          </div>
        </div>
        {teams.isError ? <p className="family-review-state" role="alert">Your review access could not be checked. No request has been changed.</p>
          : !teams.data ? <p className="family-review-state" role="status">Checking team authority…</p> : !teams.data.teams.length
            ? <p className="family-review-state">No teams are available for you to review.</p>
            : <><div className="family-review-select">
              <label htmlFor="family-review-team">Team</label>
              <select id="family-review-team" value={teamId}
                onChange={event => setTeamId(event.target.value)}>
                <option value="">Choose a team</option>
                {teams.data.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </div>
            {teamId && <FamilyStaffReview key={teamId} actorId={actorId} teamId={teamId} onChanged={() => {}} />}
          </>}
      </section>
    </div>
  </main>;
}

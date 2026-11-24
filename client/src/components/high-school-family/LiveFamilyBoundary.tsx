import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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

/** Live family/parent verification only. No school dashboards, child discovery,
 * primary HS onboarding, or DEV preview is promoted by this boundary. */
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
  const ready = !isLoading && !!user && !!status.data && !status.isError && !protectedWithoutProof;
  const loadAdultTeams = async () => (await apiRequest("GET", "/api/high-school/family/adult-team-ids")).json() as Promise<{ teamIds: string[] }>;
  const adultTeams = useQuery<{ teamIds: string[] }>({
    queryKey: ["family-adult-team-ids", user?.id],
    queryFn: loadAdultTeams,
    enabled: ready && status.data?.enrolled === true && !family && !verification && !review && !recovery && selection.selectedType === "team",
    staleTime: 0, retry: false,
  });
  const scope = `${user?.id ?? "signed-out"}:${revision}:${recovery ? "recovery" : family ? "family" : review ? "review" : verification ? "verification" : ready ? "adult" : "locked"}:${status.data?.enrolled ? `${selection.selectedType}:${selection.selectedId}` : ""}`;
  const [cleanScope, setCleanScope] = useState("");
  useLayoutEffect(() => {
    // A family/authority transition unmounts all adult polling and sockets.
    resetTeamRequestScope();
    const predicate = (q: { queryKey: readonly unknown[] }) =>
      !["live-parent-status", "family-availability", "family-adult-team-ids"].includes(String(q.queryKey[0]));
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
  if (status.isError) return <ParentVerification unavailable />;
  if (!status.data) return <main role="status" className="min-h-screen grid place-items-center">Checking account access…</main>;
  if (protectedWithoutProof || verification) return <ParentVerification enrolled={status.data.enrolled} />;
  const backToAdult = async () => {
    try {
      const { teamIds } = await loadAdultTeams();
      if (teamIds[0]) selection.setTeamSelection(teamIds[0]); else selection.clearSelection();
      setExitError(""); navigate("/profile");
    } catch { setExitError("Adult team access could not be checked. Please retry."); }
  };
  if (family) return <>{exitError && <p role="alert">{exitError}</p>}
    <FamilySetup onExit={() => void backToAdult()} onTeamChange={() => navigate("/high-school/family")}
      teamAccessAvailable={false} /></>;
  if (review) return <LiveFamilyRequests actorId={user.id} onExit={() => void backToAdult()} />;
  if (status.data.enrolled && selection.selectedType === "team") {
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
  return <main className="onboarding-light min-h-screen p-6" aria-label="Family request review">
    <button onClick={onExit}>Back to my account</button>
    <h1 className="text-xl font-semibold my-4">Review family requests</h1>
    {teams.isError ? <p role="alert">Your review access could not be checked. No request has been changed.</p>
      : !teams.data ? <p role="status">Checking team authority…</p> : !teams.data.teams.length
        ? <p>No teams are available for you to review.</p>
        : <><label htmlFor="family-review-team">Team</label>
          <select id="family-review-team" className="border rounded-lg p-3 mx-3" value={teamId}
            onChange={event => setTeamId(event.target.value)}>
            <option value="">Choose a team</option>
            {teams.data.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          {teamId && <FamilyStaffReview key={teamId} actorId={actorId} teamId={teamId} onChanged={() => {}} />}
        </>}
  </main>;
}

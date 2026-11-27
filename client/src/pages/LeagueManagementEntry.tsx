import React, { Suspense, lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import SchoolLeagueManagement from "@/components/league-management/SchoolLeagueManagement";

const AdultLeagueManagement = lazy(() => import("@/pages/LeagueManagement"));

type LeagueSummary = { id: string; name: string; leagueType?: string; type?: string };
type TestAccess = { enabled: boolean };

function EntryState({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return <main className="min-h-[70dvh] bg-background px-5 py-16 text-foreground">
    <section className="mx-auto max-w-xl rounded-xl bg-card hairline elev-rest p-6">
      <p className="text-sm text-muted-foreground">League management</p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
      {retry && <button onClick={retry} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">Retry</button>}
    </section>
  </main>;
}

export default function LeagueManagementEntry() {
  const params = useParams<{ leagueId?: string }>();
  const leagueId = params.leagueId || new URLSearchParams(window.location.search).get("leagueId") || "";
  const leagueQuery = useQuery<LeagueSummary>({
    queryKey: ["/api/leagues", leagueId],
    queryFn: async ({ signal }) => (await apiRequest("GET", `/api/leagues/${encodeURIComponent(leagueId)}`, undefined, signal)).json(),
    enabled: !!leagueId,
    retry: false,
  });
  const isSchool = ["high_school", "youth"].includes(leagueQuery.data?.leagueType || leagueQuery.data?.type || "");
  const accessQuery = useQuery<TestAccess>({
    queryKey: ["/api/high-school/test-access"],
    queryFn: async ({ signal }) => (await apiRequest("GET", "/api/high-school/test-access", undefined, signal)).json(),
    enabled: isSchool,
    retry: false,
  });

  if (!leagueId) return <Suspense fallback={<EntryState title="Loading leagues" detail="Opening league management…" />}><AdultLeagueManagement /></Suspense>;
  if (leagueQuery.isLoading) return <main className="min-h-[70dvh] bg-background p-6"><div className="mx-auto max-w-5xl animate-pulse space-y-5" role="status" aria-label="Loading league"><div className="h-9 w-64 rounded-lg bg-muted" /><div className="h-48 rounded-xl bg-muted" /><div className="h-56 rounded-xl bg-muted" /></div></main>;
  if (leagueQuery.isError || !leagueQuery.data) return <EntryState title="League unavailable" detail="We couldn’t load this league. Check your connection or access, then try again." retry={() => void leagueQuery.refetch()} />;
  if (isSchool) {
    if (accessQuery.isLoading) return <main className="min-h-[70dvh] bg-background p-6"><div className="mx-auto max-w-5xl animate-pulse space-y-5" role="status" aria-label="Preparing league management"><div className="h-10 w-72 rounded-lg bg-muted" /><div className="h-72 rounded-xl bg-muted" /></div></main>;
    if (accessQuery.isError || !accessQuery.data?.enabled) return <EntryState title="School league tools unavailable" detail="School league management isn’t available for your account right now. Please try again later." retry={() => void accessQuery.refetch()} />;
    return <SchoolLeagueManagement key={leagueId} leagueId={leagueId} />;
  }
  return <Suspense fallback={<EntryState title="Opening league office" detail="Loading your league workspace…" />}>
    <AdultLeagueManagement />
  </Suspense>;
}

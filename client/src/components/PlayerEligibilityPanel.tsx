import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, LockKeyhole, RefreshCw, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { SchoolEligibilityWorkspace, SchoolPlayerEligibility } from "@shared/schoolPlayerEligibility";

type Props = { mode: "league" | "team"; id: string };
type Scope = Props["mode"];
type EligibilityInput = { restricted: boolean; reason: string; version: number };
const eligibilityPrefix = ["school-player-eligibility"] as const;
const base = (mode: Scope, id: string) => mode === "league"
  ? `/api/high-school/leagues/${encodeURIComponent(id)}/management/eligibility`
  : `/api/high-school/staff/teams/${encodeURIComponent(id)}/eligibility`;
const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function messageFor(error: unknown) {
  const value = error as { message?: string; data?: { code?: string; message?: string } };
  const code = value?.data?.code;
  if (code === "ELIGIBILITY_CHANGED_REFRESH_REQUIRED") {
    return "This eligibility record changed elsewhere. Refresh the latest status before saving again.";
  }
  if (code === "PLAYER_ELIGIBILITY_UPDATE_REQUIRED") return "Playing eligibility needs the approved database update before it can be managed.";
  return value?.data?.message || value?.message || "Eligibility could not be loaded. Check your connection and retry.";
}

export function PlayerEligibilityPanel({ mode, id }: Props) {
  const queryClient = useQueryClient();
  const queryKey = [...eligibilityPrefix, mode, id] as const;
  const endpoint = base(mode, id);
  const eligibility = useQuery<SchoolEligibilityWorkspace>({
    queryKey,
    queryFn: async ({ signal }) => (await apiRequest("GET", endpoint, undefined, signal)).json(),
    enabled: !!id,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState("");
  const save = useMutation({
    gcTime: 0,
    mutationFn: async ({ player, restricted, reason }: { player: SchoolPlayerEligibility; restricted: boolean; reason: string }) => {
      const version = mode === "league" ? player.leagueVersion : player.teamVersion;
      const path = mode === "league"
        ? `${endpoint}/${encodeURIComponent(player.teamId)}/${encodeURIComponent(player.playerId)}`
        : `${endpoint}/${encodeURIComponent(player.playerId)}`;
      const body: EligibilityInput = { restricted, reason: restricted ? reason.trim() : "", version };
      return (await apiRequest("POST", path, body)).json();
    },
    onSuccess: async (_result, variables) => {
      setConflict("");
      setReasons(current => ({ ...current, [variables.player.playerId]: "" }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eligibilityPrefix }),
        queryClient.invalidateQueries({ queryKey: ["hs-staff"] }),
      ]);
    },
    onError: error => {
      const message = messageFor(error);
      if (message.toLowerCase().includes("changed elsewhere") || message.toLowerCase().includes("version")) setConflict(message);
    },
  });

  if (eligibility.isPending) return <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Player eligibility loading">
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading player eligibility">
      <div className="h-6 w-48 rounded bg-muted" /><div className="h-14 rounded-lg bg-muted" /><div className="h-24 rounded-lg bg-muted" />
    </div>
  </section>;

  if (eligibility.isError || !eligibility.data) return <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
    <div className="flex items-start gap-3" role="alert"><AlertCircle className="mt-0.5 shrink-0 text-destructive" size={18} /><div className="min-w-0 flex-1">
      <h2 className="font-semibold">Player eligibility unavailable</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{messageFor(eligibility.error)}</p>
      <button className={`${buttonClass} mt-4`} type="button" onClick={() => void eligibility.refetch()}><RefreshCw size={15} /> Retry</button>
    </div></div>
  </section>;

  const workspace = eligibility.data;
  const scopeName = workspace.scope === "league" ? "League" : "Team";
  return <section className="rounded-xl border border-border bg-card p-4 sm:p-6" aria-labelledby={`eligibility-title-${mode}-${id}`}>
    <header className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-start">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Playing status · {scopeName} scope</p>
        <h2 id={`eligibility-title-${mode}-${id}`} className="mt-1 text-xl font-semibold">Player eligibility</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Eligibility only controls playing status. It does not change roster membership, consent, device access, or parent-child chat rights.</p>
      </div>
      <button className={buttonClass} type="button" onClick={() => void eligibility.refetch()} disabled={eligibility.isFetching} aria-label="Refresh player eligibility">
        <RefreshCw size={15} className={eligibility.isFetching ? "animate-spin" : ""} />{eligibility.isFetching ? "Refreshing" : "Refresh"}
      </button>
    </header>
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-muted p-3 text-sm leading-5">
      <LockKeyhole size={17} className="mt-0.5 shrink-0 text-primary" />
      <p><strong>League restrictions take priority.</strong> A team coach cannot clear a league restriction. Clearing a restriction at one level never clears the other.</p>
    </div>
    {conflict && <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert">
      <AlertCircle size={17} className="mt-0.5 shrink-0 text-destructive" /><div className="flex-1"><p className="font-semibold">Refresh required before saving</p><p className="mt-1">{conflict}</p></div>
      <button className={buttonClass} type="button" onClick={() => { setConflict(""); void eligibility.refetch(); }}>Refresh</button>
    </div>}
    {!workspace.players.length ? <div className="mt-5 rounded-lg border border-dashed border-border bg-background p-6 text-center">
      <ShieldAlert className="mx-auto text-muted-foreground" size={21} /><p className="mt-2 font-semibold">No eligible roster records</p><p className="mt-1 text-sm text-muted-foreground">Approved players will appear here when they are on this roster.</p>
    </div> : <div className="mt-4 space-y-3">
      {workspace.players.map(player => {
        const leagueRestricted = player.leagueRestricted;
        const teamRestricted = player.teamRestricted;
        const effectiveEligible = player.eligible;
        const currentRestricted = workspace.scope === "league" ? leagueRestricted : teamRestricted;
        const currentReason = workspace.scope === "league" ? player.leagueReason : player.teamReason;
        const currentVersion = workspace.scope === "league" ? player.leagueVersion : player.teamVersion;
        const reason = reasons[player.playerId] ?? "";
        const pending = save.isPending && save.variables?.player.playerId === player.playerId;
        return <article key={player.playerId} className="rounded-xl border border-border bg-background p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{player.firstName} {player.lastName}</h3>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${effectiveEligible ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {effectiveEligible ? "Eligible" : "Ineligible"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{player.teamName}{player.programName ? ` · ${player.programName}` : ""}</p>
            </div>
            <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">Effective playing status</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className={`rounded-lg border p-3 ${leagueRestricted ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">League restriction</p>
              <p className={`mt-1 text-sm font-medium ${leagueRestricted ? "text-destructive" : "text-muted-foreground"}`}>{leagueRestricted ? "Restricted" : "No restriction"}</p>
              {leagueRestricted && <p className="mt-1 break-words text-sm text-muted-foreground">{player.leagueReason}</p>}
            </div>
            <div className={`rounded-lg border p-3 ${teamRestricted ? "border-amber-600/30 bg-amber-500/5" : "border-border bg-card"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">Team restriction</p>
              <p className={`mt-1 text-sm font-medium ${teamRestricted ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}>{teamRestricted ? "Restricted" : "No restriction"}</p>
              {teamRestricted && <p className="mt-1 break-words text-sm text-muted-foreground">{player.teamReason}</p>}
            </div>
          </div>
          {workspace.canEdit ? <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-sm font-semibold">{scopeName} restriction</p>
            {currentRestricted ? <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">Current reason: {currentReason || "No reason supplied"}</p>
              <button className={buttonClass} type="button" disabled={pending || !!conflict} onClick={() => save.mutate({ player, restricted: false, reason: "" })}>Clear {scopeName.toLowerCase()} restriction</button>
            </div> : <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={event => {
              event.preventDefault();
              if (!reason.trim() || !Number.isInteger(currentVersion) || conflict) return;
              save.mutate({ player, restricted: true, reason });
            }}>
              <label className="sr-only" htmlFor={`eligibility-reason-${mode}-${player.playerId}`}>Reason for restricting {player.firstName} {player.lastName}</label>
              <textarea id={`eligibility-reason-${mode}-${player.playerId}`} className={inputClass} value={reason} onChange={event => setReasons(current => ({ ...current, [player.playerId]: event.target.value.slice(0, 500) }))} maxLength={500} rows={2} placeholder="Reason for restriction" disabled={pending || !!conflict} />
              <button className={`${primaryClass} sm:self-start`} type="submit" disabled={pending || !!conflict || !reason.trim()}>{pending ? "Saving" : `Restrict at ${scopeName.toLowerCase()} level`}</button>
            </form>}
            {save.isError && save.variables?.player.playerId === player.playerId && !conflict && <p className="mt-2 text-sm text-destructive" role="alert">{messageFor(save.error)}</p>}
            {save.isSuccess && save.variables?.player.playerId === player.playerId && <p className="mt-2 flex items-center gap-1.5 text-sm text-success" role="status"><CheckCircle2 size={15} /> Eligibility updated.</p>}
          </div> : <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">View only — eligibility changes are limited to the league owner or this team’s head coach and assistants.</p>}
        </article>;
      })}
    </div>}
  </section>;
}

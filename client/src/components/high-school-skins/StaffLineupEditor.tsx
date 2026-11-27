import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { LineupEntry, StaffEvent, StaffPlayer, StaffWorkspace } from "@shared/highSchoolStaff";
import type { SchoolEligibilityWorkspace } from "@shared/schoolPlayerEligibility";

type Request = { method: string; path: string; body?: unknown; refreshContext?: boolean };
type Props = {
  teamId: string;
  event: StaffEvent;
  data: StaffWorkspace;
  staffKey: readonly unknown[];
  pending: boolean;
  request: (request: Request) => Promise<unknown>;
  close: () => void;
  onSuccess: (value: { type: "success" | "error"; text: string }) => void;
};
const endpoint = (teamId: string) => `/api/high-school/staff/teams/${encodeURIComponent(teamId)}`;
const playerEligible = (player: StaffPlayer) => player.type === "player" && player.guardianLinked && player.consented;
function errorText(error: unknown) {
  const payload = (error as { data?: { code?: string; message?: string; errors?: { field?: string; message: string }[] } })?.data;
  if (payload?.code === "LINEUP_REQUIRES_APPROVED_PLAYER_GUARDIAN_AND_CONSENT") return "Only approved players with a linked guardian and recorded consent can be saved in the lineup.";
  if (payload?.code === "PLAYER_INELIGIBLE") return "A player's eligibility changed. Restricted players cannot be dressed. The latest status is being refreshed.";
  if (payload?.code === "PLAYER_ELIGIBILITY_UPDATE_REQUIRED") return "The playing-eligibility database update is required before this lineup can be saved.";
  if (payload?.errors?.length) return payload.errors.map(item => item.field ? `${item.field}: ${item.message}` : item.message).join(" · ");
  return payload?.message || (error as Error)?.message || "The lineup could not be loaded. Retry to continue.";
}

export function StaffLineupEditor({ teamId, event, data, staffKey, pending, request, close, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [states, setStates] = useState<Record<string, "dress" | "scratch">>({});
  const [saveError, setSaveError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const query = useQuery<{ entries: LineupEntry[] }>({
    queryKey: [...staffKey, "lineup", event.id],
    queryFn: async ({ signal }) => (await apiRequest("GET", `${endpoint(teamId)}/events/${encodeURIComponent(event.id)}/lineup`, undefined, signal)).json(),
    gcTime: 0, retry: false, staleTime: 0,
  });
  const eligibility = useQuery<SchoolEligibilityWorkspace>({
    queryKey: ["school-player-eligibility", "team", teamId],
    queryFn: async ({ signal }) => (await apiRequest("GET", `${endpoint(teamId)}/eligibility`, undefined, signal)).json(),
    enabled: !!teamId,
    gcTime: 0, retry: false, staleTime: 0,
  });
  const initializedEvent = useRef<string | null>(null);
  const dataRef = useRef(query.data);
  dataRef.current = query.data;
  useEffect(() => {
    const current = dataRef.current;
    if (!current || initializedEvent.current === event.id) return;
    initializedEvent.current = event.id;
    setStates(Object.fromEntries(current.entries.map(entry => [entry.playerId, entry.state])));
  }, [query.dataUpdatedAt, event.id]);

  const roster = data.roster.filter(player => player.type === "player");
  const eligibilityByPlayer = new Map((eligibility.data?.players ?? []).map(player => [player.playerId, player]));
  const isPlayingEligible = (playerId: string) => eligibilityByPlayer.get(playerId)?.eligible === true;
  const save = async () => {
    setSaveError("");
    if (eligibility.isError || !eligibility.data) {
      setSaveError("Player eligibility must load successfully before the lineup can be saved.");
      return;
    }
    const eligibleRoster = roster.filter(playerEligible);
    const entries = eligibleRoster.map(player => ({
      playerId: player.id,
      state: isPlayingEligible(player.id) ? (states[player.id] ?? "scratch" as const) : "scratch" as const,
    }));
    try {
      await request({ method: "PUT", path: `${endpoint(teamId)}/events/${encodeURIComponent(event.id)}/lineup`, body: { entries } });
      if (!mounted.current) return;
      await queryClient.invalidateQueries({ queryKey: [...staffKey, "lineup", event.id] });
      onSuccess({ type: "success", text: `Lineup saved with ${entries.length} approved roster players. Ineligible players are marked scratch.` });
      close();
    } catch (error) {
      if (mounted.current) setSaveError(errorText(error));
      void eligibility.refetch();
      void query.refetch();
    }
  };
  const stateControls = (playerId: string) => {
    const isEligible = isPlayingEligible(playerId);
    const state = isEligible ? (states[playerId] ?? "scratch") : "scratch";
    return <div className="staff-segment">
      <button type="button" disabled={pending || !isEligible} aria-pressed={state === "dress"} onClick={() => setStates({ ...states, [playerId]: "dress" })}>Dress</button>
      <button type="button" disabled={pending} aria-pressed={state === "scratch"} onClick={() => setStates({ ...states, [playerId]: "scratch" })}>Scratch</button>
    </div>;
  };
  return <>
    <p className="staff-muted">Only approved players on your own roster with a linked guardian and recorded consent can be included. Ineligible players may be scratched, but cannot be dressed.</p>
    {query.isPending || eligibility.isPending ? <div className="staff-loading" aria-label="Loading lineup and player eligibility"><div className="staff-skeleton" /><div className="staff-skeleton" /></div>
      : query.isError ? <div className="staff-alert error" role="alert"><AlertCircle size={15} /><span>{errorText(query.error)}</span><button type="button" className="staff-btn" onClick={() => void query.refetch()}>Retry</button></div>
      : eligibility.isError ? <div className="staff-alert error" role="alert"><AlertCircle size={15} /><span>Player eligibility could not be checked. Refresh it before continuing.</span><button type="button" className="staff-btn" onClick={() => void eligibility.refetch()}>Retry eligibility</button></div>
      : <>
        <div className="staff-card-head" style={{ marginTop: 15 }}><div><h3>Own roster</h3><p>Eligible players are saved as dress or scratch.</p></div><span className="staff-badge">{roster.length} players</span></div>
        {roster.length ? <div className="staff-list">{roster.map(player => {
          const canEnter = playerEligible(player);
          const status = eligibilityByPlayer.get(player.id);
          return <div className="staff-row" key={player.id}>
            <span className="staff-row-main"><strong>{player.number ? `#${player.number} ` : ""}{player.firstName} {player.lastName}</strong><span>{player.position || "Position not set"} · {data.team.name}</span>
              {canEnter && status && <span className={`staff-badge ${status.eligible ? "" : "warn"}`} style={{ marginTop: 5 }}>
                {status.eligible ? "Eligible" : "Ineligible"}
                {!status.eligible && [status.leagueRestricted && `League restriction: ${status.leagueReason}`, status.teamRestricted && `Team restriction: ${status.teamReason}`].filter(Boolean).map((item, index) => <span key={index}> · {item}</span>)}
              </span>}
              {canEnter && !status && <span className="staff-badge warn" style={{ marginTop: 5 }}>Eligibility status unavailable · Dress is disabled</span>}
              {!canEnter && <span className="staff-badge warn" style={{ marginTop: 5 }}>Not eligible for lineup: {!player.guardianLinked ? "guardian link missing" : !player.consented ? "consent not recorded" : "not an approved active player"}</span>}
            </span>
            {canEnter && stateControls(player.id)}
          </div>;
        })}</div> : <div className="staff-empty">No active players on this roster.</div>}
      </>}
    {saveError && <div className="staff-alert error" role="alert"><AlertCircle size={15} />{saveError}</div>}
    <div className="staff-actions" style={{ marginTop: 16 }}>
      <button className="staff-btn-primary" type="button" disabled={pending || query.isPending || query.isError || eligibility.isPending || eligibility.isError || !eligibility.data} onClick={() => void save()}><CheckCircle2 size={14} /> Save lineup</button>
      <button className="staff-btn" type="button" onClick={close}>Cancel</button>
    </div>
  </>;
}

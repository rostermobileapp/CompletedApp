import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { LineupEntry, StaffEvent, StaffPlayer, StaffWorkspace } from "@shared/highSchoolStaff";

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
function eligibilityMessage(player: StaffPlayer) {
  return [
    !player.guardianLinked ? "guardian link missing" : "",
    !player.consented ? "consent not recorded" : "",
    player.type !== "player" ? "not an approved active player" : "",
  ].filter(Boolean).join(" · ");
}
function errorText(error: unknown) {
  const payload = (error as { data?: { code?: string; message?: string; errors?: { field?: string; message: string }[] } })?.data;
  if (payload?.code === "LINEUP_REQUIRES_APPROVED_PLAYER_GUARDIAN_AND_CONSENT") return "Only approved players with a linked guardian and recorded consent can be saved in the lineup.";
  if (payload?.errors?.length) return payload.errors.map(item => item.field ? `${item.field}: ${item.message}` : item.message).join(" · ");
  return payload?.message || (error as Error)?.message || "The lineup could not be loaded. Retry to continue.";
}

export function StaffLineupEditor({ teamId, event, data, staffKey, pending, request, close, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [states, setStates] = useState<Record<string, "dress" | "scratch">>({});
  const [selectedCallups, setSelectedCallups] = useState<Record<string, boolean>>({});
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
  const initializedEvent = useRef<string | null>(null);
  const dataRef = useRef(query.data);
  dataRef.current = query.data;
  useEffect(() => {
    const current = dataRef.current;
    if (!current || initializedEvent.current === event.id) return;
    initializedEvent.current = event.id;
    setStates(Object.fromEntries(current.entries.map(entry => [entry.playerId, entry.state])));
    setSelectedCallups(Object.fromEntries(current.entries.filter(entry => entry.callup).map(entry => [entry.playerId, true])));
  }, [query.dataUpdatedAt, event.id]);

  const roster = data.roster.filter(player => player.type === "player");
  const candidates = data.callupCandidates;
  const save = async () => {
    setSaveError("");
    const eligibleRoster = roster.filter(playerEligible);
    const entries = [
      ...eligibleRoster.map(player => ({ playerId: player.id, state: states[player.id] ?? "scratch" as const })),
      ...candidates.filter(player => selectedCallups[player.id] && playerEligible(player))
        .map(player => ({ playerId: player.id, state: states[player.id] ?? "scratch" as const })),
    ];
    try {
      await request({ method: "PUT", path: `${endpoint(teamId)}/events/${encodeURIComponent(event.id)}/lineup`, body: { entries } });
      if (!mounted.current) return;
      await queryClient.invalidateQueries({ queryKey: [...staffKey, "lineup", event.id] });
      const callupCount = entries.length - eligibleRoster.length;
      onSuccess({ type: "success", text: `Lineup saved with ${eligibleRoster.length} eligible roster players and ${callupCount} selected call-up${callupCount === 1 ? "" : "s"}.` });
      close();
    } catch (error) {
      if (mounted.current) setSaveError(errorText(error));
    }
  };
  const stateControls = (playerId: string) => {
    const state = states[playerId] ?? "scratch";
    return <div className="staff-segment">
      <button type="button" disabled={pending} aria-pressed={state === "dress"} onClick={() => setStates({ ...states, [playerId]: "dress" })}>Dress</button>
      <button type="button" disabled={pending} aria-pressed={state === "scratch"} onClick={() => setStates({ ...states, [playerId]: "scratch" })}>Scratch</button>
    </div>;
  };
  return <>
    <p className="staff-muted">Your eligible roster is included by default. Select each eligible program call-up explicitly. Players missing a guardian link or consent remain visible but are never sent with a lineup save.</p>
    {query.isPending ? <div className="staff-loading"><div className="staff-skeleton" /><div className="staff-skeleton" /></div>
      : query.isError ? <div className="staff-alert error" role="alert"><AlertCircle size={15} /><span>{errorText(query.error)}</span><button type="button" className="staff-btn" onClick={() => void query.refetch()}>Retry</button></div>
      : <>
        <div className="staff-card-head" style={{ marginTop: 15 }}><div><h3>Own roster</h3><p>Eligible players are saved as dress or scratch.</p></div><span className="staff-badge">{roster.length} players</span></div>
        {roster.length ? <div className="staff-list">{roster.map(player => {
          const canEnter = playerEligible(player);
          return <div className="staff-row" key={player.id}>
            <span className="staff-row-main"><strong>{player.number ? `#${player.number} ` : ""}{player.firstName} {player.lastName}</strong><span>{player.position || "Position not set"} · {data.team.name}</span>
              {!canEnter && <span className="staff-badge warn" style={{ marginTop: 5 }}>Not sent: {eligibilityMessage(player)}</span>}
            </span>
            {canEnter && stateControls(player.id)}
          </div>;
        })}</div> : <div className="staff-empty">No active players on this roster.</div>}
        <div className="staff-divider" />
        <div className="staff-card-head"><div><h3>Program call-ups</h3><p>Nothing is added unless selected here.</p></div><span className="staff-badge">{Object.values(selectedCallups).filter(Boolean).length} selected</span></div>
        {candidates.length ? <div className="staff-list">{candidates.map(player => {
          const canEnter = playerEligible(player);
          const selected = canEnter && selectedCallups[player.id] === true;
          return <div className="staff-row" key={player.id}>
            <label className="staff-check" style={{ flex: 1, minWidth: 0, alignItems: "flex-start" }}>
              <input type="checkbox" checked={selected} disabled={pending || !canEnter} onChange={e => setSelectedCallups({ ...selectedCallups, [player.id]: e.target.checked })} />
              <span className="staff-row-main"><strong>{player.firstName} {player.lastName}</strong><span>{player.number ? `#${player.number} · ` : ""}{player.position || "Position not set"} · {player.teamName}</span>
                {!canEnter && <span className="staff-badge warn" style={{ marginTop: 5 }}>Unavailable: {eligibilityMessage(player)} · not sent</span>}
              </span>
            </label>
            {selected && stateControls(player.id)}
          </div>;
        })}</div> : <div className="staff-empty">No program call-up candidates are available.</div>}
      </>}
    {saveError && <div className="staff-alert error" role="alert"><AlertCircle size={15} />{saveError}</div>}
    <div className="staff-actions" style={{ marginTop: 16 }}>
      <button className="staff-btn-primary" type="button" disabled={pending || query.isPending || query.isError} onClick={() => void save()}><CheckCircle2 size={14} /> Save lineup</button>
      <button className="staff-btn" type="button" onClick={close}>Cancel</button>
    </div>
  </>;
}

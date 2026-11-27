import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertCircle, ArrowUpRight, CheckCircle2, ChevronRight, CircleHelp,
  ClipboardList, FileUp, Flag, MapPin, MessageSquareWarning, Pencil, Plus,
  RefreshCw, Send, ShieldCheck, Trash2, UsersRound, X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type {
  ImportPreview, LineupEntry, StaffEvent, StaffEventInput, StaffMessage,
  StaffPlayer, StaffRole, StaffWorkspace,
} from "@shared/highSchoolStaff";
import { ROLE_LABELS } from "@shared/teamSkin";
import { StaffLineupEditor } from "./StaffLineupEditor";
import "./staff-operations.css";
import { FamilyStaffReview } from "@/components/high-school-family/FamilyStaffReview";
import { ScopedHomeFeed, ScopedHomeNotice } from "@/components/dashboard/ScopedAccountHome";
import { PlayerEligibilityPanel } from "@/components/PlayerEligibilityPanel";

type Props = { actorId: string; teamId: string; role: StaffRole; onContextRefresh: () => void };
type Request = { method: string; path: string; body?: unknown; refreshContext?: boolean };
type EventDraft = StaffEventInput & { id?: string; version?: number };
const base = (teamId: string) => `/api/high-school/staff/teams/${encodeURIComponent(teamId)}`;
const knownErrors: Record<string, string> = {
  STAFF_TEAM_FORBIDDEN: "Your approved staff membership does not allow access to this team’s operations.",
  STAFF_MANAGEMENT_FORBIDDEN: "Only staff with team-management authority can make this change.",
  PROGRAM_ACCESS_FORBIDDEN: "This action is outside your authorized school program.",
  EVENT_CHANGED_REFRESH_REQUIRED: "This schedule item changed since it was opened. Close it and reload the latest version.",
  FINAL_EVENT_LOCKED: "A final game report locks this event from schedule changes.",
  FINAL_REPORT_AVAILABLE_TWO_HOURS_AFTER_START: "Final reports open two hours after the scheduled start time.",
  LINEUP_REQUIRES_APPROVED_PLAYER_GUARDIAN_AND_CONSENT: "Lineup entries require an approved player with a linked guardian and recorded consent.",
  EXISTING_PAYMENT_ENTITLEMENT_REQUIRED: "Payment requests require an existing account entitlement. No staff role grants billing access.",
  PAYMENT_RECIPIENT_FORBIDDEN: "You are not authorized to update this payment recipient.",
  PAYMENT_CONFIRMATION_REQUIRES_CREATOR_AND_RECORDED_PAYMENT: "Only the request creator can confirm, and only after payment is recorded.",
  DEV_STAFF_INSTALL_REQUIRED: "Staff operations are not installed for this development environment.",
  INVALID_STAFF_INPUT: "Some details need attention. Review the highlighted fields and try again.",
  STAFF_OPERATIONS_UNAVAILABLE: "Staff operations are temporarily unavailable. Please retry shortly.",
  REVOCATION_FORBIDDEN: "Your role cannot revoke this staff membership.",
  FORBIDDEN: "Your current team role does not allow this action.",
  TEAM_ACCESS_REVOKED: "Access to this team has changed. Refresh the team space.",
  TEAM_NOT_FOUND: "This team is no longer available.",
  VERSION_CONFLICT: "This item changed elsewhere. Reload it before saving again.",
  EVENT_VERSION_CONFLICT: "This schedule item changed elsewhere. Review the latest version and try again.",
  IMPORT_INVALID: "The import contains errors. Fix the listed rows before committing.",
  REPORT_NOT_AVAILABLE: "The final report is not available yet. It can be submitted after the game window opens.",
  PAYMENT_NOT_ENTITLED: "Payment requests are not available for this team account.",
  PAYMENT_CREATION_NOT_ALLOWED: "Your team does not have permission to create this request.",
  ROOM_ACCESS_DENIED: "You no longer have access to this conversation.",
  MESSAGE_NOT_FOUND: "This message is no longer available.",
  APPROVAL_NOT_ALLOWED: "This staff request cannot be approved from your current role.",
  SELF_REVOCATION_DENIED: "You cannot revoke your own team access.",
  INVALID_INPUT: "Some details need attention. Check the fields and try again.",
};
function errorMessage(error: unknown) {
  const payload = (error as { data?: { code?: string; message?: string; errors?: { field?: string; message: string }[] }; message?: string })?.data;
  const code = payload?.code;
  const serverMessage = payload?.errors?.length
    ? payload.errors.map(item => item.field ? `${item.field}: ${item.message}` : item.message).join(" · ")
    : payload?.message;
  if (payload?.errors?.length) return serverMessage!;
  if (code && knownErrors[code]) return knownErrors[code];
  if (serverMessage) return serverMessage;
  if (code) return `This request could not be completed (${code.toLowerCase().replaceAll("_", " ")}). Please review the details and try again.`;
  return (error as Error)?.message || "Something went wrong. Please try again.";
}
function dateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, options ?? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function classForYear(year: number) {
  const current = new Date().getFullYear();
  const distance = year - current;
  return ({ 0: "Senior", 1: "Junior", 2: "Sophomore", 3: "Freshman" } as Record<number, string>)[distance] ?? `Class of ${year}`;
}
function useMountedRef() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}
function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="staff-alert error" role="alert"><AlertCircle size={17} /><span>{errorMessage(error)}</span><button className="staff-btn" type="button" onClick={retry}>Retry</button></div>;
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="staff-empty">{children}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="staff-field"><span>{label}</span>{children}</label>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="staff-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="staff-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="staff-modal-head"><h3>{title}</h3><button className="staff-icon-btn" type="button" aria-label="Close" onClick={close}><X size={17} /></button></div>
      {children}
    </section>
  </div>;
}

export function StaffOperations({ actorId, teamId, role, onContextRefresh }: Props) {
  const [path, navigate] = useLocation();
  const queryClient = useQueryClient();
  const page = (path.split("/").pop() || "home").toLowerCase();
  const activePage = ["home", "schedule", "roster", "chat", "more"].includes(page) ? page : "home";
  const staffKey = useMemo(() => ["hs-staff", actorId, teamId] as const, [actorId, teamId]);
  const workspaceKey = useMemo(() => [...staffKey, "workspace"] as const, [staffKey]);
  const workspace = useQuery<StaffWorkspace>({
    queryKey: workspaceKey,
    queryFn: async ({ signal }) => (await apiRequest("GET", `${base(teamId)}/`, undefined, signal)).json(),
    gcTime: 0, retry: false, staleTime: 0,
  });
  const homeNextEventId = workspace.data?.events
    .filter(event => event.status === "scheduled")
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .find(event => Date.parse(event.startsAt) >= Date.now())?.id;
  const homeLineupQuery = useQuery<{ entries: LineupEntry[] }>({
    queryKey: [...staffKey, "lineup", homeNextEventId ?? "none"],
    queryFn: async ({ signal }) => (await apiRequest("GET", `${base(teamId)}/events/${encodeURIComponent(homeNextEventId!)}/lineup`, undefined, signal)).json(),
    enabled: activePage === "home" && !!homeNextEventId, gcTime: 0, retry: false, staleTime: 0,
  });
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [modal, modalSetter] = useState<ModalState | null>(null);
  const [pendingNotifications, setPendingNotifications] = useState(0);
  const [homeNotice, setHomeNotice] = useState("");
  const [homeEvent, setHomeEvent] = useState<StaffEvent>();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const pending = (workspace.data as (StaffWorkspace & { notification?: { pending?: number } }) | undefined)?.notification?.pending;
    if (typeof pending === "number") setPendingNotifications(pending);
  }, [workspace.dataUpdatedAt]);
  const runRequest = useMutation({
    mutationFn: async ({ method, path: requestPath, body }: Request) => (await apiRequest(method, requestPath, body)).json() as Promise<unknown>,
    onSuccess: async (result, variables) => {
      const notification = (result as { notification?: { pending?: number } } | null)?.notification;
      if (!mounted.current) return;
      if (typeof notification?.pending === "number") {
        setPendingNotifications(notification.pending);
        setNotice({ type: "success", text: notification.pending > 0
          ? `Saved. ${notification.pending} schedule notification${notification.pending === 1 ? " is" : "s are"} waiting for the development transport. Retry delivery in More.`
          : "Saved. Team information is up to date." });
      } else {
        setNotice({ type: "success", text: "Saved. Team information is up to date." });
      }
      await queryClient.invalidateQueries({ queryKey: workspaceKey });
      if (mounted.current && variables.refreshContext) onContextRefresh();
    },
    onError: error => { if (mounted.current) setNotice({ type: "error", text: errorMessage(error) }); },
  });
  const doRequest = (request: Request) => runRequest.mutateAsync(request);
  const refresh = () => { void workspace.refetch(); };
  const data = workspace.data;
  const setModalNotice = (value: { type: "success" | "error"; text: string }) => {
    if (value.type === "success" && pendingNotifications > 0) {
      setNotice({ type: "success", text: `${value.text} ${pendingNotifications} schedule notification${pendingNotifications === 1 ? " is" : "s are"} waiting for development delivery. Retry in More.` });
    } else setNotice(value);
  };
  useEffect(() => { setNotice(null); }, [teamId, activePage]);
  if (workspace.isPending) return <div className="staff-loading" aria-label="Loading team operations"><div className="staff-skeleton" /><div className="staff-skeleton" /><div className="staff-skeleton" /></div>;
  if (workspace.isError || !data) return <div className="tss-staff"><div className="staff-topline"><div><span className="staff-overline">Team operations</span><h2>Could not load this team</h2></div><button className="staff-btn" type="button" onClick={refresh}><RefreshCw size={14} /> Retry</button></div><ErrorState error={workspace.error} retry={refresh} /></div>;

  const roster = data.roster.filter(player => player.type === "player");
  const staged = data.roster.filter(player => player.type === "staged");
  const upcoming = [...data.events].filter(event => event.status === "scheduled").sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const nextGame = upcoming.find(event => Date.parse(event.startsAt) >= Date.now());
  const readyCount = nextGame ? (homeLineupQuery.data?.entries.length ?? 0) : 0;
  const gaps = data.roster.filter(player => player.type === "player" && (!player.guardianLinked || !player.consented));
  const isAD = role === "athletic_director";
  const canManage = data.capabilities.manageStaff;
  const canManageProgram = data.capabilities.manageProgram;
  const canCreatePayment = data.capabilities.createPayments;
  const mapHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return <div className={activePage === "home" ? "scoped-staff-home" : "tss-staff"}>
      {activePage !== "home" && <div className="staff-topline">
        <div><span className="staff-overline">{isAD ? "Program operations" : `${ROLE_LABELS[role]} · team operations`}</span>
          <h2>{({ home: "Ready for what’s next.", schedule: "Schedule", roster: "Roster", chat: "Team conversations", more: "Program tools" } as Record<string, string>)[activePage]}</h2>
          <p>{isAD ? `${data.team.programName} · authorized program view` : `${data.team.name} · ${roster.length} active roster members`}</p>
        </div>
        {activePage === "schedule" && <button className="staff-btn-primary" type="button" onClick={() => setModal({ kind: "event", event: null })}><Plus size={15} /> Add event</button>}
        {activePage === "roster" && <button className="staff-btn-primary" type="button" onClick={() => setModal({ kind: "roster-import" })}><FileUp size={15} /> Import roster</button>}
      </div>}
      {notice && <div className={`staff-alert ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>{notice.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{notice.text}</div>}
      {activePage === "home" && <ScopedHomeFeed events={data.events.map(event => ({...event,location:event.rink}))}
        teamName={data.team.name} onUnavailable={feature => setHomeNotice(`${feature} is not available in this team view yet.`)}
        onAlerts={() => navigate("/high-school/more")} alerts={gaps.length + data.approvals.length}
        onAll={() => navigate("/high-school/schedule")} onAdd={() => setModal({kind:"event",event:null})}
        onEvent={event => setHomeEvent(data.events.find(item => item.id === event.id))} />}
      {activePage === "schedule" && <ScheduleView events={data.events} pending={runRequest.isPending}
        add={() => setModal({ kind: "event", event: null })}
        edit={event => setModal({ kind: "event", event })}
        remove={event => setModal({ kind: "delete-event", event })}
        lineup={event => setModal({ kind: "lineup", event })}
        report={event => setModal({ kind: "report", event })}
        importEvents={() => setModal({ kind: "event-import" })} />}
      {activePage === "roster" && <>
        {workspace.data?.capabilities.manageStaff && <FamilyStaffReview actorId={actorId} teamId={teamId}
          onChanged={() => { void queryClient.invalidateQueries({ queryKey: workspaceKey }); onContextRefresh(); }} />}
        <RosterView roster={roster} staged={staged} onImport={() => setModal({ kind: "roster-import" })} />
        <PlayerEligibilityPanel mode="team" id={teamId} />
      </>}
      {activePage === "chat" && <ChatView data={data} staffKey={staffKey} request={doRequest} pending={runRequest.isPending} />}
      {activePage === "more" && <MoreView actorId={actorId} data={data} role={role} canManage={canManage} canManageProgram={canManageProgram} canCreatePayment={canCreatePayment}
        pending={runRequest.isPending} request={doRequest} mapHref={mapHref}
        pendingNotifications={pendingNotifications}
        onRetryNotifications={async () => {
          const result = await doRequest({ method: "POST", path: `${base(teamId)}/dispatch/retry`, body: {} }) as { notification?: { pending?: number } };
          if (mounted.current && typeof result?.notification?.pending === "number") setPendingNotifications(result.notification.pending);
        }} />}
    {modal && <div className="tss-staff"><StaffModal key={`${modal.kind}:${modal.event?.id ?? ""}`} modal={modal} close={() => setModal(null)} data={data} teamId={teamId}
      request={doRequest} pending={runRequest.isPending} onSuccess={setModalNotice} staffKey={staffKey} /></div>}
    {homeNotice && <ScopedHomeNotice title="Team access" onClose={() => setHomeNotice("")}>{homeNotice}</ScopedHomeNotice>}
    {homeEvent && <ScopedHomeNotice title={homeEvent.opponent ? `vs ${homeEvent.opponent}` : homeEvent.title} onClose={() => setHomeEvent(undefined)}>
      <p>{dateLabel(homeEvent.startsAt, {weekday:"long",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</p>
      <p className="mt-2">{homeEvent.rink || data.team.rink || "Rink not set"}</p>
      {nextGame?.id === homeEvent.id && <p className="mt-2">{homeLineupQuery.isFetching ? "Checking lineup…" : `${readyCount} lineup entries saved`}</p>}
      {homeLineupQuery.isError && nextGame?.id === homeEvent.id && <p className="text-destructive mt-2">Lineup could not be loaded.</p>}
      <button className="staff-btn-primary mt-4" onClick={() => {setModal({kind:"lineup",event:homeEvent});setHomeEvent(undefined);}}>Set lineup</button>
    </ScopedHomeNotice>}
  </div>;

  function setModal(value: ModalState | null) { modalSetter(value); }
}

type ModalState = { kind: string; event?: StaffEvent | null };
// This local state is declared through a small wrapper to keep the page sections
// declarative while every flow shares the same scoped mutation and status.

function HomeView({ data, nextGame, roster, gaps, readyCount, mapHref, openLineup, go, lineupError, retryLineup, lineupLoading }: {
  data: StaffWorkspace; nextGame?: StaffEvent; roster: StaffPlayer[]; gaps: StaffPlayer[];
  readyCount: number; mapHref: (address: string) => string; openLineup: (event: StaffEvent) => void; go: (path: string) => void;
  lineupError?: string | null; retryLineup?: () => void; lineupLoading: boolean;
}) {
  const readyLabel = nextGame ? `${readyCount} lineup entries saved` : "No upcoming game";
  return <div className="staff-grid">
    <section className="staff-card staff-span-8">
      <div className="staff-card-head"><div><h3>Next on the ice</h3><p>Game details and team readiness</p></div><span className="staff-badge">Schedule</span></div>
      {nextGame ? <>
        <div className="staff-event-date">{dateLabel(nextGame.startsAt, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
        <h3 style={{ marginTop: 8, fontSize: 21 }}>{nextGame.opponent ? `vs. ${nextGame.opponent}` : nextGame.title}</h3>
        {nextGame.opponent && <p style={{ margin: "4px 0 14px" }}>{nextGame.title}</p>}
        <div className="staff-label-row staff-muted"><MapPin size={15} /> <span>{nextGame.rink || data.team.rink || "Rink not set"}</span></div>
        {(nextGame.address || data.team.address) && <a className="staff-map" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10 }} href={mapHref(nextGame.address || data.team.address)} target="_blank" rel="noreferrer">Open map <ArrowUpRight size={13} /></a>}
        <div className="staff-divider" />
        <div className="staff-actions">
          <span className="staff-badge">{lineupLoading ? "Checking lineup…" : readyLabel}</span>
          <button className="staff-btn-primary" type="button" onClick={() => openLineup(nextGame)}><ClipboardList size={14} /> Set lineup</button>
        </div>
        {lineupError && <div className="staff-alert error" style={{ marginTop: 12 }} role="alert"><AlertCircle size={15} /><span>{lineupError}</span><button className="staff-btn" type="button" onClick={retryLineup}>Retry</button></div>}
      </> : <Empty>No upcoming events yet. Add the next practice or game in Schedule.</Empty>}
    </section>
    <section className="staff-card staff-span-4">
      <div className="staff-card-head"><div><h3>Player readiness</h3><p>Guardian link and consent</p></div><ShieldCheck size={19} color="#185f63" /></div>
      <div className="staff-stat"><strong>{roster.length - gaps.length}</strong><span>of {roster.length} complete</span></div>
      <p>{gaps.length ? `${gaps.length} player${gaps.length === 1 ? "" : "s"} need follow-up.` : "No outstanding guardian or consent gaps."}</p>
      <button className="staff-btn" type="button" onClick={() => go("/high-school/roster")}>Review roster <ChevronRight size={14} /></button>
    </section>
    <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Roster check-in</h3><p>Active players · class year and permissions</p></div><span className="staff-badge">{roster.length} players</span></div>
      {roster.length ? <div className="staff-list">{roster.slice(0, 4).map(player => <PlayerRow key={player.id} player={player} compact />)}</div> : <Empty>No active players are listed yet.</Empty>}
      {roster.length > 4 && <button className="staff-btn" style={{ marginTop: 13 }} type="button" onClick={() => go("/high-school/roster")}>View all {roster.length} players</button>}
    </section>
    <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Coach’s notebook</h3><p>Keep the next action close</p></div><span className="staff-code">ROSTERHOCKEY / HS</span></div>
      <div className="staff-list">
        <button className="staff-row" type="button" style={{ width: "100%", background: "none", border: 0, textAlign: "left", cursor: "pointer" }} onClick={() => go("/high-school/schedule")}>
          <span className="staff-jersey"><ClipboardList size={17} /></span><span className="staff-row-main"><strong>Review the week</strong><span>{upcomingCount(data.events)} scheduled items</span></span><ChevronRight size={15} />
        </button>
        <button className="staff-row" type="button" style={{ width: "100%", background: "none", border: 0, textAlign: "left", cursor: "pointer" }} onClick={() => go("/high-school/chat")}>
          <span className="staff-jersey"><UsersRound size={17} /></span><span className="staff-row-main"><strong>Check team conversations</strong><span>Team, Parents, and Coaches Only rooms</span></span><ChevronRight size={15} />
        </button>
      </div>
      {data.role === "athletic_director" && data.gaps.length > 0 && <div className="staff-alert" style={{ marginTop: 12 }}>{data.gaps.length} team{data.gaps.length === 1 ? "" : "s"} have roster readiness gaps.</div>}
    </section>
  </div>;
}
function upcomingCount(events: StaffEvent[]) { return events.filter(event => event.status === "scheduled").length; }
function PlayerRow({ player, compact = false }: { player: StaffPlayer; compact?: boolean }) {
  return <div className="staff-row">
    <span className="staff-jersey">{player.number || "—"}</span>
    <span className="staff-row-main"><strong>{player.firstName} {player.lastName}</strong><span>{player.position || "Position not set"}{player.gradYear ? ` · ${classForYear(player.gradYear)}` : ""}</span></span>
    {!compact && <div className="staff-label-row"><span className={`staff-badge ${player.guardianLinked ? "" : "warn"}`}>{player.guardianLinked ? "Guardian linked" : "No guardian link"}</span><span className={`staff-badge ${player.consented ? "" : "warn"}`}>{player.consented ? "Consent recorded" : "Consent missing"}</span></div>}
  </div>;
}
function ScheduleView({ events, pending, add, edit, remove, lineup, report, importEvents }: {
  events: StaffEvent[]; pending: boolean; add: () => void; edit: (event: StaffEvent) => void;
  remove: (event: StaffEvent) => void; lineup: (event: StaffEvent) => void; report: (event: StaffEvent) => void; importEvents: () => void;
}) {
  const sorted = [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return <div className="staff-grid">
    <section className="staff-card">
      <div className="staff-card-head"><div><h3>Upcoming and recent</h3><p>Schedule changes are saved to this team</p></div><div className="staff-actions"><button className="staff-btn" disabled={pending} onClick={importEvents}><FileUp size={14} /> Import</button><button className="staff-btn-primary" disabled={pending} onClick={add}><Plus size={14} /> Add event</button></div></div>
      {sorted.length ? <div className="staff-list">{sorted.map(event => <EventRow key={event.id} event={event} pending={pending} edit={edit} remove={remove} lineup={lineup} report={report} />)}</div> : <Empty>No schedule items yet. Add an event or preview a CSV/iCal import.</Empty>}
    </section>
  </div>;
}
function EventRow({ event, pending, edit, remove, lineup, report }: {
  event: StaffEvent; pending: boolean; edit: (event: StaffEvent) => void; remove: (event: StaffEvent) => void;
  lineup: (event: StaffEvent) => void; report: (event: StaffEvent) => void;
}) {
  const isFinal = event.status === "final";
  return <div className="staff-row" style={{ alignItems: "flex-start" }}>
    <span className="staff-event-date" style={{ width: 92, flex: "none", lineHeight: 1.5 }}>{dateLabel(event.startsAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
    <div className="staff-row-main"><strong>{event.opponent ? `${event.title} · vs. ${event.opponent}` : event.title}</strong><span>{event.rink || "Rink not set"}{event.address ? ` · ${event.address}` : ""}</span>
      {isFinal && <span className="staff-badge" style={{ marginTop: 7 }}>Final · {event.homeScore}–{event.awayScore}</span>}
    </div>
    <div className="staff-actions">
      {!isFinal && <button className="staff-btn" type="button" disabled={pending} onClick={() => lineup(event)}>Lineup</button>}
      {!isFinal && <button className="staff-btn" type="button" disabled={pending} onClick={() => report(event)}>{event.reportAvailable ? "Report score" : "Report unavailable"}</button>}
      <button className="staff-icon-btn" type="button" aria-label={`Edit ${event.title}`} disabled={pending} onClick={() => edit(event)}><Pencil size={14} /></button>
      <button className="staff-icon-btn" type="button" aria-label={`Delete ${event.title}`} disabled={pending} onClick={() => remove(event)}><Trash2 size={14} /></button>
    </div>
  </div>;
}
function RosterView({ roster, staged, onImport }: { roster: StaffPlayer[]; staged: StaffPlayer[]; onImport: () => void }) {
  return <div className="staff-grid">
    <section className="staff-card">
      <div className="staff-card-head"><div><h3>Active roster</h3><p>Staff-only roster information. Imported rows remain staging until separately approved.</p></div><button className="staff-btn-primary" type="button" onClick={onImport}><FileUp size={14} /> Import roster</button></div>
      {roster.length ? <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>No.</th><th>Player</th><th>Position</th><th>Class</th><th>Guardian link</th><th>Consent</th></tr></thead><tbody>{roster.map(player => <tr key={player.id}><td><strong>{player.number || "—"}</strong></td><td>{player.firstName} {player.lastName}</td><td>{player.position || "—"}</td><td>{player.gradYear ? classForYear(player.gradYear) : "—"}</td><td><span className={`staff-badge ${player.guardianLinked ? "" : "warn"}`}>{player.guardianLinked ? "Linked" : "Needs link"}</span></td><td><span className={`staff-badge ${player.consented ? "" : "warn"}`}>{player.consented ? "Recorded" : "Missing"}</span></td></tr>)}</tbody></table></div> : <Empty>No active roster entries. Import a roster to create restricted staging rows.</Empty>}
    </section>
    <section className="staff-card">
      <div className="staff-card-head"><div><h3>Staging</h3><p>Imported players are not active, linked, or consented.</p></div><span className="staff-badge">{staged.length} staged</span></div>
      {staged.length ? <div className="staff-list">{staged.map(player => <div key={player.id} className="staff-row"><span className="staff-jersey">{player.number || "—"}</span><span className="staff-row-main"><strong>{player.firstName} {player.lastName}</strong><span>{player.position || "Position not set"} · {player.gradYear ? classForYear(player.gradYear) : "Class year not set"}</span></span><span className="staff-badge warn">Staging only</span></div>)}</div> : <Empty>No imported staging rows.</Empty>}
    </section>
  </div>;
}

function ChatView({ data, staffKey, request, pending }: {
  data: StaffWorkspace; staffKey: readonly unknown[]; request: (request: Request) => Promise<unknown>; pending: boolean;
}) {
  const queryClient = useQueryClient();
  const mounted = useMountedRef();
  const [roomId, setRoomId] = useState(data.rooms[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [reportTarget, setReportTarget] = useState<StaffMessage | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const roomsSignature = data.rooms.map(room => room.id).join("|");
  const roomsRef = useRef(data.rooms);
  roomsRef.current = data.rooms;
  useEffect(() => {
    if (!roomsRef.current.some(room => room.id === roomId)) setRoomId(roomsRef.current[0]?.id ?? "");
  }, [roomsSignature, roomId]);
  const room = data.rooms.find(item => item.id === roomId);
  const messages = useQuery<{ messages: StaffMessage[] }>({
    queryKey: [...staffKey, "messages", roomId],
    queryFn: async ({ signal }) => (await apiRequest("GET", `${base(data.team.id)}/rooms/${encodeURIComponent(roomId)}/messages`, undefined, signal)).json(),
    enabled: !!roomId, gcTime: 0, retry: false, staleTime: 0, refetchInterval: 7000,
  });
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value || !roomId || pending) return;
    setFeedback("");
    try {
      await request({ method: "POST", path: `${base(data.team.id)}/rooms/${encodeURIComponent(roomId)}/messages`, body: { body: value, requestId: crypto.randomUUID() } });
      if (!mounted.current) return;
      setBody("");
      await queryClient.invalidateQueries({ queryKey: [...staffKey, "messages", roomId] });
    } catch (error) { if (mounted.current) setFeedback(errorMessage(error)); }
  };
  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!reportTarget || reportReason.trim().length < 3 || pending) return;
    setFeedback("");
    try {
      await request({ method: "POST", path: `${base(data.team.id)}/messages/${encodeURIComponent(reportTarget.id)}/report`, body: { reason: reportReason.trim() } });
      if (!mounted.current) return;
      setReportTarget(null); setReportReason(""); setFeedback("Message report sent to the program’s authorized staff.");
    } catch (error) { if (mounted.current) setFeedback(errorMessage(error)); }
  };
  return <div className="staff-grid">
    <section className="staff-card">
      <div className="staff-card-head"><div><h3>Persisted team rooms</h3><p>Messages stay in the room. No email or direct-message fallback.</p></div>{messages.isFetching && <span className="staff-poll">Updating</span>}</div>
      {data.rooms.length ? <>
        <div className="staff-segment" role="group" aria-label="Choose conversation">{data.rooms.map(item => <button key={item.id} type="button" aria-pressed={roomId === item.id} onClick={() => { setRoomId(item.id); setFeedback(""); }}>{item.name}</button>)}</div>
        {!room && <Empty>No room is available for this team.</Empty>}
        {room && <>
          {messages.isPending ? <div className="staff-loading" style={{ marginTop: 15 }}><div className="staff-skeleton" /><div className="staff-skeleton" /></div>
            : messages.isError ? <div style={{ marginTop: 14 }}><ErrorState error={messages.error} retry={() => void messages.refetch()} /></div>
            : <div className="staff-chat-log" aria-live="polite" style={{ marginTop: 14 }}>
              {messages.data?.messages.length ? messages.data.messages.map(message => <article className={`staff-bubble ${message.authorType === "staff" ? "mine" : ""}`} key={message.id}>
                <p>{message.body}</p><small>{message.sender} · {dateLabel(message.createdAt, { hour: "numeric", minute: "2-digit" })}</small>
                {room.kind === "team" && <button type="button" className="staff-map" style={{ border: 0, background: "none", padding: "7px 0 0", cursor: "pointer" }} onClick={() => { setReportTarget(message); setReportReason(""); }}>Report message</button>}
              </article>) : <Empty>No messages in this room yet. Start the team conversation.</Empty>}
            </div>}
          <form className="staff-form" onSubmit={send}>
            <Field label="Message"><textarea className="staff-textarea" maxLength={1000} value={body} onChange={e => setBody(e.target.value)} placeholder={`Write to ${room.name}`} required /></Field>
            <div className="staff-actions"><button className="staff-btn-primary" type="submit" disabled={pending || !body.trim()}><Send size={14} /> Send message</button><span className="staff-muted">Up to 2,000 characters</span></div>
          </form>
        </>}
      </> : <Empty>No persisted team rooms are available for this staff membership.</Empty>}
      {feedback && <div className={`staff-alert ${feedback.includes("sent") ? "success" : "error"}`} style={{ marginTop: 13 }} role="status">{feedback}</div>}
    </section>
    {reportTarget && <Modal title="Report this message" close={() => setReportTarget(null)}>
      <p className="staff-muted">Reports are visible only to authorized program staff. The message remains in its conversation.</p>
      <form className="staff-form" onSubmit={submitReport}>
        <Field label="Reason"><textarea className="staff-textarea" value={reportReason} onChange={e => setReportReason(e.target.value)} minLength={3} maxLength={500} required placeholder="Describe the concern" /></Field>
        <div className="staff-actions"><button className="staff-btn-danger" disabled={pending || reportReason.trim().length < 3} type="submit"><Flag size={14} /> Submit report</button><button className="staff-btn" type="button" onClick={() => setReportTarget(null)}>Cancel</button></div>
      </form>
    </Modal>}
  </div>;
}

function MoreView({ actorId, data, role, canManage, canManageProgram, canCreatePayment, pending, request, mapHref, pendingNotifications, onRetryNotifications }: {
  actorId: string; data: StaffWorkspace; role: StaffRole; canManage: boolean; canManageProgram: boolean; canCreatePayment: boolean; pending: boolean;
  request: (request: Request) => Promise<unknown>; mapHref: (address: string) => string;
  pendingNotifications: number; onRetryNotifications: () => Promise<void>;
}) {
  const mounted = useMountedRef();
  const [settings, setSettings] = useState({ name: data.team.name, rink: data.team.rink, address: data.team.address });
  const [invite, setInvite] = useState({ email: "", role: "assistant_coach" as "assistant_coach" | "team_manager" });
  const [newTeam, setNewTeam] = useState("");
  const [payment, setPayment] = useState({ title: "", amount: "", recipientIds: [] as string[] });
  const [confirmMembership, setConfirmMembership] = useState<string | null>(null);
  const [confirmReport, setConfirmReport] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const ad = role === "athletic_director" && canManageProgram;
  const runSafely = async (action: () => Promise<unknown>) => {
    try { await action(); return mounted.current; }
    catch (error) { if (mounted.current) { setFeedback(errorMessage(error)); setFeedbackError(true); } return false; }
  };
  const saveSettings = async (e: FormEvent) => {
    e.preventDefault(); setFeedback(""); setFeedbackError(false);
    if (await runSafely(() => request({ method: "PUT", path: `${base(data.team.id)}/settings`, body: settings, refreshContext: true }))) setFeedback("Team settings saved.");
  };
  const inviteStaff = async (e: FormEvent) => {
    e.preventDefault(); setFeedback(""); setFeedbackError(false);
    if (await runSafely(() => request({ method: "POST", path: `${base(data.team.id)}/invitations`, body: invite }))) {
      setInvite({ email: "", role: "assistant_coach" }); setFeedback("Staff request saved. Delivery is disabled; no invitation email was sent.");
    }
  };
  const createTeam = async (e: FormEvent) => {
    e.preventDefault(); setFeedback(""); setFeedbackError(false);
    if (await runSafely(() => request({ method: "POST", path: `${base(data.team.id)}/teams`, body: { name: newTeam }, refreshContext: true }))) {
      setNewTeam(""); setFeedback("Team created. Initial authority still follows the league approval process.");
    }
  };
  const createPayment = async (e: FormEvent) => {
    e.preventDefault(); setFeedback(""); setFeedbackError(false);
    if (await runSafely(() => request({ method: "POST", path: `${base(data.team.id)}/payments`, body: { ...payment, amount: Number(payment.amount).toFixed(2) } }))) {
      setPayment({ title: "", amount: "", recipientIds: [] }); setFeedback("Payment request saved. No charge or external delivery was started.");
    }
  };
  const approve = async (id: string, approved: boolean) => {
    setFeedback(""); setFeedbackError(false);
    if (await runSafely(() => request({ method: "POST", path: `${base(data.team.id)}/approvals/${encodeURIComponent(id)}`, body: { approve: approved }, refreshContext: true }))) setFeedback(approved ? "Staff approval recorded." : "Staff request declined.");
  };
  const revoke = async (membershipId: string) => {
    setFeedback(""); setFeedbackError(false);
    if (await runSafely(() => request({ method: "DELETE", path: `${base(data.team.id)}/staff/${encodeURIComponent(membershipId)}`, refreshContext: true }))) {
      setConfirmMembership(null); setFeedback("Staff access revoked.");
    }
  };
  const resolveReport = async (id: string) => {
    setFeedback(""); setFeedbackError(false);
    if (await runSafely(() => request({ method: "POST", path: `${base(data.team.id)}/reports/${encodeURIComponent(id)}/resolve`, body: {} }))) {
      setConfirmReport(null); setFeedback("Report marked resolved.");
    }
  };
  const patchRecipient = async (requestId: string, recipientId: string, confirmed: boolean) => {
    setFeedback(""); setFeedbackError(false);
    if (await runSafely(() => request({ method: "PATCH", path: `${base(data.team.id)}/payments/${encodeURIComponent(requestId)}/recipients/${encodeURIComponent(recipientId)}`, body: { confirmed } }))) setFeedback("Recipient status updated.");
  };
  return <div className="staff-grid">
    {canManage ? <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Team details</h3><p>These details are shared with your team.</p></div><MapPin size={18} color="#185f63" /></div>
      <form className="staff-form" onSubmit={saveSettings}>
        <Field label="Team name"><input className="staff-input" maxLength={120} value={settings.name} onChange={e => setSettings({ ...settings, name: e.target.value })} required /></Field>
        <Field label="Home rink"><input className="staff-input" maxLength={160} value={settings.rink} onChange={e => setSettings({ ...settings, rink: e.target.value })} /></Field>
        <Field label="Rink address"><input className="staff-input" maxLength={240} value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} /></Field>
        {settings.address && <a className="staff-map" href={mapHref(settings.address)} target="_blank" rel="noreferrer">Check map link <ArrowUpRight size={13} /></a>}
        <button className="staff-btn-primary" type="submit" disabled={pending || !settings.name.trim()}>Save team details</button>
      </form>
    </section> : <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Team details</h3><p>Shared home rink information</p></div><MapPin size={18} color="#185f63" /></div>
      <div className="staff-list"><div className="staff-row"><span className="staff-row-main"><strong>{data.team.name}</strong><span>Team name</span></span></div><div className="staff-row"><span className="staff-row-main"><strong>{data.team.rink || "Not set"}</strong><span>Home rink</span></span></div><div className="staff-row"><span className="staff-row-main"><strong>{data.team.address || "Not set"}</strong><span>Rink address</span></span></div></div>
    </section>}
    {canManage && <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Staff access</h3><p>Assistant and manager invitations are stored without delivery.</p></div><UsersRound size={18} color="#185f63" /></div>
      <form className="staff-form" onSubmit={inviteStaff}>
        <Field label="Email address"><input className="staff-input" type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} required /></Field>
        <Field label="Requested role"><select className="staff-select" value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value as typeof invite.role })}><option value="assistant_coach">Assistant coach</option><option value="team_manager">Team manager</option></select></Field>
        <button className="staff-btn-primary" type="submit" disabled={pending || !invite.email.trim()}>Save staff request</button>
      </form>
      <div className="staff-divider" />
      <div className="staff-list">{data.staff.length ? data.staff.map(member => <div className="staff-row" key={member.id}>
        <span className="staff-jersey">{member.name.trim().slice(0, 1).toUpperCase()}</span><span className="staff-row-main"><strong>{member.name}</strong><span>{ROLE_LABELS[member.role]}</span></span>
        {member.userId === actorId ? <span className="staff-badge">You</span>
          : canRevoke(member, role) && confirmMembership === member.id ? <div className="staff-inline-confirm"><span>Revoke this staff member’s access?</span><div className="staff-actions"><button className="staff-btn-danger" type="button" disabled={pending} onClick={() => void revoke(member.id)}>Revoke</button><button className="staff-btn" type="button" onClick={() => setConfirmMembership(null)}>Keep access</button></div></div>
          : canRevoke(member, role) ? <button className="staff-btn-danger" type="button" disabled={pending} onClick={() => setConfirmMembership(member.id)}>Revoke</button>
          : <span className="staff-badge">Access managed by authorized staff</span>}
      </div>) : <Empty>No other staff memberships are available.</Empty>}</div>
    </section>}
    {canCreatePayment && <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Payment requests</h3><p>{data.capabilities.paymentReason || "Existing account entitlements apply. No charges are processed here."}</p></div><span className="staff-badge">No external delivery</span></div>
      <form className="staff-form" onSubmit={createPayment}>
        <Field label="Request title"><input className="staff-input" maxLength={120} value={payment.title} onChange={e => setPayment({ ...payment, title: e.target.value })} required /></Field>
        <Field label="Amount"><input className="staff-input" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} placeholder="0.00" required /></Field>
        <Field label="Recipients"><select className="staff-select" multiple value={payment.recipientIds} onChange={e => setPayment({ ...payment, recipientIds: Array.from(e.currentTarget.selectedOptions, option => option.value) })} size={Math.min(5, Math.max(2, data.paymentRecipients.length))}>{data.paymentRecipients.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
        {!data.paymentRecipients.length && <p className="staff-muted">No eligible recipients are currently available.</p>}
        <button className="staff-btn-primary" type="submit" disabled={pending || !payment.title.trim() || !/^\d+(\.\d{1,2})?$/.test(payment.amount) || !payment.recipientIds.length}>Create request</button>
      </form>
    </section>}
    {data.payments.length > 0 && <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Payment tracking</h3><p>Authorized staff view · no payment capture</p></div></div>
      <div className="staff-list">{data.payments.map(item => <div className="staff-row" key={item.id} style={{ display: "block" }}>
        <div className="staff-row" style={{ border: 0, padding: 0 }}><span className="staff-row-main"><strong>{item.title}</strong><span>${item.amount}</span></span></div>
        {item.recipients.map(person => <div key={person.id} className="staff-row">
          <span className="staff-row-main"><strong>{person.name}</strong><span>{person.paid ? "Paid" : "Unpaid"} · {person.confirmed ? "Confirmed" : "Not confirmed"}</span></span>
          {person.confirmed
            ? <span className="staff-badge">Creator confirmed</span>
            : (item as typeof item & { creatorId?: string }).creatorId === actorId && person.paid
              ? <button className="staff-btn" type="button" disabled={pending} onClick={() => void patchRecipient(item.id, person.id, true)}>Confirm payment</button>
              : <span className={`staff-badge ${person.paid ? "" : "warn"}`}>{person.paid ? "Creator confirmation only" : "Awaiting recorded payment"}</span>}
        </div>)}
      </div>)}</div>
    </section>}
    {pendingNotifications > 0 && <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Schedule delivery queue</h3><p>{pendingNotifications} change notification{pendingNotifications === 1 ? " is" : "s are"} waiting for the development transport.</p></div><span className="staff-badge warn">Retry available</span></div>
      <p className="staff-muted">Retry uses the development-only notification transport. No email or push delivery is sent.</p>
      <button className="staff-btn-primary" type="button" disabled={pending} onClick={() => void runSafely(onRetryNotifications)}>Retry notifications</button>
    </section>}
    {ad && <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Program teams</h3><p>Cross-team roster readiness</p></div><span className="staff-badge">{data.gaps.length} gaps</span></div>
      {data.gaps.length ? <div className="staff-list">{data.gaps.map(gap => <div className="staff-row" key={gap.teamId}><span className="staff-row-main"><strong>{gap.name}</strong><span>{gap.missingGuardian} guardian links · {gap.missingConsent} consent records missing</span></span></div>)}</div> : <Empty>No roster readiness gaps across this program.</Empty>}
      <div className="staff-divider" />
      <form className="staff-form" onSubmit={createTeam}>
        <Field label="Create a team"><input className="staff-input" maxLength={120} value={newTeam} onChange={e => setNewTeam(e.target.value)} placeholder="Team name" required /></Field>
        <p className="staff-muted">New team authority remains subject to the league’s initial approval process.</p>
        <button className="staff-btn-primary" type="submit" disabled={pending || !newTeam.trim()}>Create team</button>
      </form>
    </section>}
    {data.capabilities.manageStaff && <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Staff approvals</h3><p>{ad ? "Pending requests in your authorized program" : "Pending assistant and manager requests for this team"}</p></div><span className="staff-badge">{data.approvals.length} pending</span></div>
      {data.approvals.length ? <div className="staff-list">{data.approvals.map(item => <div className="staff-row" key={item.id}><span className="staff-row-main"><strong>{item.name}</strong><span>{ROLE_LABELS[item.role]} · {item.teamName} · {item.school}</span></span><div className="staff-actions"><button className="staff-btn-primary" type="button" disabled={pending} onClick={() => void approve(item.id, true)}>Approve</button><button className="staff-btn-danger" type="button" disabled={pending} onClick={() => void approve(item.id, false)}>Decline</button></div></div>)}</div> : <Empty>No pending staff approvals.</Empty>}
    </section>}
    {ad && <section className="staff-card staff-span-6">
      <div className="staff-card-head"><div><h3>Reported messages</h3><p>Program reports only. Family conversations are not shown.</p></div><MessageSquareWarning size={18} color="#185f63" /></div>
      {data.reports.length ? <div className="staff-list">{data.reports.map(item => <div className="staff-row" key={item.id} style={{ alignItems: "flex-start" }}><span className="staff-row-main"><strong>{item.reason}</strong><span>{item.teamName} · reported by {item.sender} · {item.status}</span><span>{item.body}</span></span>{confirmReport === item.id ? <div className="staff-inline-confirm"><span>Resolve this report?</span><div className="staff-actions"><button className="staff-btn-primary" type="button" disabled={pending} onClick={() => void resolveReport(item.id)}>Resolve</button><button className="staff-btn" type="button" onClick={() => setConfirmReport(null)}>Cancel</button></div></div> : <button className="staff-btn" type="button" disabled={pending || item.status === "resolved"} onClick={() => setConfirmReport(item.id)}>{item.status === "resolved" ? "Resolved" : "Resolve"}</button>}</div>)}</div> : <Empty>No message reports for this program.</Empty>}
    </section>}
    {ad && <section className="staff-card">
      <div className="staff-card-head"><div><h3>Program activity</h3><p>Authorized audit events</p></div><span className="staff-code">{data.audit.length} entries</span></div>
      {data.audit.length ? <div className="staff-list">{data.audit.map(item => <div className="staff-row" key={item.id}><span className="staff-event-date" style={{ width: 128, flex: "none" }}>{dateLabel(item.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span><span className="staff-row-main"><strong>{item.event}</strong></span></div>)}</div> : <Empty>No audit entries are available.</Empty>}
    </section>}
    {feedback && <div className={`staff-alert ${feedbackError ? "error" : "success"}`} style={{ gridColumn: "1 / -1" }} role={feedbackError ? "alert" : "status"}>{feedbackError ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}{feedback}</div>}
  </div>;
}

function canRevoke(member: StaffWorkspace["staff"][number], role: StaffRole) {
  if (role === "athletic_director") return true;
  return role === "head_coach" && (member.role === "assistant_coach" || member.role === "team_manager");
}

function StaffModal({ modal, close, data, teamId, request, pending, onSuccess, staffKey }: {
  modal: ModalState; close: () => void; data: StaffWorkspace; teamId: string;
  request: (request: Request) => Promise<unknown>; pending: boolean;
  onSuccess: (value: { type: "success" | "error"; text: string }) => void;
  staffKey: readonly unknown[];
}) {
  const mounted = useMountedRef();
  const event = modal.event ?? null;
  const initialStart = event ? new Date(event.startsAt) : new Date(Date.now() + 86400000);
  const [eventForm, setEventForm] = useState<EventDraft>({
    title: event?.title ?? "", opponent: event?.opponent ?? "",
    startsAt: `${initialStart.getFullYear()}-${String(initialStart.getMonth() + 1).padStart(2, "0")}-${String(initialStart.getDate()).padStart(2, "0")}T${String(initialStart.getHours()).padStart(2, "0")}:${String(initialStart.getMinutes()).padStart(2, "0")}`,
    rink: event?.rink ?? data.team.rink, address: event?.address ?? data.team.address,
    ...(event ? { id: event.id, version: event.version } : {}),
  });
  const [error, setError] = useState("");
  const [format, setFormat] = useState<"csv" | "ical">("csv");
  const [importText, setImportText] = useState("");
  const [eventPreview, setEventPreview] = useState<ImportPreview<StaffEventInput> | null>(null);
  const [rosterPreview, setRosterPreview] = useState<ImportPreview<{ firstName: string; lastName: string; gradYear: number; position: string; jerseyNumber: string }> | null>(null);
  const [score, setScore] = useState({ homeScore: "", awayScore: "" });
  const dateToIso = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  };
  const submitEvent = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    const { id, version, ...input } = eventForm;
    const body = { ...input, startsAt: dateToIso(input.startsAt), ...(id && version !== undefined ? { version } : {}) };
    try {
      await request(id
        ? { method: "PUT", path: `${base(teamId)}/events/${encodeURIComponent(id)}`, body }
        : { method: "POST", path: `${base(teamId)}/events`, body });
      if (!mounted.current) return;
      onSuccess({ type: "success", text: id ? "Schedule item updated." : "Schedule item added." });
      close();
    } catch (reason) { if (mounted.current) setError(errorMessage(reason)); }
  };
  const deleteEvent = async () => {
    if (!event) return;
    setError("");
    try {
      await request({ method: "DELETE", path: `${base(teamId)}/events/${encodeURIComponent(event.id)}`, body: { version: event.version } });
      if (!mounted.current) return;
      onSuccess({ type: "success", text: "Schedule item deleted." }); close();
    } catch (reason) { if (mounted.current) setError(errorMessage(reason)); }
  };
  const previewEvents = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setEventPreview(null);
    try {
      const result = await (await apiRequest("POST", `${base(teamId)}/events/import/preview`, { format, text: importText })).json() as ImportPreview<StaffEventInput>;
      if (!mounted.current) return;
      setEventPreview(result);
    } catch (reason) { if (mounted.current) setError(errorMessage(reason)); }
  };
  const commitEvents = async () => {
    if (!eventPreview || eventPreview.errors.length || !eventPreview.rows.length) return;
    setError("");
    try {
      await request({ method: "POST", path: `${base(teamId)}/events/import`, body: { rows: eventPreview.rows } });
      if (!mounted.current) return;
      onSuccess({ type: "success", text: `${eventPreview.rows.length} schedule row${eventPreview.rows.length === 1 ? "" : "s"} imported.` }); close();
    } catch (reason) { if (mounted.current) setError(errorMessage(reason)); }
  };
  const previewRoster = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setRosterPreview(null);
    try {
      const result = await (await apiRequest("POST", `${base(teamId)}/roster/import/preview`, { text: importText })).json() as ImportPreview<{ firstName: string; lastName: string; gradYear: number; position: string; jerseyNumber: string }>;
      if (!mounted.current) return;
      setRosterPreview(result);
    } catch (reason) { if (mounted.current) setError(errorMessage(reason)); }
  };
  const commitRoster = async () => {
    if (!rosterPreview || rosterPreview.errors.length || !rosterPreview.rows.length) return;
    setError("");
    try {
      await request({ method: "POST", path: `${base(teamId)}/roster/import`, body: { rows: rosterPreview.rows } });
      if (!mounted.current) return;
      onSuccess({ type: "success", text: `${rosterPreview.rows.length} row${rosterPreview.rows.length === 1 ? "" : "s"} added to restricted staging only.` }); close();
    } catch (reason) { if (mounted.current) setError(errorMessage(reason)); }
  };
  const submitReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setError("");
    try {
      await request({ method: "POST", path: `${base(teamId)}/events/${encodeURIComponent(event.id)}/report`, body: { version: event.version, homeScore: Number(score.homeScore), awayScore: Number(score.awayScore) } });
      if (!mounted.current) return;
      onSuccess({ type: "success", text: "Final score report saved." }); close();
    } catch (reason) { if (mounted.current) setError(errorMessage(reason)); }
  };
  const previewTable = <T extends Record<string, unknown>>(preview: ImportPreview<T>, kind: "events" | "roster") => <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
    {preview.errors.length > 0 && <div className="staff-alert error" role="alert"><AlertCircle size={15} /><span>Import cannot be committed. Fix all {preview.errors.length} reported row error{preview.errors.length === 1 ? "" : "s"} and preview again.</span></div>}
    {preview.errors.map((item, index) => <div key={`${item.row}-${index}`} className="staff-alert error"><span className="staff-code">ROW {item.row}</span><span>{item.message}</span></div>)}
    {preview.rows.length > 0 && <div className="staff-table-wrap"><table className="staff-table"><thead><tr>{kind === "events" ? <><th>Title</th><th>Opponent</th><th>Start</th><th>Rink</th></> : <><th>No.</th><th>Player</th><th>Position</th><th>Class year</th></>}</tr></thead>
      <tbody>{preview.rows.slice(0, 15).map((row, index) => <tr key={index}>{kind === "events"
        ? <><td>{String(row.title ?? "")}</td><td>{String(row.opponent ?? "")}</td><td>{dateLabel(String(row.startsAt ?? ""))}</td><td>{String(row.rink ?? "")}</td></>
        : <><td>{String(row.jerseyNumber ?? "")}</td><td>{String(row.firstName ?? "")} {String(row.lastName ?? "")}</td><td>{String(row.position ?? "")}</td><td>{String(row.gradYear ?? "")}</td></>}</tr>)}</tbody></table></div>}
    {preview.rows.length > 15 && <p className="staff-muted">Showing the first 15 of {preview.rows.length} validated rows.</p>}
    <div className="staff-actions"><button className="staff-btn-primary" type="button" disabled={pending || preview.errors.length > 0 || !preview.rows.length} onClick={kind === "events" ? commitEvents : commitRoster}>Commit {preview.rows.length} validated rows</button><button className="staff-btn" type="button" onClick={() => { if (kind === "events") setEventPreview(null); else setRosterPreview(null); }}>Review source again</button></div>
  </div>;

  if (modal.kind === "event") return <Modal title={event ? "Edit schedule item" : "Add to schedule"} close={close}>
    {error && <div className="staff-alert error" role="alert"><AlertCircle size={15} />{error}</div>}
    <form className="staff-form" onSubmit={submitEvent}>
      <div className="staff-form-grid">
        <Field label="Title"><input className="staff-input" maxLength={120} value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} required /></Field>
        <Field label="Opponent"><input className="staff-input" maxLength={120} value={eventForm.opponent} onChange={e => setEventForm({ ...eventForm, opponent: e.target.value })} /></Field>
      </div>
      <Field label="Date and time"><input className="staff-input" type="datetime-local" value={eventForm.startsAt} onChange={e => setEventForm({ ...eventForm, startsAt: e.target.value })} required /></Field>
      <Field label="Rink"><input className="staff-input" maxLength={160} value={eventForm.rink} onChange={e => setEventForm({ ...eventForm, rink: e.target.value })} /></Field>
      <Field label="Address"><input className="staff-input" maxLength={240} value={eventForm.address} onChange={e => setEventForm({ ...eventForm, address: e.target.value })} /></Field>
      <div className="staff-actions"><button className="staff-btn-primary" type="submit" disabled={pending || !eventForm.title.trim()}>{event ? "Save changes" : "Add event"}</button><button className="staff-btn" type="button" onClick={close}>Cancel</button></div>
    </form>
  </Modal>;
  if (modal.kind === "delete-event") return <Modal title="Delete schedule item" close={close}>
    <div className="staff-alert error"><AlertCircle size={16} /><span>This removes <strong>{event?.title}</strong> from the team schedule. This cannot be undone.</span></div>
    {error && <div className="staff-alert error" style={{ marginTop: 10 }} role="alert">{error}</div>}
    <div className="staff-actions" style={{ marginTop: 16 }}><button className="staff-btn-danger" type="button" disabled={pending} onClick={() => void deleteEvent()}>Delete schedule item</button><button className="staff-btn" type="button" onClick={close}>Keep item</button></div>
  </Modal>;
  if (modal.kind === "event-import") return <Modal title="Preview schedule import" close={close}>
    <p className="staff-muted">Review every parsed row before commit. Rows with errors cannot be committed.</p>
    {!eventPreview ? <form className="staff-form" onSubmit={previewEvents}>
      <div className="staff-segment"><button type="button" aria-pressed={format === "csv"} onClick={() => setFormat("csv")}>CSV</button><button type="button" aria-pressed={format === "ical"} onClick={() => setFormat("ical")}>iCal</button></div>
      <Field label={format === "csv" ? "Paste CSV schedule" : "Paste iCalendar data"}><textarea className="staff-textarea" value={importText} onChange={e => setImportText(e.target.value)} required placeholder={format === "csv" ? "title,opponent,startsAt,rink,address" : "BEGIN:VCALENDAR ..."} /></Field>
      {error && <div className="staff-alert error" role="alert">{error}</div>}
      <div className="staff-actions"><button className="staff-btn-primary" type="submit" disabled={pending || !importText.trim()}>Preview rows</button><button className="staff-btn" type="button" onClick={close}>Cancel</button></div>
    </form> : <>
      <div className="staff-alert"><CheckCircle2 size={15} /><span>{eventPreview.rows.length} parsed schedule rows · review before committing</span></div>
      {previewTable(eventPreview as ImportPreview<Record<string, unknown>>, "events")}
    </>}
  </Modal>;
  if (modal.kind === "roster-import") return <Modal title="Preview roster import" close={close}>
    <p className="staff-muted">Validated imports create staging rows only. They do not create child accounts or change guardian links or consent.</p>
    {!rosterPreview ? <form className="staff-form" onSubmit={previewRoster}>
      <Field label="Paste roster CSV"><textarea className="staff-textarea" value={importText} onChange={e => setImportText(e.target.value)} required placeholder="firstName,lastName,gradYear,position,jerseyNumber" /></Field>
      {error && <div className="staff-alert error" role="alert">{error}</div>}
      <div className="staff-actions"><button className="staff-btn-primary" type="submit" disabled={pending || !importText.trim()}>Preview roster rows</button><button className="staff-btn" type="button" onClick={close}>Cancel</button></div>
    </form> : <>
      <div className="staff-alert"><ShieldCheck size={15} /><span>{rosterPreview.rows.length} parsed rows · staging only</span></div>
      {previewTable(rosterPreview as ImportPreview<Record<string, unknown>>, "roster")}
    </>}
  </Modal>;
  if (modal.kind === "lineup" && event) return <Modal title={`Game lineup · ${event.opponent || event.title}`} close={close}>
    <StaffLineupEditor teamId={teamId} event={event} data={data} staffKey={staffKey} pending={pending}
      request={request} close={close} onSuccess={onSuccess} />
  </Modal>;
  if (modal.kind === "report" && event) return <Modal title="Submit final score" close={close}>
    <p className="staff-muted">{event.opponent || event.title} · {dateLabel(event.startsAt)}</p>
    {!event.reportAvailable && <div className="staff-alert"><CircleHelp size={15} /><span>The server has not opened this report window yet. You can return after the game is eligible.</span></div>}
    {error && <div className="staff-alert error" role="alert">{error}</div>}
    <form className="staff-form" style={{ marginTop: 14 }} onSubmit={submitReport}>
      <div className="staff-form-grid">
        <Field label={`${data.team.name} score`}><input className="staff-input" type="number" min="0" step="1" value={score.homeScore} onChange={e => setScore({ ...score, homeScore: e.target.value })} required /></Field>
        <Field label={`${event.opponent || "Opponent"} score`}><input className="staff-input" type="number" min="0" step="1" value={score.awayScore} onChange={e => setScore({ ...score, awayScore: e.target.value })} required /></Field>
      </div>
      <p className="staff-muted">The server checks eligibility and event version again when saving.</p>
      <div className="staff-actions"><button className="staff-btn-primary" type="submit" disabled={pending || !event.reportAvailable || score.homeScore === "" || score.awayScore === ""}>Save final report</button><button className="staff-btn" type="button" onClick={close}>Cancel</button></div>
    </form>
  </Modal>;
  return null;
}

import React, { useState } from "react";
import { useSchoolLeagueAction, useSchoolLeagueWorkspace } from "@/hooks/useSchoolLeagueManagement";
import type { SchoolLeagueActionResult, SchoolLeagueWorkspace } from "@shared/schoolLeagueManagement";
import { PlayerEligibilityPanel } from "@/components/PlayerEligibilityPanel";
import { SchoolSetupWizard } from "@/components/league-management/SchoolSetupWizard";

type Pane = "overview" | "people" | "schedule" | "eligibility";
type SchedulePreview = { teamId: string; format: "csv" | "ical"; text: string; result: SchoolLeagueActionResult };

const roles: Record<string, string> = {
  head_coach: "Head coach",
  assistant_coach: "Assistant coach",
  team_manager: "Team manager",
  athletic_director: "Athletic director",
};
const inputClass = "w-full rounded-lg bg-background hairline elev-inset px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const primaryButton = "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const cardClass = "rounded-xl bg-card hairline elev-rest p-5 sm:p-6";
const formatDate = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId();
  return <div className="grid gap-1.5 text-sm font-medium"><label htmlFor={id}>{label}</label>{React.isValidElement<{ id?: string }>(children) ? React.cloneElement(children, { id }) : children}</div>;
}

function SectionTitle({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return <div>{eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>}<h2 className="text-xl font-semibold">{title}</h2>{detail && <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{detail}</p>}</div>;
}

export default function SchoolLeagueManagement({ leagueId }: { leagueId: string }) {
  const workspaceQuery = useSchoolLeagueWorkspace(leagueId);
  const action = useSchoolLeagueAction(leagueId);
  const workspace = workspaceQuery.data;
  const [pane, setPane] = useState<Pane>("overview");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [editingLeagueName, setEditingLeagueName] = useState(false);
  const [leagueNameDraft, setLeagueNameDraft] = useState("");
  const [leagueNameExpected, setLeagueNameExpected] = useState("");
  const [leagueNameConflict, setLeagueNameConflict] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteKind, setInviteKind] = useState<"staff" | "parent">("staff");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("head_coach");
  const [players, setPlayers] = useState([{ firstName: "", lastName: "", gradYear: String(new Date().getFullYear() + 4), position: "F", jerseyNumber: "" }]);
  const [oneTime, setOneTime] = useState<SchoolLeagueActionResult | null>(null);
  const [teamInviteCode, setTeamInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [scheduleTeamId, setScheduleTeamId] = useState("");
  const [scheduleFormat, setScheduleFormat] = useState<"csv" | "ical">("csv");
  const [scheduleText, setScheduleText] = useState("");
  const [preview, setPreview] = useState<SchedulePreview | null>(null);

  const changePane = (nextPane: Pane) => {
    if (nextPane === pane) return;
    setOneTime(null);
    setPane(nextPane);
  };
  const selectedScheduleTeam = workspace?.teams.some(team => team.id === scheduleTeamId) ? scheduleTeamId : "";
  const previewCurrent = !!preview && preview.teamId === selectedScheduleTeam && preview.format === scheduleFormat && preview.text === scheduleText;

  const runAction = async (path: string, body: unknown, success: string, done?: (result: SchoolLeagueActionResult) => void, failed?: (error: unknown) => void) => {
    setCopied(false);
    setNotice("");
    setNoticeError(false);
    try {
      const result = await action.mutateAsync({ path, body });
      setNotice(success);
      done?.(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't save that change. Please try again.";
      setNotice(message);
      setNoticeError(true);
      failed?.(error);
      if ((error as { data?: { code?: string } })?.data?.code === "LEAGUE_NAME_CHANGED_REFRESH_REQUIRED") setLeagueNameConflict(true);
    }
  };
  const reloadSchool = async (schoolId: string) => {
    const refreshed = await workspaceQuery.refetch();
    const school = refreshed.data?.schools.find(item => item.id === schoolId);
    if (refreshed.isError || !school) {
      throw refreshed.error || new Error("The latest school values could not be loaded. Please retry.");
    }
    return { name: school.name, town: school.town };
  };
  const openLeagueNameEditor = () => {
    setLeagueNameDraft(workspace?.league.name || "");
    setLeagueNameExpected(workspace?.league.name || "");
    setLeagueNameConflict(false);
    setEditingLeagueName(true);
  };
  const reloadLatestLeagueName = async () => {
    try {
      const refreshed = await workspaceQuery.refetch();
      const latestName = refreshed.data?.league.name;
      if (refreshed.isError || !latestName) throw refreshed.error || new Error("The latest league name could not be loaded.");
      setLeagueNameDraft(latestName);
      setLeagueNameExpected(latestName);
      setLeagueNameConflict(false);
      setNotice("");
      setNoticeError(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The latest league name could not be loaded. Please try again.");
      setNoticeError(true);
    }
  };
  const changeSchedule = (field: "team" | "format" | "text", value: string) => {
    setPreview(null);
    if (field === "team") setScheduleTeamId(value);
    if (field === "format") setScheduleFormat(value as "csv" | "ical");
    if (field === "text") setScheduleText(value);
  };
  const decide = (kind: "staff" | "parents", id: string, approve: boolean, teamId?: string) => {
    const body = kind === "staff" ? { approve } : { teamId, approve };
    void runAction(`/${kind}/${encodeURIComponent(id)}/decision`, body, approve ? "Request approved." : "Request declined.");
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error("Choose a schedule file smaller than 500 KB.");
      changeSchedule("text", await file.text());
      if (file.name.toLowerCase().endsWith(".ics")) setScheduleFormat("ical");
      setNotice("");
    } catch (error) {
      setPreview(null);setNoticeError(true);
      setNotice(error instanceof Error ? error.message : "This schedule file could not be read.");
    }
  };
  const copyInvitation = async () => {
    const value = oneTime?.invitation || oneTime?.teamCode;
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        window.prompt("Copy this code to share it manually:", value);
      }
      setCopied(true);
    } catch {
      window.prompt("Copy this code to share it manually:", value);
    }
  };

  if (workspaceQuery.isLoading) return <main className="min-h-[70dvh] bg-background p-5 text-foreground sm:p-8">
    <div className="mx-auto max-w-6xl animate-pulse space-y-5" role="status" aria-label="Loading school league workspace">
      <div className="h-9 w-64 rounded-lg bg-muted" /><div className="h-40 rounded-xl bg-muted" /><div className="h-56 rounded-xl bg-muted" />
    </div>
  </main>;
  if (workspaceQuery.isError || !workspace) return <main className="min-h-[70dvh] bg-background px-5 py-12 text-foreground">
    <section className="mx-auto max-w-xl rounded-xl bg-card hairline elev-rest p-6">
      <p className="text-sm text-muted-foreground">League management</p>
      <h1 className="mt-2 text-2xl font-semibold">Workspace unavailable</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "We couldn’t load this workspace. Check your access or connection and try again."}</p>
      <button className={`${primaryButton} mt-5`} onClick={() => void workspaceQuery.refetch()}>Retry</button>
    </section>
  </main>;

  const staffRequests = workspace.staffRequests;
  const parentRequests = workspace.parentRequests;
  return <main className="min-h-[70dvh] bg-background px-4 pb-16 pt-5 text-foreground sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="rounded-xl bg-primary p-5 text-primary-foreground elev-rest sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-primary-foreground/75">{workspace.league.leagueType === "youth" ? "Youth league" : "High School league"} · League management</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {editingLeagueName ? <form data-testid="league-name-editor" className="flex w-full max-w-xl flex-col gap-3" onSubmit={event => {
                event.preventDefault();
                const trimmedDraft = leagueNameDraft.trim();
                if (action.isPending || leagueNameConflict || !trimmedDraft || trimmedDraft.length > 100) return;
                void runAction("/name", { name: trimmedDraft, expectedName: leagueNameExpected }, "League name updated.", () => {
                  setEditingLeagueName(false);
                  setLeagueNameConflict(false);
                });
              }}>
                <div className="min-w-0 flex-1">
                  <label htmlFor="league-name-input" className="mb-1.5 block text-xs font-semibold text-primary-foreground/80">League name</label>
                  <input id="league-name-input" data-testid="league-name-input" className="w-full rounded-lg bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" value={leagueNameDraft} onChange={event => setLeagueNameDraft(event.target.value)} maxLength={100} required disabled={action.isPending} aria-describedby={leagueNameConflict ? "league-name-conflict-guidance" : undefined} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button data-testid="save-league-name" className="inline-flex items-center justify-center rounded-lg bg-primary-foreground px-4 py-2.5 text-sm font-semibold text-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={action.isPending || leagueNameConflict || !leagueNameDraft.trim() || leagueNameDraft.trim().length > 100}>Save league name</button>
                  <button data-testid="cancel-league-name" className="inline-flex items-center justify-center rounded-lg border border-primary-foreground/30 px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/10 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={action.isPending} onClick={() => { setEditingLeagueName(false); setLeagueNameConflict(false); }}>Cancel</button>
                </div>
                {leagueNameConflict && <div className="w-full rounded-lg border border-primary-foreground/25 bg-primary-foreground/10 p-3 text-sm">
                  <p id="league-name-conflict-guidance">This league name changed elsewhere. Reload the latest name before saving again.</p>
                  <button data-testid="reload-latest-league-name" type="button" className="mt-2 font-semibold underline underline-offset-2 disabled:opacity-50" disabled={action.isPending || workspaceQuery.isFetching} onClick={() => void reloadLatestLeagueName()}>{workspaceQuery.isFetching ? "Loading latest name…" : "Reload latest name"}</button>
                </div>}
              </form> : <>
                <h1 className="text-2xl font-bold sm:text-3xl">{workspace.league.name}</h1>
                <button data-testid="edit-league-name" type="button" aria-label={`Edit league name: ${workspace.league.name}`} className="rounded-md border border-primary-foreground/30 px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground" onClick={openLeagueNameEditor}>Edit name</button>
              </>}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-foreground/80">Manage school programs, teams, staff, family requests, and schedules.</p>
          </div>
          <p className="rounded-lg border border-primary-foreground/20 px-3 py-2 text-sm">{workspace.programs.length} programs · {workspace.teams.length} teams</p>
        </div>
      </header>

      {notice && <div role={noticeError ? "alert" : "status"} className={`mt-4 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${noticeError ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-muted text-foreground"}`}>
        <span>{notice}</span><button aria-label="Dismiss message" className="font-semibold" onClick={() => { setNotice(""); setNoticeError(false); }}>×</button>
      </div>}

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-border" aria-label="League management sections">
        {(["overview", "people", "schedule", "eligibility"] as const).map(item => <button key={item} onClick={() => changePane(item)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium capitalize ${pane === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {item === "people" ? "People & requests" : item === "schedule" ? "Schedule" : item === "eligibility" ? "Eligibility" : "Overview"}
        </button>)}
      </nav>
      {oneTime && (oneTime.invitation || oneTime.teamCode) && <section className="mt-5 rounded-lg border border-border bg-muted p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{oneTime.teamCode ? "Team invite code (shown once)" : "One-time invitation"}</p>
        <code className="mt-2 block break-all rounded-md bg-background p-3 font-mono text-sm">{oneTime.invitation || oneTime.teamCode}</code>
        {oneTime.recipientEmail && <p className="mt-2 text-xs text-muted-foreground">For {oneTime.recipientEmail}{oneTime.expiresAt ? ` · expires ${formatDate(oneTime.expiresAt)}` : ""}</p>}
        <p className="mt-2 text-sm text-muted-foreground">Copy and share this code yourself. RosterHockey has not emailed it. A team invite code is not a child-device setup code.</p>
        <button className={`${secondaryButton} mt-3`} onClick={() => void copyInvitation()}>{copied ? "Copied" : "Copy code"}</button>
      </section>}

      {pane === "overview" && <SchoolSetupWizard
        workspace={workspace}
        isPending={action.isPending}
        runAction={runAction}
        onReloadSchool={reloadSchool}
        teamInviteCode={teamInviteCode}
        onTeamCreated={result => setTeamInviteCode(result.teamCode || "")}
      />}
      {pane === "people" && <section className="mt-6 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <section className={cardClass}>
          <SectionTitle eyebrow="Invite people" title="Create an invitation" detail="Invitations are delivered manually. Copy the one-time invitation and share it with the recipient; no email is sent." />
          {!workspace.teams.length ? <div className="mt-5 rounded-lg border border-dashed border-border p-5 text-center"><p className="font-medium">Create a program and team first</p><button className={`${secondaryButton} mt-3`} onClick={() => changePane("overview")}>Go to organization setup</button></div> : <form className="mt-5 space-y-4" onSubmit={event => {
            event.preventDefault();
            if (!workspace.teams.some(team => team.id === inviteTeamId)) return;
            const body = inviteKind === "staff"
              ? { kind: "staff", teamId: inviteTeamId, email: email.trim(), role }
              : { kind: "parent", teamId: inviteTeamId, email: email.trim(), players: players.map(player => ({ firstName: player.firstName.trim(), lastName: player.lastName.trim(), gradYear: Number(player.gradYear), position: player.position, jerseyNumber: player.jerseyNumber })) };
            void runAction("/invitations", body, "Invitation created. Share it manually with the recipient.", result => { setOneTime(result); setEmail(""); setPlayers([{ firstName: "", lastName: "", gradYear: String(new Date().getFullYear() + 4), position: "F", jerseyNumber: "" }]); });
          }}>
            <Field label="Team"><select className={inputClass} value={inviteTeamId} onChange={event => setInviteTeamId(event.target.value)} required><option value="">Select a team</option>{workspace.teams.map(team => { const program = workspace.programs.find(item => item.id === team.programId); const school = workspace.schools.find(item => item.id === program?.schoolId); return <option key={team.id} value={team.id}>{school ? `${school.name} / ` : "Unlinked school / "}{program?.name || "Program"} / {team.name}</option>; })}</select></Field>
            <Field label="Invite type"><select className={inputClass} value={inviteKind} onChange={event => setInviteKind(event.target.value as "staff" | "parent")}><option value="staff">Staff member</option><option value="parent">Parent and player(s)</option></select></Field>
            <Field label="Recipient email"><input className={inputClass} type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="name@example.com" /></Field>
            {inviteKind === "staff" ? <Field label="Role"><select className={inputClass} value={role} onChange={event => setRole(event.target.value)}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field> : <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">Players (up to 2)</span>{players.length < 2 && <button type="button" className="text-sm font-medium text-primary underline underline-offset-4" onClick={() => setPlayers([...players, { firstName: "", lastName: "", gradYear: String(new Date().getFullYear() + 4), position: "F", jerseyNumber: "" }])}>Add another player</button>}</div>
              {players.map((player, index) => <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3" key={index}>
                <Field label="First name"><input className={inputClass} required maxLength={100} value={player.firstName} onChange={event => setPlayers(players.map((p, i) => i === index ? { ...p, firstName: event.target.value } : p))} /></Field>
                <Field label="Last name"><input className={inputClass} required maxLength={100} value={player.lastName} onChange={event => setPlayers(players.map((p, i) => i === index ? { ...p, lastName: event.target.value } : p))} /></Field>
                <Field label="Grad year"><input className={inputClass} type="number" min="2000" max="2100" required value={player.gradYear} onChange={event => setPlayers(players.map((p, i) => i === index ? { ...p, gradYear: event.target.value } : p))} /></Field>
                <Field label="Position"><select className={inputClass} value={player.position} onChange={event => setPlayers(players.map((p, i) => i === index ? { ...p, position: event.target.value } : p))}><option value="F">Forward</option><option value="D">Defense</option><option value="G">Goalie</option></select></Field>
                <Field label="Jersey #"><input className={inputClass} inputMode="numeric" pattern="\\d{0,2}" maxLength={2} value={player.jerseyNumber} onChange={event => setPlayers(players.map((p, i) => i === index ? { ...p, jerseyNumber: event.target.value.replace(/\D/g, "").slice(0, 2) } : p))} /></Field>
                {players.length > 1 && <button type="button" className="self-end pb-2 text-sm font-medium text-destructive" onClick={() => setPlayers(players.filter((_, i) => i !== index))}>Remove player</button>}
              </div>)}
            </div>}
            <button className={primaryButton} disabled={action.isPending || !inviteTeamId}>Create manual invitation</button>
          </form>}
        </section>

        <section className={cardClass}>
          <SectionTitle eyebrow="Commissioner review" title="Requests to review" detail="Program setup does not auto-approve people. Existing consent and coverage checks still apply." />
          <h3 className="mt-6 text-sm font-semibold">Staff requests <span className="ml-1 text-muted-foreground">{staffRequests.length}</span></h3>
          {staffRequests.length ? <div className="mt-3 space-y-3">{staffRequests.map(request => {
            const own = request.authId === workspace.actorId;
            return <article key={request.id} className="rounded-lg bg-background hairline elev-rest p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{request.name}</p><p className="mt-1 text-sm text-muted-foreground">{roles[request.role] || request.role} · {request.school}{request.teamName ? ` · ${request.teamName}` : ""}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Pending</span></div>
              {own && <p className="mt-3 text-sm text-destructive">You can’t approve your own request.</p>}
              <div className="mt-4 flex gap-2"><button className={primaryButton} disabled={own || action.isPending} onClick={() => decide("staff", request.id, true)}>Approve</button><button className={secondaryButton} disabled={own || action.isPending} onClick={() => decide("staff", request.id, false)}>Decline</button></div>
            </article>;
          })}</div> : <p className="mt-3 rounded-lg bg-muted p-4 text-sm text-muted-foreground">No staff requests need review.</p>}
          <h3 className="mt-7 text-sm font-semibold">Parent requests <span className="ml-1 text-muted-foreground">{parentRequests.length}</span></h3>
          {parentRequests.length ? <div className="mt-3 space-y-3">{parentRequests.map(request => {
            const own = request.parentAuthId === workspace.actorId;
            const teamExists = workspace.teams.some(team => team.id === request.teamId);
            return <article key={request.id} className="rounded-lg bg-background hairline elev-rest p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{request.firstName} {request.lastName}</p><p className="mt-1 text-sm text-muted-foreground">{request.teamName}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Pending</span></div>
              {own && <p className="mt-3 text-sm text-destructive">You can’t approve your own request.</p>}
              <div className="mt-4 flex gap-2"><button className={primaryButton} disabled={own || action.isPending || !teamExists} onClick={() => decide("parents", request.id, true, request.teamId)}>Approve</button><button className={secondaryButton} disabled={own || action.isPending || !teamExists} onClick={() => decide("parents", request.id, false, request.teamId)}>Decline</button></div>
            </article>;
          })}</div> : <p className="mt-3 rounded-lg bg-muted p-4 text-sm text-muted-foreground">No parent requests need review.</p>}
        </section>
      </section>}

      {pane === "schedule" && <section className="mt-6 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className={cardClass}>
          <SectionTitle eyebrow="Season calendar" title="Import a team schedule" detail="Preview every row before import. Nothing is saved until a clean preview is confirmed." />
          {!workspace.teams.length ? <div className="mt-5 rounded-lg border border-dashed border-border p-5 text-center"><p className="font-medium">A team is needed before scheduling</p><button className={`${secondaryButton} mt-3`} onClick={() => changePane("overview")}>Create a program and team</button></div> : <div className="mt-5 space-y-4">
            <Field label="Team"><select className={inputClass} value={scheduleTeamId} onChange={event => changeSchedule("team", event.target.value)} required><option value="">Select a team</option>{workspace.teams.map(team => { const program = workspace.programs.find(item => item.id === team.programId); const school = workspace.schools.find(item => item.id === program?.schoolId); return <option key={team.id} value={team.id}>{school ? `${school.name} / ` : "Unlinked school / "}{program?.name || "Program"} / {team.name}</option>; })}</select></Field>
            <Field label="File format"><select className={inputClass} value={scheduleFormat} onChange={event => changeSchedule("format", event.target.value)}><option value="csv">CSV</option><option value="ical">iCalendar (.ics)</option></select></Field>
            {scheduleFormat === "csv" ? <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">Required CSV headers: <code className="font-mono">title, startsAt</code>. Optional: <code className="font-mono">opponent, rink, address</code>. Include a timezone offset in each start time, for example <code className="font-mono">2026-10-12T18:30:00-04:00</code>.</p> : <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">iCalendar must contain timed events with UTC <code className="font-mono">DTSTART</code>. Local/TZID, all-day, and recurring events need to be expanded or exported as UTC timed events first.</p>}
            <Field label="Choose a schedule file"><input className={inputClass} type="file" accept={scheduleFormat === "csv" ? ".csv,text/csv" : ".ics,text/calendar"} onChange={event => void loadFile(event.target.files?.[0])} /></Field>
            <Field label="Or paste schedule text"><textarea className={`${inputClass} min-h-40 resize-y font-mono text-xs`} value={scheduleText} onChange={event => changeSchedule("text", event.target.value)} placeholder={scheduleFormat === "csv" ? "title,startsAt,opponent,rink,address\nHome opener,2026-10-12T18:30:00-04:00,East Ridge,North Arena,12 Main St" : "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Home opener\nDTSTART:20261012T223000Z\nLOCATION:North Arena\nEND:VEVENT\nEND:VCALENDAR"} /></Field>
            <button className={primaryButton} disabled={action.isPending || !selectedScheduleTeam || !scheduleText.trim()} onClick={() => {
              setPreview(null);
              void runAction("/schedule/preview", { teamId: selectedScheduleTeam, format: scheduleFormat, text: scheduleText }, "Schedule preview ready.", result => setPreview({ teamId: selectedScheduleTeam, format: scheduleFormat, text: scheduleText, result }));
            }}>Preview schedule</button>
          </div>}
        </section>
        <section className={cardClass}>
          <SectionTitle eyebrow="Validation" title="Preview before saving" />
          {!previewCurrent ? <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted px-6 text-center">
            <p className="font-medium">No current preview</p><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Choose a team and preview your source. Changing the team, format, or source clears the preview.</p>
          </div> : <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-lg bg-muted px-3 py-2">{preview.result.rows?.length || 0} valid event rows</span><span className={`rounded-lg px-3 py-2 ${preview.result.errors?.length ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}`}>{preview.result.errors?.length || 0} issues</span></div>
            {!!preview.result.errors?.length && <div className="max-h-48 overflow-auto rounded-lg border border-destructive/30 bg-destructive/10 p-4"><h3 className="text-sm font-semibold text-destructive">Fix these issues before importing</h3><ul className="mt-2 space-y-2 text-sm text-destructive">{preview.result.errors.map((error, index) => <li key={`${error.row}-${index}`}><span className="font-mono font-semibold">Row {error.row}:</span> {error.message}</li>)}</ul></div>}
            <div className="max-h-[24rem] overflow-auto rounded-lg border border-border"><table className="w-full min-w-[520px] border-collapse text-left text-xs"><thead className="sticky top-0 bg-muted text-muted-foreground"><tr>{["Event", "Opponent", "Date & time", "Rink"].map(header => <th className="px-3 py-2.5 font-semibold" key={header}>{header}</th>)}</tr></thead><tbody>{preview.result.rows?.map((row, index) => <tr className="border-t border-border" key={`${row.title}-${index}`}><td className="px-3 py-2.5 font-medium">{row.title}</td><td className="px-3 py-2.5">{row.opponent || "—"}</td><td className="px-3 py-2.5">{formatDate(row.startsAt)}</td><td className="px-3 py-2.5">{row.rink || "—"}</td></tr>)}</tbody></table></div>
            <p className="text-xs text-muted-foreground">Import is available only when at least one valid row is present and there are no preview errors.</p>
            <button className={primaryButton} disabled={!previewCurrent || !!preview.result.errors?.length || !preview.result.rows?.length || action.isPending || !workspace.teams.some(team => team.id === preview.teamId)} onClick={() => {
              if (!previewCurrent || !preview || preview.result.errors?.length || !preview.result.rows?.length) return;
              const submitted = preview;
              void runAction("/schedule/import", { teamId: submitted.teamId, rows: submitted.result.rows }, "Schedule imported.", result => {
                setNotice(`${result.count ?? submitted.result.rows?.length ?? 0} events saved.${result.notification?.pending ? ` ${result.notification.pending} notification${result.notification.pending === 1 ? "" : "s"} pending testing transport; no notifications were delivered.` : ""}`);
                setPreview(null);
                setScheduleText("");
              });
            }}>Import {preview.result.rows?.length || 0} events</button>
          </div>}
        </section>
      </section>}

      {pane === "eligibility" && <section className="mt-6">
        <PlayerEligibilityPanel mode="league" id={leagueId} />
      </section>}

      {action.isPending && <div aria-live="polite" className="fixed bottom-5 right-5 z-20 rounded-lg bg-card hairline elev-lift px-4 py-3 text-sm text-foreground">Saving changes…</div>}
    </div>
  </main>;
}

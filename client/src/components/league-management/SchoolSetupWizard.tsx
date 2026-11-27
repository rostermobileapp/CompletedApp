import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { SchoolStructureDeleteControl } from "./SchoolStructureDeleteControl";
import type { SchoolLeagueActionResult, SchoolLeagueWorkspace } from "@shared/schoolLeagueManagement";

type Step = "school" | "program" | "team";
type Direction = "forward" | "backward";
type WorkspaceSchool = SchoolLeagueWorkspace["schools"][number] & {
  canEdit?: boolean;
  canDelete?: boolean;
  deleteBlockedReason?: string;
};
type ActionRunner = (
  path: string,
  body: unknown,
  success: string,
  done?: (result: SchoolLeagueActionResult) => void,
  failed?: (error: unknown) => void,
) => Promise<void>;
type SchoolEditValues = { name: string; town: string };
type DeletionPreview = {
  school: { id: string; name: string; town: string };
  programCount: number;
  teamCount: number;
  programIds: string[];
  teamIds: string[];
};

const inputClass = "w-full rounded-lg bg-background hairline elev-inset px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const primaryButton = "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const steps: { id: Step; label: string; title: string; description: string }[] = [
  { id: "school", label: "School", title: "Add a school", description: "Create and manage shared school identities." },
  { id: "program", label: "Program", title: "Add a program", description: "Attach hockey programs to their school." },
  { id: "team", label: "Team", title: "Create a team", description: "Add a team to a school program." },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId();
  return <div className="grid gap-1.5 text-sm font-medium"><label htmlFor={id}>{label}</label>{React.isValidElement<{ id?: string }>(children) ? React.cloneElement(children, { id }) : children}</div>;
}

function StepContent({
  step, direction, workspace, isPending, runAction, onStep, onTeamCreated, teamInviteCode, onReloadSchool,
}: {
  step: Step;
  direction: Direction;
  workspace: SchoolLeagueWorkspace;
  isPending: boolean;
  runAction: ActionRunner;
  onStep: (step: Step) => void;
  onTeamCreated: (result: SchoolLeagueActionResult) => void;
  teamInviteCode: string;
  onReloadSchool: (schoolId: string) => Promise<SchoolEditValues>;
}) {
  const schools = workspace.schools as WorkspaceSchool[];
  const [schoolName, setSchoolName] = useState("");
  const [schoolTown, setSchoolTown] = useState("");
  const [editingSchool, setEditingSchool] = useState<{ id: string; name: string; town: string; expectedName: string; expectedTown: string } | null>(null);
  const [schoolEditConflictId, setSchoolEditConflictId] = useState("");
  const [schoolReloadingId, setSchoolReloadingId] = useState("");
  const [schoolReloadError, setSchoolReloadError] = useState("");
  const [deletingSchoolId, setDeletingSchoolId] = useState("");
  const [typedSchoolName, setTypedSchoolName] = useState("");
  const [programName, setProgramName] = useState("");
  const [programSchoolId, setProgramSchoolId] = useState("");
  const [editingProgram, setEditingProgram] = useState<{ id: string; name: string; schoolId: string } | null>(null);
  const [teamSchoolId, setTeamSchoolId] = useState("");
  const [teamProgramId, setTeamProgramId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamCodeCopied, setTeamCodeCopied] = useState(false);
  const reducedMotion = useReducedMotion();

  const previewQuery = useQuery<DeletionPreview>({
    queryKey: ["school-league-management", workspace.league.id, "school-deletion-preview", deletingSchoolId],
    enabled: !!deletingSchoolId,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await apiRequest(
        "GET",
        `/api/high-school/leagues/${encodeURIComponent(workspace.league.id)}/management/schools/${encodeURIComponent(deletingSchoolId)}/deletion-preview`,
        undefined,
        signal,
      );
      const data = await response.json();
      if (
        !data?.school ||
        typeof data.school.id !== "string" ||
        typeof data.school.name !== "string" ||
        typeof data.school.town !== "string" ||
        !Number.isFinite(data.programCount) ||
        !Number.isFinite(data.teamCount) ||
        !Array.isArray(data.programIds) ||
        !Array.isArray(data.teamIds)
      ) {
        throw new Error("The deletion preview response was incomplete. Reload the preview before continuing.");
      }
      return data as DeletionPreview;
    },
  });

  const programSchool = (programId: string) => schools.find(school => school.id === workspace.programs.find(program => program.id === programId)?.schoolId);
  const teamPrograms = workspace.programs.filter(program => !!program.schoolId && program.schoolId === teamSchoolId);

  return <motion.div
    key={step}
    variants={{
      enter: (travel: Direction) => ({ opacity: 0, x: reducedMotion ? 0 : travel === "forward" ? "100%" : "-100%" }),
      center: { opacity: 1, x: 0 },
      exit: (travel: Direction) => ({ opacity: 0, x: reducedMotion ? 0 : travel === "forward" ? "-100%" : "100%" }),
    }}
    initial="enter"
    animate="center"
    exit="exit"
    custom={direction}
    transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
    data-step-content={step}
    className="space-y-5"
  >
    {step === "school" && <>
      <section className="rounded-xl bg-card hairline elev-rest p-5 sm:p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 1</p>
        <h2 className="text-xl font-semibold">Add a school</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Schools you administer can be reused across leagues.</p>
        <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => {
          event.preventDefault();
          void runAction("/schools", { name: schoolName.trim(), town: schoolTown.trim() }, "School added.", () => {
            setSchoolName("");
            setSchoolTown("");
          });
        }}>
          <Field label="School name"><input className={inputClass} value={schoolName} onChange={event => setSchoolName(event.target.value)} required maxLength={100} /></Field>
          <Field label="Town"><input className={inputClass} value={schoolTown} onChange={event => setSchoolTown(event.target.value)} required maxLength={100} /></Field>
          <button className={primaryButton} type="submit" disabled={isPending || !schoolName.trim() || !schoolTown.trim()}>Add school</button>
        </form>
      </section>
      <section className="rounded-xl bg-card hairline elev-rest p-5 sm:p-6" aria-label="Existing schools">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schools</p><h2 className="text-lg font-semibold">Existing schools</h2></div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{schools.length} total</span>
        </div>
        {!schools.length ? <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/50 p-5 text-sm text-muted-foreground">No schools in this workspace yet.</p> : <ul className="mt-4 divide-y divide-border">
          {schools.map(school => {
            const canEdit = school.canEdit === true;
            const canDelete = school.canDelete === true;
            const isEditing = editingSchool?.id === school.id;
            return <li key={school.id} className="py-4 first:pt-0 last:pb-0">
              {isEditing ? <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" onSubmit={event => {
                event.preventDefault();
                if (!editingSchool.name.trim() || !editingSchool.town.trim()) return;
                void runAction(`/schools/${encodeURIComponent(school.id)}`, {
                  name: editingSchool.name.trim(),
                  town: editingSchool.town.trim(),
                  expectedName: editingSchool.expectedName,
                  expectedTown: editingSchool.expectedTown,
                }, "School updated.", () => {
                  setEditingSchool(null);
                  setSchoolEditConflictId("");
                  setSchoolReloadError("");
                }, () => setSchoolEditConflictId(school.id));
              }}>
                <Field label="School name"><input className={inputClass} value={editingSchool.name} onChange={event => setEditingSchool({ ...editingSchool, name: event.target.value })} required maxLength={100} /></Field>
                <Field label="Town"><input className={inputClass} value={editingSchool.town} onChange={event => setEditingSchool({ ...editingSchool, town: event.target.value })} required maxLength={100} /></Field>
                <button className={primaryButton} type="submit" disabled={isPending || !editingSchool.name.trim() || !editingSchool.town.trim()}>Save</button>
                <button className={secondaryButton} type="button" disabled={isPending} onClick={() => { setEditingSchool(null); setSchoolEditConflictId(""); setSchoolReloadError(""); }}>Cancel</button>
                <button className={`${secondaryButton} border-destructive/30 text-destructive hover:bg-destructive/10`} type="button" disabled={!canDelete || isPending} title={!canDelete ? (school.deleteBlockedReason || "You do not have permission to delete this shared school.") : undefined} onClick={() => {
                  setDeletingSchoolId(school.id);
                  setTypedSchoolName("");
                }}>Delete</button>
              </form> : <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0"><h3 className="font-semibold">{school.name}</h3><p className="mt-1 text-sm text-muted-foreground">{school.town}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <button className={secondaryButton} type="button" disabled={!canEdit || isPending} title={!canEdit ? (school.deleteBlockedReason || "You do not have permission to edit this shared school.") : undefined} onClick={() => {
                    setEditingSchool({ id: school.id, name: school.name, town: school.town, expectedName: school.name, expectedTown: school.town });
                    setSchoolEditConflictId("");
                    setSchoolReloadError("");
                  }}>Edit</button>
                  <button className={`${secondaryButton} border-destructive/30 text-destructive hover:bg-destructive/10`} type="button" disabled={!canDelete || isPending} title={!canDelete ? (school.deleteBlockedReason || "You do not have permission to delete this shared school.") : undefined} onClick={() => {
                    setDeletingSchoolId(school.id);
                    setTypedSchoolName("");
                  }}>Delete</button>
                </div>
              </div>}
              {!canEdit && <p className="mt-2 text-xs text-muted-foreground">{school.deleteBlockedReason || "Editing is unavailable because you do not administer this shared school."}</p>}
              {!canDelete && school.deleteBlockedReason && <p className="mt-1 text-xs text-muted-foreground">{school.deleteBlockedReason}</p>}
              {schoolEditConflictId === school.id && isEditing && <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm">
                <p className="font-medium">This school may have changed since you opened it. Your save was not applied.</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Reload the latest values to review them, or cancel and choose Edit again. The expected values stay unchanged until you deliberately reload or reopen.</p>
                {schoolReloadError && <p className="mt-2 text-xs text-destructive" role="alert">{schoolReloadError}</p>}
                <button className={`${secondaryButton} mt-3`} type="button" disabled={schoolReloadingId === school.id || isPending} onClick={async () => {
                  setSchoolReloadingId(school.id);
                  setSchoolReloadError("");
                  try {
                    const latest = await onReloadSchool(school.id);
                    setEditingSchool({ id: school.id, name: latest.name, town: latest.town, expectedName: latest.name, expectedTown: latest.town });
                    setSchoolEditConflictId("");
                  } catch (error) {
                    setSchoolReloadError(error instanceof Error ? error.message : "The latest school values could not be loaded. Please retry.");
                  } finally {
                    setSchoolReloadingId("");
                  }
                }}>{schoolReloadingId === school.id ? "Loading latest…" : "Reload latest"}</button>
              </div>}
              {deletingSchoolId === school.id && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="dialog" aria-modal="true" aria-labelledby={`delete-school-title-${school.id}`}>
                <h4 id={`delete-school-title-${school.id}`} className="font-semibold text-destructive">Delete {school.name}?</h4>
                {previewQuery.isFetching ? <div className="mt-3 space-y-2" role="status" aria-label="Loading deletion preview"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="h-4 w-1/2 animate-pulse rounded bg-muted" /></div>
                  : previewQuery.isError ? <div className="mt-3 space-y-3">
                    <p className="text-sm text-destructive">The deletion preview could not be loaded. No records have been deleted.</p>
                    <button className={secondaryButton} type="button" onClick={() => void previewQuery.refetch()}>Retry preview</button>
                  </div>
                  : previewQuery.data && previewQuery.data.school.id === school.id ? <>
                    <p className="mt-2 text-sm leading-6">This permanently deletes the school and all {previewQuery.data.programCount} linked program{previewQuery.data.programCount === 1 ? "" : "s"} and {previewQuery.data.teamCount} linked team{previewQuery.data.teamCount === 1 ? "" : "s"}. Membership access will be removed. User and child accounts, and parent-child access, will be retained.</p>
                    <p className="mt-3 text-sm font-medium">Type <span className="font-semibold">{previewQuery.data.school.name}</span> to confirm.</p>
                    <input className={`${inputClass} mt-2`} aria-label="Type school name to confirm deletion" value={typedSchoolName} onChange={event => setTypedSchoolName(event.target.value)} autoComplete="off" />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className={`${secondaryButton} border-destructive/30 text-destructive hover:bg-destructive/10`} type="button" disabled={isPending || typedSchoolName !== previewQuery.data.school.name} onClick={() => {
                        const data = previewQuery.data!;
                        void runAction(`/schools/${encodeURIComponent(school.id)}/delete`, {
                          expectedName: data.school.name,
                          expectedTown: data.school.town,
                          programIds: data.programIds,
                          teamIds: data.teamIds,
                          confirmation: typedSchoolName,
                        }, "School and linked records deleted.", () => {
                          setDeletingSchoolId("");
                          setTypedSchoolName("");
                        });
                      }}>Delete school and linked records</button>
                      <button className={secondaryButton} type="button" disabled={previewQuery.isFetching || isPending} onClick={() => { setTypedSchoolName(""); void previewQuery.refetch(); }}>Reload preview</button>
                      <button className={secondaryButton} type="button" disabled={isPending} onClick={() => { setDeletingSchoolId(""); setTypedSchoolName(""); }}>Cancel</button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">If deletion reports a conflict, reload the preview before trying again.</p>
                  </> : <p className="mt-3 text-sm text-muted-foreground">Loading the current deletion preview…</p>}
              </div>}
            </li>;
          })}
        </ul>}
      </section>
    </>}

    {step === "program" && <>
      <section className="rounded-xl bg-card hairline elev-rest p-5 sm:p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 2</p>
        <h2 className="text-xl font-semibold">Add a program</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Choose the school that this program belongs to.</p>
        {!schools.length ? <div className="mt-5 rounded-lg bg-muted p-4 text-sm">
          <p className="text-muted-foreground">A school is needed before a program can be added.</p>
          <button className={`${secondaryButton} mt-3`} type="button" onClick={() => onStep("school")}>Go to School step</button>
        </div> : <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => {
          event.preventDefault();
          void runAction("/programs", { name: programName.trim(), schoolId: programSchoolId }, "Program created.", () => {
            setProgramName("");
            setProgramSchoolId("");
          });
        }}>
          <Field label="School for this program"><select className={inputClass} value={programSchoolId} onChange={event => setProgramSchoolId(event.target.value)} required><option value="">Select a school</option>{schools.map(school => <option key={school.id} value={school.id}>{school.name} · {school.town}</option>)}</select></Field>
          <Field label="Program name"><input className={inputClass} value={programName} onChange={event => setProgramName(event.target.value)} required maxLength={100} /></Field>
          <button className={primaryButton} type="submit" disabled={isPending || !programName.trim() || !programSchoolId}>Add program</button>
        </form>}
      </section>
      <section className="rounded-xl bg-card hairline elev-rest p-5 sm:p-6" aria-label="Existing programs">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Programs</p><h2 className="text-lg font-semibold">Existing programs</h2></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{workspace.programs.length} total</span></div>
        {!workspace.programs.length ? <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/50 p-5 text-sm text-muted-foreground">No programs in this workspace yet.</p> : <ul className="mt-4 divide-y divide-border">
          {workspace.programs.map(program => {
            const linkedSchool = program.schoolId ? schools.find(school => school.id === program.schoolId) : undefined;
            const isEditing = editingProgram?.id === program.id;
            const draft = isEditing ? editingProgram : { id: program.id, name: program.name, schoolId: program.schoolId || "" };
            return <li key={program.id} className="py-4 first:pt-0 last:pb-0">
              <form className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end" onSubmit={event => {
                event.preventDefault();
                if (!draft.name.trim() || !draft.schoolId) return;
                void runAction(`/programs/${encodeURIComponent(program.id)}`, { name: draft.name.trim(), schoolId: draft.schoolId }, linkedSchool ? "Program updated." : "Program linked to school.", () => setEditingProgram(null));
              }}>
                <Field label="Program name"><input className={inputClass} value={draft.name} onFocus={() => setEditingProgram(draft)} onChange={event => setEditingProgram({ ...draft, name: event.target.value })} required maxLength={100} /></Field>
                <Field label={`School for ${program.name}`}><select className={inputClass} value={draft.schoolId} onFocus={() => setEditingProgram(draft)} onChange={event => setEditingProgram({ ...draft, schoolId: event.target.value })} required><option value="">Select a school</option>{schools.map(school => <option key={school.id} value={school.id}>{school.name} · {school.town}</option>)}</select></Field>
                <button className={secondaryButton} type="submit" disabled={isPending || !draft.name.trim() || !draft.schoolId || !isEditing}>{linkedSchool ? "Save program" : "Link program to school"}</button>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">{linkedSchool ? `Linked to ${linkedSchool.name} · ${program.status.replace(/_/g, " ")}` : "Needs a school link · existing teams remain with this program."}</p>
              <SchoolStructureDeleteControl leagueId={workspace.league.id} kind="program" id={program.id}
                name={program.name} isPending={isPending} runAction={runAction}/>
              {!schools.length && <div className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">Add a school before this program can be linked. <button className="font-medium text-primary underline underline-offset-2" type="button" onClick={() => onStep("school")}>Go to School step</button></div>}
            </li>;
          })}
        </ul>}
      </section>
    </>}

    {step === "team" && <>
      <section className="rounded-xl bg-card hairline elev-rest p-5 sm:p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 3</p>
        <h2 className="text-xl font-semibold">Create a team</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Select a school, then one of its programs.</p>
        {!schools.length ? <div className="mt-5 rounded-lg bg-muted p-4 text-sm text-muted-foreground">Add a school before creating a team. <button className="font-medium text-primary underline underline-offset-2" type="button" onClick={() => onStep("school")}>Go to School step</button></div>
          : !workspace.programs.some(program => !!program.schoolId) ? <div className="mt-5 rounded-lg bg-muted p-4 text-sm text-muted-foreground">A linked program is needed before creating a team. <button className="font-medium text-primary underline underline-offset-2" type="button" onClick={() => onStep("program")}>Go to Program step</button></div>
            : <form className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end" onSubmit={event => {
              event.preventDefault();
              if (!teamProgramId || !teamName.trim()) return;
              void runAction("/teams", { programId: teamProgramId, name: teamName.trim() }, "Team created.", result => {
                setTeamName("");
                  setTeamCodeCopied(false);
                onTeamCreated(result);
              });
            }}>
              <Field label="School for this team"><select className={inputClass} value={teamSchoolId} onChange={event => { setTeamSchoolId(event.target.value); setTeamProgramId(""); }} required><option value="">Select a school</option>{schools.map(school => <option key={school.id} value={school.id}>{school.name} · {school.town}</option>)}</select></Field>
              <Field label="Program for this team"><select className={inputClass} value={teamProgramId} onChange={event => setTeamProgramId(event.target.value)} required disabled={!teamSchoolId}><option value="">Select a program</option>{teamPrograms.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></Field>
              <Field label="Team name"><input className={inputClass} value={teamName} onChange={event => setTeamName(event.target.value)} required maxLength={100} /></Field>
              <button className={primaryButton} type="submit" disabled={isPending || !teamProgramId || !teamName.trim()}>Add team</button>
            </form>}
        {teamSchoolId && !teamPrograms.length && <p className="mt-3 text-sm text-muted-foreground">No linked programs for this school. Add or repair a program in the Program step. <button className="font-medium text-primary underline underline-offset-2" type="button" onClick={() => onStep("program")}>Go to Program step</button></p>}
        {teamInviteCode && <div className="mt-4 rounded-lg border border-border bg-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team invite code · shown once</p>
          <code className="mt-2 block break-all rounded-md bg-background p-3 font-mono text-sm">{teamInviteCode}</code>
          <p className="mt-2 text-sm text-muted-foreground">Copy and share this code yourself. RosterHockey has not emailed it.</p>
          <button className={`${secondaryButton} mt-3`} type="button" onClick={async () => {
            try {
              if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(teamInviteCode);
              else window.prompt("Copy this code to share it manually:", teamInviteCode);
              setTeamCodeCopied(true);
            } catch {
              window.prompt("Copy this code to share it manually:", teamInviteCode);
            }
          }}>{teamCodeCopied ? "Copied" : "Copy code"}</button>
        </div>}
      </section>
      <section className="rounded-xl bg-card hairline elev-rest p-5 sm:p-6" aria-label="Existing teams">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Teams</p><h2 className="text-lg font-semibold">Existing teams</h2></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{workspace.teams.length} total</span></div>
        {!workspace.teams.length ? <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/50 p-5 text-sm text-muted-foreground">No teams in this workspace yet.</p> : <ul className="mt-4 divide-y divide-border">
          {workspace.teams.map(team => {
            const program = workspace.programs.find(item => item.id === team.programId);
            const school = program ? programSchool(program.id) : undefined;
            return <li key={team.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{team.name}</span><span className="text-sm text-muted-foreground">{school ? `${school.name} / ` : "Unlinked school / "}{program?.name || "Program"}</span></div>
              <SchoolStructureDeleteControl leagueId={workspace.league.id} kind="team" id={team.id}
                name={team.name} isPending={isPending} runAction={runAction}/>
            </li>;
          })}
        </ul>}
      </section>
    </>}
  </motion.div>;
}

export function SchoolSetupWizard({
  workspace, isPending, runAction, onReloadSchool, teamInviteCode, onTeamCreated,
}: {
  workspace: SchoolLeagueWorkspace;
  isPending: boolean;
  runAction: ActionRunner;
  onReloadSchool: (schoolId: string) => Promise<SchoolEditValues>;
  teamInviteCode: string;
  onTeamCreated: (result: SchoolLeagueActionResult) => void;
}) {
  const [selectedStep, setSelectedStep] = useState<Step>("school");
  const [direction, setDirection] = useState<Direction>("forward");
  const chooseStep = (step: Step) => {
    const currentIndex = steps.findIndex(item => item.id === selectedStep);
    const nextIndex = steps.findIndex(item => item.id === step);
    if (step === selectedStep) return;
    setDirection(nextIndex > currentIndex ? "forward" : "backward");
    setSelectedStep(step);
  };
  const stepIndex = steps.findIndex(item => item.id === selectedStep);
  const current = steps[stepIndex];
  const countFor = (step: Step) => step === "school" ? workspace.schools.length : step === "program" ? workspace.programs.length : workspace.teams.length;

  return <section className="mt-6 space-y-5" aria-label="School, program, and team setup">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {steps.map((step, index) => {
        const selected = selectedStep === step.id;
        return <button
          key={step.id}
          type="button"
          data-testid={`setup-count-${step.id}`}
          data-state={selected ? "selected" : "unselected"}
          aria-current={selected ? "step" : undefined}
          aria-label={`${step.label} step`}
          onClick={() => chooseStep(step.id)}
          className={`min-w-0 rounded-xl border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border hover:bg-muted"}`}
        >
          <span className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">0{index + 1} · {step.label}</span><span className={`font-mono text-2xl font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{countFor(step.id)}</span></span>
          <span className="mt-2 block font-semibold">{step.title}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{countFor(step.id)} {step.id === "school" ? "schools" : step.id === "program" ? "programs" : "teams"} added</span>
        </button>;
      })}
    </div>
    <section
      data-testid="school-setup-panel"
      data-step={selectedStep}
      data-direction={direction}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-muted/40 p-3 sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup · Step {stepIndex + 1} of 3</p><h2 className="mt-1 text-lg font-semibold">{current.title}</h2></div>
        <p className="text-xs text-muted-foreground">Click another step at any time.</p>
      </header>
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <StepContent
          key={selectedStep}
          step={selectedStep}
          direction={direction}
          workspace={workspace}
          isPending={isPending}
          runAction={runAction}
          onStep={chooseStep}
          onTeamCreated={onTeamCreated}
          teamInviteCode={selectedStep === "team" ? teamInviteCode : ""}
          onReloadSchool={onReloadSchool}
        />
      </AnimatePresence>
      <footer className="mt-5 flex items-center justify-between gap-3 border-t border-border px-1 pt-4">
        <button className={secondaryButton} type="button" disabled={stepIndex === 0} onClick={() => chooseStep(steps[stepIndex - 1].id)}>Back</button>
        <span className="text-xs text-muted-foreground">{stepIndex + 1} / {steps.length}</span>
        <button className={secondaryButton} type="button" disabled={stepIndex === steps.length - 1} onClick={() => chooseStep(steps[stepIndex + 1].id)}>Next</button>
      </footer>
    </section>
  </section>;
}

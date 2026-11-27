import { Check, Search, ShieldCheck } from "lucide-react";
import { Field, ScreenFrame, StepHeader } from "./shared";

export const staffRoles = [
  ["head_coach", "Head Coach", "Runs the team. Approved by your AD or league admin."],
  ["assistant_coach", "Assistant Coach", "Approved by your head coach or AD."],
  ["athletic_director", "Athletic Director", "Oversees every team at your school. Approved by your league admin."],
  ["team_manager", "Team Manager", "Handles schedule, rinks and payments. Approved by your head coach or AD."],
] as const;

export function StaffRoleScreen({ role, setRole, onBack, onContinue, busy }: {
  role: string; setRole: (v: string) => void; onBack: () => void; onContinue: () => void; busy?: boolean;
}) {
  return <ScreenFrame header={<StepHeader step={1} total={4} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!role || busy} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>What's your role?</h1><p className="hsy-subtitle">Your role decides what you can see and who approves you.</p>
      <div className="hsy-stack">{staffRoles.map(([id, title, details]) => <button key={id} type="button" className={`hsy-choice${role === id ? " selected" : ""}`} onClick={() => setRole(id)} aria-pressed={role === id}>
        <span className="hsy-choice-icon"><ShieldCheck size={25}/></span><span className="hsy-choice-copy"><strong>{title}</strong><small>{details}</small></span>{role === id && <Check className="hsy-check" size={20}/>}
      </button>)}</div>
    </section>
  </ScreenFrame>;
}

export function FindSchoolScreen({ search, setSearch, programs, selectedProgram, selectProgram, onBack, onContinue, loading, onRetry, onAddSchool }: {
  search: string; setSearch: (v: string) => void; programs: any[]; selectedProgram: string; selectProgram: (v: string) => void;
  onBack: () => void; onContinue: () => void; loading?: boolean; onRetry?: () => void; onAddSchool?: () => void;
}) {
  return <ScreenFrame header={<StepHeader step={2} total={4} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!selectedProgram || loading} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>Find your school</h1><p className="hsy-subtitle">Search by school, co-op or town.</p>
      <label className="hsy-label">School or co-op<span className="hsy-row" style={{position:"relative"}}><Search size={19} color="#64748b" style={{position:"absolute",left:14}}/><input className="hsy-field" style={{paddingLeft:42}} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by school or town"/></span></label>
      {loading ? <div className="hsy-stack" aria-label="Loading schools"><div className="hsy-card tint" style={{height:72}}/><div className="hsy-card tint" style={{height:72}}/></div>
        : <div className="hsy-list">{programs.map(program => <button type="button" key={program.id} className={`hsy-list-row${selectedProgram === program.id ? " hsy-card selected" : ""}`} onClick={() => selectProgram(program.id)} style={{textAlign:"left",background:selectedProgram===program.id?"#eff6ff":"#fff",cursor:"pointer"}}>
          <span><strong>{program.name}</strong><small style={{display:"block",color:"#64748b"}}>{program.town} · {program.teams?.length ?? 0} teams</small></span>{selectedProgram===program.id&&<Check className="hsy-check" size={20}/>}
        </button>)}
        {!programs.length && <div className="hsy-card tint"><p style={{margin:"0 0 10px"}}>No matching school fixtures were found.</p>{onRetry&&<button className="hsy-secondary" onClick={onRetry}>Try again</button>}</div>}</div>}
      {onAddSchool&&<button className="hsy-secondary" style={{width:"100%",marginTop:20}} onClick={onAddSchool}>Add your school · Head coaches and ADs only</button>}
    </section>
  </ScreenFrame>;
}

export function StaffInvitationScreen({ invitation, setInvitation, onBack, onContinue, onAddSchool, busy }: {
  invitation: string; setInvitation: (value: string) => void; onBack: () => void; onContinue: () => void;
  onAddSchool?: () => void; busy?: boolean;
}) {
  return <ScreenFrame header={<StepHeader step={2} total={4} onBack={onBack}/>}
    action={<button className="hsy-primary" disabled={!invitation.trim() || busy} onClick={onContinue}>Use invitation</button>}>
    <section className="hsy-content"><h1>Join with an invitation</h1>
      <p className="hsy-subtitle">High School and Youth teams are invite-only. Ask your head coach, athletic director or league admin for an invitation.</p>
      <Field label="Invitation code" value={invitation} onChange={setInvitation} placeholder="Enter your invitation code"/>
      <div className="hsy-card tint" style={{marginTop:18}}>Your invitation must match your account. Team IDs and school searches cannot be used to request access.</div>
      {onAddSchool && <button className="hsy-secondary" style={{width:"100%",marginTop:20}} onClick={onAddSchool}>Set up a new school</button>}
    </section>
  </ScreenFrame>;
}

export function PickTeamScreen({ program, teamId, setTeamId, roleName, onBack, onContinue, busy }: {
  program?: any; teamId: string; setTeamId: (v: string) => void; roleName: string; onBack: () => void; onContinue: () => void; busy?: boolean;
}) {
  return <ScreenFrame header={<StepHeader step={3} total={4} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!teamId || busy} onClick={onContinue}>Send request</button>}>
    <section className="hsy-content"><h1>Pick your team</h1><p className="hsy-subtitle">{program?.name ?? "Choose a school"} · joining as {roleName}</p>
      <div className="hsy-stack">{(program?.teams ?? []).map((team: any) => <button key={team.id} className={`hsy-choice${teamId===team.id?" selected":""}`} onClick={() => setTeamId(team.id)} type="button">
        <span className="hsy-choice-icon"><ShieldCheck size={24}/></span><span className="hsy-choice-copy"><strong>{team.name}</strong><small>{team.season ?? "2026–27 season"}{team.headCoach ? " · head coach assigned" : " · no head coach yet"}</small></span>{teamId===team.id&&<Check className="hsy-check" size={20}/>}
      </button>)}</div>
      <div className="hsy-card tint" style={{marginTop:18}}><strong>Have an invite link?</strong><p className="hsy-note" style={{marginBottom:0}}>Opening an invite from your head coach or AD puts you on the right team. Requests never approve themselves.</p></div>
    </section>
  </ScreenFrame>;
}

export function StaffWaitingScreen({ status, programName, teamName, roleName, onRefresh, onBack, busy }: {
  status: string; programName?: string; teamName?: string; roleName: string; onRefresh: () => void; onBack: () => void; busy?: boolean;
}) {
  return <ScreenFrame header={<StepHeader step={4} total={4} onBack={onBack}/>} action={<button className="hsy-primary" disabled={busy} onClick={onRefresh}>Done · check status</button>}>
    <section className="hsy-content"><div className="hsy-success" style={{marginBottom:20}}><Check size={22}/></div>
      <h1>{status === "waiting_approval" ? "Waiting for approval" : "Request received"}</h1>
      <p className="hsy-subtitle">Your request to join {programName ?? "your school"} {teamName ?? ""} as {roleName} was submitted.</p>
      <div className="hsy-card"><div className="hsy-between"><strong>Approved by the appropriate school or league staff</strong><span className="hsy-section-label">Pending</span></div><hr style={{border:0,borderTop:"1px solid #e2e8f0",margin:"14px 0"}}/><p style={{margin:0,color:"#64748b"}}>Sent just now</p></div>
      <div className="hsy-card tint" style={{marginTop:14}}><p style={{margin:0}}>The roster and team chats stay hidden until you're approved. No school request grants self-approval.</p></div>
    </section>
  </ScreenFrame>;
}

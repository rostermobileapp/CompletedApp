import { useState } from "react";
import Papa from "papaparse";
import { LockKeyhole, Plus, Upload, UsersRound } from "lucide-react";
import { Field, ScreenFrame, StepHeader } from "./shared";

export type LeagueDraft = {
  details: { name: string; state: string; season: string };
  schools: Array<{ id: string; name: string; town: string; teams: Array<{ id: string; name: string }> }>;
  schedule: Array<{ homeTeamId: string; awayTeamId: string; date: string; time: string; rink: string }>;
  invitations: Array<{ email: string; role: "athletic_director"|"head_coach"; schoolId: string; teamId?: string }>;
};

const states = ["Connecticut","Massachusetts","Ohio","New York","New Jersey","Vermont","New Hampshire","Maine","Rhode Island"];
async function readCsv(file:File,required:string[],limit:number){
  if(file.size>5*1024*1024)throw new Error("CSV exceeds the 5 MB upload limit.");
  const parsed=Papa.parse<Record<string,string>>(await file.text(),{header:true,skipEmptyLines:"greedy",transformHeader:header=>header.trim().toLowerCase()});
  if(parsed.errors.length)throw new Error(`CSV parse error: ${parsed.errors.slice(0,3).map(e=>`row ${e.row??"?"}: ${e.message}`).join("; ")}`);
  const fields=parsed.meta.fields??[];const missing=required.filter(field=>!fields.includes(field));
  if(missing.length)throw new Error(`Missing required column${missing.length>1?"s":""}: ${missing.join(", ")}.`);
  if(!parsed.data.length)throw new Error("CSV has no data rows.");
  if(parsed.data.length>limit)throw new Error(`CSV has ${parsed.data.length} rows; the limit is ${limit}.`);
  return parsed.data;
}

export function LeagueDetailsScreen({ details, update, onBack, onContinue, busy }: {
  details:LeagueDraft["details"]; update:(patch:Partial<LeagueDraft["details"]>)=>void; onBack:()=>void; onContinue:()=>void; busy?:boolean;
}) {
  return <ScreenFrame header={<StepHeader step={1} total={5} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!details.name.trim()||!details.state||!details.season||busy} onClick={onContinue}>Continue</button>}>
    <section className="hsy-content"><h1>Create your High School / Youth league</h1><p className="hsy-subtitle">This setup is only for school and youth leagues. Adult leagues have their own.</p>
      <Field label="League name" value={details.name} onChange={name=>update({name})} placeholder="League name" maxLength={100}/>
      <span className="hsy-label">Level</span><div className="hsy-inline-choice"><button type="button" className="active">High school</button><button type="button" disabled title="Youth eligibility rules need confirmation">Youth</button></div>
      <div className="hsy-grid2" style={{marginTop:14}}><Field label="State" value={details.state} onChange={state=>update({state})} options={states}/><Field label="Season" value={details.season} onChange={season=>update({season})} options={["2026–27","2027–28","2028–29"]}/></div>
      <div className="hsy-card tint" style={{marginTop:18}}><div className="hsy-row"><LockKeyhole size={18} color="#64748b"/><span className="hsy-section-label">Always on for this league</span></div><p className="hsy-note" style={{marginBottom:0}}>Parent accounts for every player · staff approval · no private messages to players · adult-only features off</p></div>
    </section>
  </ScreenFrame>;
}

export function LeagueSchoolsScreen({ schools, update, onBack, onContinue, busy }: {
  schools:LeagueDraft["schools"]; update:(v:LeagueDraft["schools"])=>void; onBack:()=>void; onContinue:()=>void; busy?:boolean;
}) {
  const [importMessage,setImportMessage]=useState("");
  const addSchool=()=>update([...schools,{id:crypto.randomUUID(),name:"",town:"",teams:[{id:crypto.randomUUID(),name:""}]}]);
  return <ScreenFrame header={<StepHeader step={2} total={5} onBack={onBack}/>} action={<button className="hsy-primary" disabled={!schools.length||schools.some(s=>!s.name.trim()||s.teams.some(t=>!t.name.trim()))||busy} onClick={onContinue}>Continue · {schools.length} {schools.length===1?"school":"schools"}, {schools.reduce((n,s)=>n+s.teams.length,0)} teams</button>}>
    <section className="hsy-content"><h1>Add schools and teams</h1><p className="hsy-subtitle">Each school or co-op holds its teams.</p>
      {schools.map((school,i)=><div className="hsy-card" key={school.id} style={{marginBottom:12}}><div className="hsy-section-label">School {i+1}</div>
        <div className="hsy-grid2" style={{marginTop:10}}><input className="hsy-field" aria-label={`School ${i+1} name`} placeholder="School or co-op" value={school.name} onChange={e=>update(schools.map(s=>s.id===school.id?{...s,name:e.target.value}:s))}/><input className="hsy-field" aria-label={`School ${i+1} town`} placeholder="Town" value={school.town} onChange={e=>update(schools.map(s=>s.id===school.id?{...s,town:e.target.value}:s))}/></div>
        {school.teams.map((team,j)=><div className="hsy-row" key={team.id} style={{marginTop:10}}><input className="hsy-field" aria-label={`Team ${j+1} name`} placeholder="Team name" value={team.name} onChange={e=>update(schools.map(s=>s.id===school.id?{...s,teams:s.teams.map(t=>t.id===team.id?{...t,name:e.target.value}:t)}:s))}/><button className="hsy-secondary" aria-label="Remove team" onClick={()=>update(schools.map(s=>s.id===school.id?{...s,teams:s.teams.filter(t=>t.id!==team.id)}:s))}>−</button></div>)}
        <div className="hsy-row" style={{marginTop:10}}><button className="hsy-link" type="button" onClick={()=>update(schools.map(s=>s.id===school.id?{...s,teams:[...s.teams,{id:crypto.randomUUID(),name:""}]}:s))}>+ Team</button><button className="hsy-link" type="button" onClick={()=>update(schools.filter(s=>s.id!==school.id))}>Remove school</button></div>
      </div>)}
      <p className="hsy-note">CSV columns: School, Town, Team · up to 100 schools, 20 teams per school, and 2,000 rows.</p>
      <div className="hsy-row"><button className="hsy-secondary" onClick={addSchool}><Plus size={17}/> Add school</button><label className="hsy-secondary hsy-row" style={{cursor:"pointer"}}><Upload size={16}/> Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(!file)return;setImportMessage("");void (async()=>{try{
        const rows=await readCsv(file,["school","town","team"],2000);const grouped=new Map<string,any>();const issues:string[]=[];
        rows.forEach((row,i)=>{const name=(row.school??"").trim(),town=(row.town??"").trim(),team=(row.team??"").trim();if(!name||!town||!team){issues.push(`Row ${i+2}: school, town, and team are required.`);return;}
          const key=`${name.toLowerCase()}|${town.toLowerCase()}`;let item=grouped.get(key);if(!item){item={id:crypto.randomUUID(),name,town,teams:[]};grouped.set(key,item);}if(item.teams.some((t:any)=>t.name.toLowerCase()===team.toLowerCase()))issues.push(`Row ${i+2}: duplicate team "${team}" for ${name}.`);else item.teams.push({id:crypto.randomUUID(),name});
          if(item.teams.length>20)issues.push(`Row ${i+2}: ${name} exceeds the 20-team limit.`);
        });
        if(grouped.size+schools.length>100)issues.push("Import would exceed the 100-school limit.");
        if(Array.from(grouped.values()).some((school:any)=>schools.some(existing=>`${existing.name.toLowerCase()}|${existing.town.toLowerCase()}`===`${school.name.toLowerCase()}|${school.town.toLowerCase()}`)))issues.push("Import includes a school already in this draft.");
        if(issues.length)throw new Error(issues.slice(0,8).join(" "));
        update([...schools,...Array.from(grouped.values())]);setImportMessage(`Imported ${grouped.size} schools and ${Array.from(grouped.values()).reduce((n:number,s:any)=>n+s.teams.length,0)} teams into this private draft.`);
      }catch(error:any){setImportMessage(error?.message??"CSV could not be imported.");}})();}}/></label></div>
      {importMessage&&<p role={importMessage.startsWith("Imported")?"status":"alert"} className={importMessage.startsWith("Imported")?"hsy-success":"hsy-error"} style={{marginTop:12}}>{importMessage}</p>}
    </section>
  </ScreenFrame>;
}

export function LeagueScheduleScreen({ schedule, schools, update, onBack, onContinue, busy }: {
  schedule:LeagueDraft["schedule"]; schools:LeagueDraft["schools"]; update:(v:LeagueDraft["schedule"])=>void; onBack:()=>void; onContinue:()=>void; busy?:boolean;
}) {
  const [importMessage,setImportMessage]=useState("");
  const allTeams=schools.flatMap(s=>s.teams.map(t=>({id:t.id,name:`${s.name} ${t.name}`,shortName:t.name})));
  const validSchedule=schedule.every(g=>g.homeTeamId&&g.awayTeamId&&g.homeTeamId!==g.awayTeamId&&/^\d{4}-\d{2}-\d{2}$/.test(g.date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(g.time)&&g.rink.trim());
  const add=()=>update([...schedule,{homeTeamId:"",awayTeamId:"",date:"",time:"",rink:""}]);
  return <ScreenFrame header={<StepHeader step={3} total={5} onBack={onBack}/>} action={<div className="hsy-stack"><button className="hsy-primary" disabled={busy||(schedule.length>0&&!validSchedule)} onClick={onContinue}>{schedule.length?`Save ${schedule.length} games`:"Skip for now"}</button>{schedule.length>0&&<button className="hsy-secondary" onClick={()=>update([])}>Skip for now</button>}</div>}>
    <section className="hsy-content"><h1>Import your schedule</h1><p className="hsy-subtitle">Date, time, home, away and rink for every game.</p>
      <p className="hsy-note">CSV columns: Date, Time, Home, Away, Rink · dates use YYYY-MM-DD · team names must match one school/team in this draft · maximum 2,000 rows.</p>
      <label className="hsy-secondary hsy-row" style={{cursor:"pointer",width:"100%",justifyContent:"center",marginBottom:14}}><Upload size={18}/>Choose schedule CSV<input type="file" accept=".csv,text/csv" hidden onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(!file)return;setImportMessage("");void (async()=>{try{
        const rows=await readCsv(file,["date","time","home","away","rink"],2000);const issues:string[]=[];const gameKeys=new Set<string>();const parsed=rows.map((row,i)=>{
          const date=(row.date??"").trim(),time=(row.time??"").trim(),home=(row.home??"").trim(),away=(row.away??"").trim(),rink=(row.rink??"").trim();
          if(!date||!time||!home||!away||!rink){issues.push(`Row ${i+2}: date, time, home, away, and rink are required.`);return null;}
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){issues.push(`Row ${i+2}: use date YYYY-MM-DD and 24-hour time HH:MM.`);return null;}
          const parsedDate=new Date(`${date}T00:00:00Z`);
          if(!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date){issues.push(`Row ${i+2}: "${date}" is not a real calendar date.`);return null;}
          const resolve=(label:string)=>allTeams.filter(t=>t.name.toLowerCase()===label.toLowerCase()||t.shortName.toLowerCase()===label.toLowerCase());
          const homes=resolve(home),aways=resolve(away);
          if(homes.length!==1)issues.push(`Row ${i+2}: home team "${home}" ${homes.length?"is ambiguous":"does not match a team"}.`);
          if(aways.length!==1)issues.push(`Row ${i+2}: away team "${away}" ${aways.length?"is ambiguous":"does not match a team"}.`);
          if(homes.length===1&&aways.length===1&&homes[0].id===aways[0].id)issues.push(`Row ${i+2}: home and away teams must be different.`);
          if(homes.length===1&&aways.length===1){
            const key=`${[homes[0].id,aways[0].id].sort().join(":")}:${date}:${time}`;
            if(gameKeys.has(key))issues.push(`Row ${i+2}: duplicate game for these teams, date, and time.`);
            gameKeys.add(key);
          }
          return homes.length===1&&aways.length===1?{date,time,rink,homeTeamId:homes[0].id,awayTeamId:aways[0].id}:null;
        });
        if(issues.length)throw new Error(issues.slice(0,10).join(" "));
        const games=parsed.filter((row):row is NonNullable<typeof row>=>row!==null);if(games.length!==rows.length)throw new Error("Some schedule rows could not be imported.");
        update(games);setImportMessage(`Imported ${games.length} schedule rows for review. Nothing has been sent.`);
      }catch(error:any){setImportMessage(error?.message??"Schedule CSV could not be imported.");}})();}}/></label>
      {importMessage&&<p role={importMessage.startsWith("Imported")?"status":"alert"} className={importMessage.startsWith("Imported")?"hsy-success":"hsy-error"} style={{marginTop:12}}>{importMessage}</p>}
      {!schedule.length&&<div className="hsy-card tint"><strong>Schedule preview</strong><p className="hsy-note" style={{marginBottom:0}}>Add a CSV to review games before saving. No invitations are sent from this step.</p></div>}
      <div className="hsy-stack">{schedule.slice(0,8).map((game,i)=><div className="hsy-card" key={i}><div className="hsy-grid2"><input type="date" className="hsy-field" aria-label={`Game ${i+1} date`} value={game.date} onChange={e=>update(schedule.map((v,j)=>j===i?{...v,date:e.target.value}:v))}/><input type="time" className="hsy-field" aria-label={`Game ${i+1} time`} value={game.time} onChange={e=>update(schedule.map((v,j)=>j===i?{...v,time:e.target.value}:v))}/></div><div className="hsy-grid2" style={{marginTop:10}}><select className="hsy-field" aria-label={`Game ${i+1} home team`} value={game.homeTeamId} onChange={e=>update(schedule.map((v,j)=>j===i?{...v,homeTeamId:e.target.value}:v))}><option value="">Home team</option>{allTeams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select><select className="hsy-field" aria-label={`Game ${i+1} away team`} value={game.awayTeamId} onChange={e=>update(schedule.map((v,j)=>j===i?{...v,awayTeamId:e.target.value}:v))}><option value="">Away team</option>{allTeams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></div><input className="hsy-field" aria-label={`Game ${i+1} rink`} placeholder="Rink" style={{marginTop:10}} value={game.rink} onChange={e=>update(schedule.map((v,j)=>j===i?{...v,rink:e.target.value}:v))}/></div>)}</div>
      {schedule.length>8&&<p className="hsy-note">Showing 8 of {schedule.length} imported games. All rows remain in this draft.</p>}
    </section>
  </ScreenFrame>;
}

export function LeagueInvitesScreen({ schools, invitations, update, onBack, onContinue, busy }: {
  schools:LeagueDraft["schools"]; invitations:LeagueDraft["invitations"]; update:(v:LeagueDraft["invitations"])=>void; onBack:()=>void; onContinue:()=>void; busy?:boolean;
}) {
  const add=()=>update([...invitations,{email:"",role:"athletic_director",schoolId:schools[0]?.id??""}]);
  return <ScreenFrame header={<StepHeader step={4} total={5} onBack={onBack}/>} action={<div className="hsy-stack"><button className="hsy-primary" disabled={busy} onClick={onContinue}>Continue</button><button className="hsy-secondary" onClick={onContinue}>Skip for now</button></div>}>
    <section className="hsy-content"><h1>Invite ADs and head coaches</h1><p className="hsy-subtitle">Invitations are saved in this private draft only. No emails are sent.</p>
      <div className="hsy-card tint"><p style={{margin:0}}>Coaches add their own players and parents. Staff access requires the appropriate review.</p></div>
      {invitations.map((invite,i)=><div className="hsy-card" key={i} style={{marginTop:12}}><div className="hsy-section-label">Invite {i+1}</div>
        <input className="hsy-field" type="email" placeholder="Email address" aria-label={`Invite ${i+1} email`} value={invite.email} style={{marginTop:10}} onChange={e=>update(invitations.map((v,j)=>j===i?{...v,email:e.target.value}:v))}/>
        <div className="hsy-grid2" style={{marginTop:10}}><select className="hsy-field" value={invite.role} aria-label={`Invite ${i+1} role`} onChange={e=>update(invitations.map((v,j)=>j===i?{...v,role:e.target.value as any}:v))}><option value="athletic_director">Athletic Director</option><option value="head_coach">Head Coach</option></select><select className="hsy-field" value={invite.schoolId} aria-label={`Invite ${i+1} school`} onChange={e=>update(invitations.map((v,j)=>j===i?{...v,schoolId:e.target.value}:v))}><option value="">School</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        {invite.role==="head_coach"&&<select className="hsy-field" style={{marginTop:10}} value={invite.teamId??""} aria-label={`Invite ${i+1} team`} onChange={e=>update(invitations.map((v,j)=>j===i?{...v,teamId:e.target.value}:v))}><option value="">Team</option>{schools.find(s=>s.id===invite.schoolId)?.teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        <button className="hsy-link" style={{marginTop:10,border:0,background:"none",padding:0}} onClick={()=>update(invitations.filter((_,j)=>j!==i))}>Remove invite</button>
      </div>)}
      <button className="hsy-secondary" style={{marginTop:14,width:"100%"}} onClick={add}>+ Add invitation</button>
    </section>
  </ScreenFrame>;
}

export function LeaguePlanScreen({ onBack,onContinue,busy }: {onBack:()=>void;onContinue:()=>void;busy?:boolean}) {
  return <ScreenFrame header={<StepHeader step={5} total={5} onBack={onBack}/>} action={<button className="hsy-primary" disabled={busy} onClick={onContinue}>Finish setup</button>}>
    <section className="hsy-content"><h1>Plan and seats</h1><p className="hsy-subtitle">The High School / Youth league plan. Separate from adult League Manager.</p>
      <div className="hsy-card selected"><span className="hsy-section-label">School and youth</span><h2 style={{fontSize:22,margin:"8px 0 0"}}>League Plan</h2><p style={{color:"#64748b",margin:"2px 0 10px"}}>For High School / Youth leagues</p><strong style={{fontSize:22}}>[Price]</strong><span style={{color:"#64748b"}}> /month</span>
        <ul style={{paddingLeft:20,lineHeight:1.9}}><li>Schools, teams and staff approvals</li><li>Parent and player accounts with safety rules</li><li>Schedule import with rinks</li><li>Fast score reporting and public results</li><li>Bulk seats for coaches and parents</li></ul>
      </div>
      <div className="hsy-card tint" style={{marginTop:14}}><div className="hsy-between"><strong>League seats</strong><strong>0 of 0 used</strong></div><p className="hsy-note" style={{marginBottom:0}}>Seats cover coaches and parents, one per family. Players are always free. Seat availability is status only in this app.</p></div>
      <p className="hsy-footer-note">This creates a private draft only. No plan is purchased and the league is not active.</p>
    </section>
  </ScreenFrame>;
}

export function LeagueDraftHomeScreen({ draft, onReset }: {draft:any;onReset:()=>void}) {
  const schoolCount=draft?.schools?.length??0; const teams=(draft?.schools??[]).reduce((n:number,s:any)=>n+(s.teams?.length??0),0);
  return <main className="hsy"><div className="hsy-frame"><section className="hsy-content">
    <p className="hsy-section-label">{draft?.details?.season??"Season"} · High School / Youth</p><p className="hsy-section-label" style={{marginTop:10,color:"#2563eb"}}>League admin · draft</p>
    <h1 style={{marginTop:16}}>{draft?.details?.name||"League draft"}</h1><p className="hsy-subtitle">Setup saved as a private draft pending review.</p>
    <div className="hsy-grid2"><Metric label="Schools" value={schoolCount}/><Metric label="Teams" value={teams}/><Metric label="Games" value={draft?.schedule?.length??0}/><Metric label="Seats" value="0 / 0"/></div>
    <div className="hsy-alert" style={{marginTop:18}}>Waiting for approval · This league is not active. No invitations were sent and no permissions were granted.</div>
    <div className="hsy-card" style={{marginTop:16}}><strong>League setup status</strong><p className="hsy-note">Draft saved. Staff review and any required approvals are still pending.</p><button className="hsy-secondary" onClick={onReset}>Review setup</button></div>
    <div className="hsy-card tint" style={{marginTop:12}}><div className="hsy-row"><UsersRound size={18}/><strong>Invitations</strong></div><p className="hsy-note" style={{marginBottom:0}}>{draft?.invitations?.length??0} prepared in draft · not sent</p></div>
  </section></div></main>;
}
function Metric({label,value}:{label:string;value:string|number}){return <div className="hsy-card tint"><span className="hsy-section-label">{label}</span><strong style={{display:"block",fontSize:22,marginTop:5}}>{value}</strong></div>}

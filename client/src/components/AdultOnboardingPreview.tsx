import { useState } from "react";

/** Local walkthrough, never mounted by the real adult-account path. */
export function AdultOnboardingPreview({organizer}:{organizer:boolean}){
  const [step,setStep]=useState(1);
  const [role,setRole]=useState("team_captain");
  const [name,setName]=useState({first:"",last:"",city:""});
  const [position,setPosition]=useState("F");
  const [level,setLevel]=useState("recreational");
  const [organization,setOrganization]=useState("");
  const input="block w-full rounded-lg border bg-background p-3";
  const button="rounded-lg border px-4 py-3 disabled:opacity-50";
  return <section className="space-y-4">
    <p className="text-sm text-muted-foreground">Preview step {step} of 3 · all changes stay in memory</p>
    <h2 className="font-semibold">{step===1?(organizer?"Organizer profile":"Player profile"):step===2?(organizer?"Team or league setup":"Find a team"):"Preview complete"}</h2>
    {step===1&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(name.first.trim()&&name.last.trim())setStep(2);}}>
      {organizer&&<label className="block text-sm">Organizer role<select aria-label="Organizer role" className={input} value={role} onChange={e=>setRole(e.target.value)}>
        <option value="team_captain">Captain</option><option value="league_manager">League admin</option>
        <option value="tournament_organizer">Tournament organizer</option><option value="scorekeeper">Scorekeeper</option>
      </select></label>}
      <label className="block text-sm">Adult first name<input className={input} required maxLength={80} value={name.first} onChange={e=>setName({...name,first:e.target.value})}/></label>
      <label className="block text-sm">Adult last name<input className={input} required maxLength={80} value={name.last} onChange={e=>setName({...name,last:e.target.value})}/></label>
      <label className="block text-sm">City or town<input className={input} maxLength={120} value={name.city} onChange={e=>setName({...name,city:e.target.value})}/></label>
      {!organizer&&<>
        <label className="block text-sm">Primary position<select aria-label="Primary position" className={input} value={position} onChange={e=>setPosition(e.target.value)}><option value="F">Forward</option><option value="D">Defense</option><option value="G">Goalie</option></select></label>
        <label className="block text-sm">Playing level<select aria-label="Playing level" className={input} value={level} onChange={e=>setLevel(e.target.value)}><option value="recreational">Recreational</option><option value="intermediate">Intermediate</option><option value="competitive">Competitive</option></select></label>
      </>}
      <button type="submit" className={button} disabled={!name.first.trim()||!name.last.trim()}>Next: {organizer?"team or league setup":"find a team"}</button>
    </form>}
    {step===2&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(!organizer||organization.trim())setStep(3);}}>
      {organizer?<><p className="text-sm">Demonstrate a setup request. Selecting a role here does not grant school or league authority.</p>
        <label className="block text-sm">Team, league or event name<input className={input} required maxLength={120} value={organization} onChange={e=>setOrganization(e.target.value)}/></label>
        <button type="submit" className={button} disabled={!organization.trim()}>Preview setup request</button></>:
        <><label className="block text-sm">Example team<select className={input}><option>Sample adult team · Preview League</option></select></label><p className="text-sm">A real team request follows the existing adult approval and access rules.</p><button type="submit" className={button}>Preview team request</button></>}
    </form>}
    {step===3&&<div role="status" className="space-y-3 rounded-lg border p-4">
      <p>{organizer?"Example setup request ready for review.":"Example team request awaiting review."}</p>
      <p>No profile, team, league, membership, purchase or administrative permission was created. This is a screen demonstration, not the full existing adult onboarding implementation.</p>
      <p>Use “Choose another path” above to review staff or parent setup.</p>
    </div>}
    {step>1&&<button className={button} type="button" onClick={()=>setStep(step-1)}>Back</button>}
  </section>;
}

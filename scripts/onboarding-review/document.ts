import { readFile } from "node:fs/promises";
import type { ReviewSpec } from "./catalog";

type Captured=ReviewSpec&{heading:string;images:string[];pageErrors:string[]};
const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export async function renderReviewDocument(screens:Captured[]){
  const pages:string[]=[];
  const byId=new Map(screens.map(screen=>[screen.id,screen]));
  const link=(id:string)=>`<a href="#${esc(id)}">${esc(id)}</a>`;
  const box=(id:string,label?:string)=>`<a class="flow-box" href="#${id}"><b>${id}</b><span>${esc(label||byId.get(id)?.heading||id)}</span></a>`;
  const line=(label:string,ids:string[])=>`<div class="flow-line"><div class="lane-label">${esc(label)}</div>${ids.map((id,index)=>(index?'<span class="arrow">→</span>':"")+box(id)).join("")}</div>`;
  const page=(title:string,subtitle:string,body:string,cls="")=>`<section class="pdf-page ${cls}"><header><div class="brand">ROSTERHOCKEY <span>ONBOARDING REVIEW</span></div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></header>${body}</section>`;
  pages.push(page("Every onboarding screen, in context","Updated review · Current workspace / isolated DEV · Captured at 390 × 844 · November 23, 2026",`
    <div class="cover-title">An updated visual inventory<br>of the current onboarding.</div>
    <div class="cover-grid">
      <div><h3>${screens.length} screen definitions</h3><p>Actual component renders, exact visible headings, lower-scroll continuations, branch arrows and linked screen references.</p></div>
      <div><h3>Light onboarding design aligned</h3><p>Refreshed E03–E05 and V01–V09 to match the light onboarding and P01–P03. Fields, verification, saving and screen order remain unchanged.</p></div>
      <div><h3>Potential repeats are marked</h3><p>The DEV intake and existing questionnaire both ask hockey type and role. Other similar questions belong to separate branches.</p></div>
      <div><h3>Blocked states are labelled</h3><p>Child activation, device approvals and password-success states use synthetic fixtures. They are not proof of live acceptance or enabled access.</p></div>
    </div>
    <div class="callout blue"><b>How to use this PDF</b><p>Start with the next three flow maps and the findings page. Then inspect the screenshot catalog. Screen IDs and “Next” links are clickable. A lower-scroll view is the same screen, not another onboarding step.</p></div>
    <div class="legend"><span class="badge">CURRENT / DEV</span><span class="badge optional">OPTIONAL ENTRY</span><span class="badge conditional">CONDITIONAL EMAIL</span><span class="badge fixture">FIXTURE / BLOCKED</span><span class="badge loop">SELF-LOOP</span></div>
    <p class="small">Scope: account entry, age gate, signup, existing adult profile and questionnaire, High School staff/parent/league setup, parent verification and restricted child UI. Retired legacy implementations have been removed. Routine field-validation permutations, loading skeletons, global app pages after onboarding, operating-system share sheets and third-party provider screens are not counted as distinct screens.</p>
    <p class="small">Capture method: isolated, read-only renders of current components with reserved-domain examples. API/Auth operations were blocked. Some screen-local state was seeded inside the capture bundle only; application files and live services were not modified.</p>
  `,"cover"));
  pages.push(page("1. Account entry and the adult handoff","Arrows describe current source/controller handoffs, not a completed live-provider registration.",`
    <h3>New account: age before credentials</h3>
    ${line("YES",["E01","E02","H01"])}
    ${line("EMAIL IF REQUIRED",["E02","E05","H01"])}
    ${line("NO / UNDER 18",["E01","U01","U02"])}
    ${line("ADULT HOCKEY",["H01","H02","P01","P02","P03","Q01"])}
    <div class="callout red"><b>Potential repeat at the handoff</b><p>The new DEV intake contains hockey type ${link("H01")} and adult role ${link("H02")}. The existing adult profile then leads to the independent questionnaire, whose ${link("Q03")} and ${link("Q04")} ask those topics again. Review whether both selectors should remain on a single adult journey. Routing depends on saved account/flow completion state.</p></div>
    <div class="callout"><b>Separate entrances, not additional sequential steps</b><p>${link("E00")} is an alternative High School entry; ${link("E03")} is existing-account sign-in; ${link("E04")} is the alternative signup dialog. The three existing adult profile screens are ${link("P01")} → ${link("P02")} → ${link("P03")}. Finishing the profile explicitly navigates to <code>/get-started</code>.</p></div>
  `));
  pages.push(page("2. The existing /get-started questionnaire","Five adult roles have different challenge/solution content. The main forward route skips the standalone features screen.",`
    ${line("COMMON INTRO",["Q01","Q02","Q03","Q04"])}
    ${line("PLAYER",["Q04","QP1","QP2","Q17"])}
    ${line("TEAM CAPTAIN",["Q04","QC1","QC2","Q17"])}
    ${line("LEAGUE MANAGER",["Q04","QL1","QL2","Q17"])}
    ${line("TOURNAMENT",["Q04","QT1","QT2","Q17"])}
    ${line("SCOREKEEPER",["Q04","QS1","QS2","Q17"])}
    ${line("FINISH",["Q17","Q18","Q19"])}
    <p class="small">For a visitor without an account, the paywall variant is ${link("Q20")}; its account CTA goes to sign-in/account entry at <code>/login</code>. The authenticated ${link("Q19")} instead returns to the app.</p>
    <div class="callout red"><b>Confirmed source-level self-loop: ${link("Q16")}</b><p>“Here's what's waiting for you” has a “Looks good — let's go →” action that sets <code>join_play_features</code> again. No normal forward action currently enters this screen from the main chain. It can be reached through the DEV screen picker. This is shown separately—not incorrectly inserted between Solution and Preferences.</p></div>
  `));
  pages.push(page("3. High School / Youth branches","These are separate role journeys. Shared referral/profile screens are not intended to be repeated across all three branches.",`
    ${line("ENTRY",["H01","H03"])}
    ${line("STAFF",["H03","H04","H05","S01","S02","S04","S05"])}
    ${line("MISSING SCHOOL",["S02","S03","S05"])}
    ${line("PARENT AUTHORITY",["H03","V01","V02","V03","H04","H05"])}
    ${line("PARENT INTAKE",["H05","F01","F02","F03","F04","F05"])}
    ${line("LEAGUE ADMIN",["H05","L01","L02","L03","L04","L05","L06"])}
    <div class="callout blue"><b>Intentional return to consent</b><p>${link("F02")} repeats once per player. Matching a staged-player invitation at ${link("F03")} replaces the local player list, resets guardian/player consent, and returns to ${link("F02")} for every imported player before joining. This is deliberate—not duplicate signup.</p></div>
    <div class="callout"><b>Current stop points</b><p>Staff stop at approval. Parents stop with pending coverage/approval and no child activation. Leagues are private drafts, not active leagues or sent invitations. ${link("F06")}–${link("C03")} show existing fixture-only device UI beyond those real activation boundaries. Password-change ${link("V04")}–${link("V06")} is an optional security operation, not a standard onboarding step.</p></div>
  `));
  pages.push(page("4. Repetition and navigation findings","Evidence is separated from interpretation so the review does not imply every similar screen is shown to every user.",`
    <table class="findings"><thead><tr><th>What to review</th><th>Screens</th><th>What the current source shows</th></tr></thead><tbody>
      <tr><td><b>Hockey type asked twice</b><br><span class="badge loop">POTENTIAL SEQUENTIAL REPEAT</span></td><td>${link("H01")} / ${link("Q03")}</td><td>Same HockeyTypeScreen component is used in the new DEV intake and the separate questionnaire. Adult completion/account state determines the actual handoff.</td></tr>
      <tr><td><b>Adult role asked twice</b><br><span class="badge loop">POTENTIAL SEQUENTIAL REPEAT</span></td><td>${link("H02")} / ${link("Q04")}</td><td>New intake has five compact choices. Questionnaire has a separate role selector with the same five active roles plus two disabled coming-soon roles.</td></tr>
      <tr><td><b>Several welcome/profile steps</b></td><td>${link("P01")}–${link("P03")}, ${link("Q01")}–${link("Q02")}</td><td>The adult profile includes “Welcome to RosterHockey,” then the separate questionnaire starts another welcome and social-proof sequence. These are separate existing flows joined by /get-started.</td></tr>
      <tr><td><b>Referral questions look alike</b><br><span class="badge optional">SEPARATE BRANCHES</span></td><td>${link("H04")} / ${link("Q17")}</td><td>High School referral and adult questionnaire referral serve different role paths. Similar wording alone does not establish duplicate questioning in one completed route.</td></tr>
      <tr><td><b>Staff role selection</b><br><span class="badge optional">DIFFERENT QUESTIONS</span></td><td>${link("H03")} / ${link("S01")}</td><td>H03 picks broad staff/parent/league-admin path. S01 picks specific head coach, assistant, AD or manager authority.</td></tr>
      <tr><td><b>Features button loops</b><br><span class="badge loop">CONFIRMED SELF-LOOP</span></td><td>${link("Q16")}</td><td>The CTA selects its own join_play_features state. Main forward route does not currently enter it. Keep it separate from the normal sequence when reviewing.</td></tr>
      <tr><td><b>Consent appears again</b><br><span class="badge optional">INTENTIONAL</span></td><td>${link("F02")} / ${link("F03")}</td><td>Consent is per player and must be renewed for newly matched staged invitation players. Do not remove it just to shorten the flow.</td></tr>
      <tr><td><b>Retired implementations removed</b></td><td>Former X01–X09 and Z01–Z07</td><td>The old development preview, its adult demo branches and the unused older wizard have been deleted. Current adult onboarding and the shared High School backend services remain intact. The original exported PDF is a historical snapshot.</td></tr>
    </tbody></table>
    <p class="small">Source areas checked: App router, Login/AuthModal, Onboarding, OnboardingQuestionnaire, HighSchoolYouthOnboarding, ParentVerification, Under18Onboarding and component screen modules. This is a visual/source review, not legal, billing, provider, native-phone, or security acceptance.</p>
  `));
  const groups=[...new Set(screens.map(screen=>screen.group))];
  for(const group of groups){
    const groupScreens=screens.filter(screen=>screen.group===group);
    const cards=groupScreens.flatMap(screen=>screen.images.map((image,index)=>({screen,image,index})));
    for(let start=0;start<cards.length;start+=4){
      const batch=cards.slice(start,start+4);
      const body=await Promise.all(batch.map(async({screen,image,index},column)=>{
        const data=(await readFile(image)).toString("base64");
        const status=screen.status||"current";
        const next=batch[column+1];
        const sequential=!!next&&((next.screen.id===screen.id&&next.index===index+1)||(index===screen.images.length-1&&screen.next?.includes(next.screen.id)));
        return `<article class="screen-card"${index===0?` id="${screen.id}"`:""}>
          <div class="screen-label"><b>${screen.id}${index?` · lower view ${index+1}`:""}</b><span class="badge ${status}">${status==="current"?"CURRENT / DEV":status==="fixture"?"FIXTURE / BLOCKED":status==="conditional"?"CONDITIONAL EMAIL":status==="loop"?"SELF-LOOP":status.toUpperCase()}</span></div>
          <h3>${esc(screen.heading)}</h3>
          <div class="phone"><img alt="${esc(screen.heading)}" src="data:image/jpeg;base64,${data}"></div>
          <p class="screen-note">${esc(index?"Continuation of the same screen; scrolled to show the remaining layout.":screen.note)}</p>
          <div class="next">${index<screen.images.length-1?"↓ Scroll continuation on the next card":screen.next?.length?"Next: "+screen.next.map(link).join(" / "):"End / waits for approval or normal app entry"}</div>
          ${sequential?`<span class="connector">${next.screen.id===screen.id?"↓":"→"}</span>`:""}
        </article>`;
      }));
      pages.push(page(group,`${start+1}–${Math.min(start+4,cards.length)} of ${cards.length} phone views in this section · Screen IDs link to the first view of each screen`,`<div class="screens">${body.join("")}</div>`));
    }
  }
  const pageCount=pages.length;
  const styledPages=pages.map((content,index)=>content.replace("</section>",`<footer><span>RosterHockey · current onboarding review · synthetic capture / no real accounts</span><span>${index+1} / ${pageCount}</span></footer></section>`)).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>RosterHockey onboarding screen and flow review</title><style>
    @page{size:A3 landscape;margin:0}
    *{box-sizing:border-box}html,body{margin:0;background:#e2e8f0;color:#0f172a;font-family:Arial,Helvetica,sans-serif}
    a{color:#2563eb;text-decoration:none}p{line-height:1.45}code{font:12px monospace;background:#f1f5f9;padding:2px 5px}
    .pdf-page{width:420mm;height:297mm;padding:11mm 13mm 13mm;background:#fff;position:relative;break-after:page;overflow:hidden}
    .pdf-page:last-child{break-after:auto}.brand{font-size:13px;letter-spacing:1.6px;font-weight:800;color:#2563eb}.brand span{color:#64748b;font-weight:500;margin-left:12px}
    header{margin-bottom:7mm}header h2{font-size:28px;letter-spacing:-.5px;margin:9px 0 5px}header p{font-size:13px;color:#64748b;margin:0}
    footer{position:absolute;bottom:6mm;left:13mm;right:13mm;display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;color:#64748b}
    .cover-title{font-size:55px;font-weight:800;letter-spacing:-1.8px;line-height:1.04;margin:14mm 0 12mm}
    .cover-grid{display:grid;grid-template-columns:1fr 1fr;gap:7mm 16mm}.cover-grid h3{font-size:21px;margin:0 0 7px}.cover-grid p{font-size:16px;margin:0;color:#475569;max-width:580px}
    .callout{padding:5mm 6mm;border:1px solid #cbd5e1;border-radius:10px;margin:5mm 0;background:#f8fafc;font-size:14px}.callout b{font-size:16px}.callout p{margin:6px 0 0}.callout.blue{border-color:#93c5fd;background:#eff6ff}.callout.red{border-color:#fca5a5;background:#fff1f2}
    .small{font-size:12px;color:#64748b}.legend{display:flex;gap:12px;margin:7mm 0}
    .badge{display:inline-block;font-size:9px;line-height:1.25;font-weight:700;letter-spacing:.35px;background:#eff6ff;color:#1d4ed8;padding:4px 6px;border-radius:5px;white-space:nowrap}
    .badge.optional{background:#f1f5f9;color:#475569}.badge.fixture{background:#fff7ed;color:#9a3412}.badge.legacy{background:#f3e8ff;color:#6b21a8}.badge.loop{background:#fee2e2;color:#991b1b}
    .flow-line{display:flex;gap:9px;align-items:center;min-height:24mm;margin:3mm 0}.lane-label{flex:none;width:43mm;color:#64748b;font-size:12px;font-weight:700;letter-spacing:.4px}
    .flow-box{flex:1;min-width:0;border:1px solid #bfdbfe;background:#eff6ff;border-radius:9px;padding:10px 11px;color:#0f172a;min-height:20mm;display:flex;flex-direction:column;justify-content:center;gap:5px;font-size:12px;line-height:1.25}.flow-box b{color:#2563eb;font-size:12px}.flow-box span{font-weight:700}.arrow{font-size:28px;color:#2563eb;flex:none}
    h3{margin:0 0 9px;font-size:18px}.findings{border-collapse:collapse;width:100%;font-size:14px;line-height:1.4}.findings th{text-align:left;background:#eff6ff;color:#1e40af;padding:12px}.findings td{vertical-align:top;padding:12px;border-bottom:1px solid #e2e8f0}.findings td:first-child{width:26%}.findings td:nth-child(2){width:15%;font-weight:700}
    .screens{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9mm}.screen-card{position:relative;min-width:0}
    .screen-label{display:flex;justify-content:space-between;align-items:center;gap:3px;min-height:7mm;font-size:13px}.screen-card h3{font-size:16px;line-height:1.2;margin:3px 0 8px;height:14mm;display:flex;align-items:center}
    .phone{height:188mm;background:#f8fafc;border:1px solid #cbd5e1;border-radius:9px;overflow:hidden;display:flex;align-items:flex-start;justify-content:center}.phone img{height:100%;width:100%;object-fit:contain;object-position:top}
    .screen-note{font-size:11px;line-height:1.35;margin:10px 0 5px;min-height:14mm}.next{font-size:11px;line-height:1.25;font-weight:700;color:#475569}
    .connector{position:absolute;right:-8mm;top:111mm;color:#2563eb;font-size:29px;font-weight:700}
    @media screen{.pdf-page{margin:16px auto;box-shadow:0 5px 25px #0002}}
    @media print{html,body{background:#fff}.pdf-page{margin:0;box-shadow:none}}
  </style></head><body>${styledPages}</body></html>`;
}

/** Offline UI checks. No Auth, database connection, outgoing messages or purchases. */
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve("generated-artifacts/high-school-youth-preview");
const report: { scope: string; checks: string[]; providerCalls: number; browserErrors: string[] } = {
  scope: "Offline synthetic UI only; not provider, native or security acceptance", checks: [], providerCalls: 0, browserErrors: [],
};
const bundled = await build({
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@assets": path.resolve("attached_assets") },
  loader: { ".css": "empty", ".png": "dataurl", ".jpg": "dataurl" },
  define: {
    "process.env.NODE_ENV": '"development"', "import.meta.env.DEV": "true",
    "import.meta.env.VITE_ISOLATED_DEVELOPMENT": '"true"',
  },
  stdin: {
    resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {QueryClientProvider} from '@tanstack/react-query';
      import Preview from './client/src/pages/HighSchoolYouthOnboardingPreview';
      import Questionnaire from './client/src/pages/OnboardingQuestionnaire';
      import {queryClient} from '@/lib/queryClient';
      createRoot(document.getElementById('root')).render(
        location.pathname==='/questionnaire' ? <QueryClientProvider client={queryClient}><Questionnaire/></QueryClientProvider> : <Preview/>);
    `,
  },
  plugins: [{
    name: "offline-service-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(?:queryClient|supabase|nativePurchases|signupAttributionBrowser)$/ },
        args => ({ path: args.path, namespace: "offline-boundary" }));
      builder.onLoad({ filter: /.*/, namespace: "offline-boundary" }, args => ({
        loader: "js", resolveDir: process.cwd(), contents: args.path.endsWith("queryClient") ? `
          import {QueryClient} from '@tanstack/react-query';
          export class ApiError extends Error {}
          export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>queryKey[0]==='/api/referral/approved-partners'?[]:{}}}});
          export async function apiRequest(){window.__unexpectedCalls=(window.__unexpectedCalls||0)+1;throw Error('Real API is forbidden');}
          export async function getAuthHeaders(){throw Error('Real Auth is forbidden');}
        ` : args.path.endsWith("nativePurchases") ? "export const setSubscriberAttributes=()=>{};" :
          args.path.endsWith("signupAttributionBrowser") ? "export const loadSignupAttribution=async()=>({});export const signupAttribution=()=>({clear(){}});export async function signupAttributionMetadata(){throw Error('Real signup forbidden')};export function bindSignupAttributionUser(){throw Error('Real signup forbidden')};" :
            "export const supabase={auth:{signOut:async()=>{throw Error('Real Auth is forbidden')}}};",
      }));
    },
  }],
});
const app = express();
app.use("/api", (_req, res) => { report.providerCalls++; res.status(503).json({ code: "NO_REAL_API_IN_UI_TESTS" }); });
app.get("/page.js", (_req, res) => res.type("application/javascript").send(bundled.outputFiles[0].text));
let css = await readFile("client/src/components/high-school-onboarding/onboarding.css", "utf8");
try {
  const assets = path.resolve("dist/public/assets");
  const name = (await readdir(assets)).find(file => file.endsWith(".css"));
  if (name) css = `${await readFile(path.join(assets, name), "utf8")}\n${css}`;
} catch { /* Local component CSS still covers the extracted screen UI. */ }
app.get("/page.css", (_req, res) => res.type("text/css").send(css));
app.get("*", (_req, res) => res.type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><div id="root"></div><script src="/page.js"></script>`));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.on("listening", resolve));
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", error => report.browserErrors.push(error.message));
await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
const mark = (name: string) => report.checks.push(name);
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}
async function openHs(role: RegExp) {
  await page.goto(origin);
  await page.getByRole("heading", { name: "What kind of hockey?", exact: true }).waitFor();
  await page.getByRole("button", { name: /High School \/ Youth Hockey/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "What is your Role?", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Player$/ }).count(), 0);
  await page.getByRole("button", { name: role }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // HS-only referral and non-player profile are shared by all three branches.
  await page.getByRole("heading", { name: "How did you find Roster?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("First name", { exact: true }).fill("Example");
  await page.getByLabel("Last name", { exact: true }).fill("Guardian");
  await page.getByLabel("Time zone", { exact: true }).fill("America/New_York");
  assert.equal(await page.getByText("Player Type", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
try {
  await mkdir(out, { recursive: true });
  await page.goto(`${origin}/questionnaire?preview=social_proof`);
  await page.getByRole("button", { name: /Choose my role/ }).click();
  await page.getByRole("heading", { name: "What kind of hockey?", exact: true }).waitFor();
  await page.getByText("3/10", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Adult Hockey/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("4/10", { exact: true }).waitFor();
  assert.equal(await page.getByText("Coming soon", { exact: true }).count(), 0);
  for (const role of ["Player", "Team Captain", "League Manager", "Tournament Organizer", "Scorekeeper"]) {
    await page.getByRole("button", { name: new RegExp(role) }).waitFor();
  }
  await page.getByRole("button", { name: /Team Captain/ }).click();
  await page.getByRole("heading", { name: "What is getting in your way?", exact: true }).waitFor();
  await noOverflow();
  mark("actual_questionnaire_inserts_hockey_type_3_of_10_and_preserves_five_adult_roles_and_pain_path");

  await page.goto(origin);
  await page.getByRole("button",{name:/Adult Hockey/}).click();
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  const compactRoles=page.locator(".hsy-adult-role-options > .hsy-choice");
  assert.equal(await compactRoles.count(),5);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    for(const role of ["Player","Team Captain","League Manager","Tournament Organizer","Scorekeeper"]){
      const option=page.getByRole("button",{name:role,exact:true});
      await option.click();
      assert.equal(await option.getAttribute("aria-pressed"),"true");
      const height=(await option.boundingBox())!.height;
      assert.ok(height>=44&&height<=66,`${role} should remain compact and tappable, got ${height}`);
    }
    await noOverflow();
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.getByRole("button",{name:"Continue",exact:true}).isEnabled(),true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(out,"compact-adult-roles.jpg")});
  mark("five_adult_role_options_stay_compact_and_selectable_at_390_and_320_pixels");

  await openHs(/^Coach or school staff/);
  await page.getByRole("heading", { name: "What's your role?", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Assistant Coach/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /^Northfield High School/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /Varsity 2026/ }).click();
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await page.getByRole("heading", { name: "Waiting for approval", exact: true }).waitFor();
  await noOverflow();
  await page.screenshot({ path: path.join(out, "staff-waiting.png"), fullPage: true });
  mark("staff_branch_referral_nonplayer_profile_school_team_and_pending_approval");

  await openHs(/^Parent of a player/);
  await page.getByRole("heading", { name: "Who are you setting up?", exact: true }).waitFor();
  await page.getByLabel("First name", { exact: true }).fill("Example");
  await page.getByLabel("Last name", { exact: true }).fill("Player");
  await noOverflow();
  await page.screenshot({ path: path.join(out, "parent-players.png"), fullPage: true });
  mark("parent_branch_has_player_intake_without_child_contact_or_player_type_setup");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Review player privacy", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Agree and continue", exact: true }).isDisabled(), true);
  await page.getByRole("checkbox", { name: /I'm this player's parent/ }).check();
  await page.getByRole("checkbox", { name: /I am the authorized adult/ }).check();
  await page.getByRole("button", { name: "Agree and continue", exact: true }).click();
  await page.getByRole("heading", { name: "Join your team", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Your family plan", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "You're all set", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Get setup code", exact: true }).isDisabled(), true);
  await noOverflow();
  mark("parent_consent_saved_join_later_and_completion_never_enables_child_activation");

  await openHs(/^Parent of a player/);
  await page.getByRole("heading", { name: "Who are you setting up?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add another player", exact: true }).click();
  for(let i=0;i<2;i++){
    await page.getByLabel("First name", {exact:true}).nth(i).fill(`Before${i+1}`);
    await page.getByLabel("Last name", {exact:true}).nth(i).fill("Example");
  }
  await page.getByRole("button", {name:"Continue",exact:true}).click();
  for(let i=0;i<2;i++){
    await page.getByRole("checkbox", {name:/I'm this player's parent/}).check();
    if(i===1)await page.getByRole("checkbox", {name:/I am the authorized adult/}).check();
    await page.getByRole("button", {name:"Agree and continue",exact:true}).click();
  }
  await page.getByRole("heading", {name:"Join your team",exact:true}).waitFor();
  const stagedInvitation="preview-parent-invitation-abcdef123456";
  await page.getByPlaceholder("Invitation link or token", {exact:true}).fill(stagedInvitation);
  await page.getByRole("button", {name:"Match",exact:true}).click();
  await page.getByRole("heading", {name:"Review player privacy",exact:true}).waitFor();
  await page.getByText("Consent for Imported · Player 1 of 2", {exact:true}).waitFor();
  for(let i=0;i<2;i++){
    assert.equal(await page.getByRole("button", {name:"Agree and continue",exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole("checkbox", {name:/I'm this player's parent/}).isChecked(),false);
    await page.getByRole("checkbox", {name:/I'm this player's parent/}).check();
    if(i===1)await page.getByRole("checkbox", {name:/I am the authorized adult/}).check();
    await page.getByRole("button", {name:"Agree and continue",exact:true}).click();
  }
  await page.getByRole("heading", {name:"Join your team",exact:true}).waitFor();
  assert.equal(await page.getByPlaceholder("Invitation link or token", {exact:true}).inputValue(),stagedInvitation);
  await page.getByText("Imported Forward", {exact:true}).waitFor();
  await page.getByText("Imported Goalie", {exact:true}).waitFor();
  await page.getByRole("button", {name:"Continue",exact:true}).click();
  await page.getByRole("heading", {name:"Your family plan",exact:true}).waitFor();
  await page.getByText("Invitation-backed player requests were submitted. Team access is still pending coverage and approval.", {exact:true}).waitFor();
  await page.getByRole("button", {name:"Continue",exact:true}).click();
  await page.getByRole("heading", {name:"You're all set",exact:true}).waitFor();
  for(const button of await page.getByRole("button", {name:"Get setup code",exact:true}).all())assert.equal(await button.isDisabled(),true);
  mark("staged_invitation_replaces_players_resets_all_consent_and_preserves_token_through_pending_join");

  await openHs(/^League admin/);
  await page.getByRole("heading", { name: "Create your High School / Youth league", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Adult", exact: true }).count(), 0);
  await page.getByLabel("League name", { exact: true }).fill("Example League");
  await page.getByLabel("State", { exact: true }).selectOption("Massachusetts");
  await page.getByLabel("Season", { exact: true }).selectOption("2026–27");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Add schools and teams", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add school", exact: true }).click();
  await page.getByLabel("School 1 name", { exact: true }).fill("Example School");
  await page.getByLabel("School 1 town", { exact: true }).fill("Example Town");
  await page.getByLabel("Team 1 name", { exact: true }).fill("Varsity");
  await page.getByRole("button", { name: /^Continue ·/ }).click();
  await page.getByRole("heading", { name: "Import your schedule", exact: true }).waitFor();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.getByRole("heading", { name: "Invite ADs and head coaches", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Plan and seats", exact: true }).waitFor();
  assert.equal(await page.getByRole("link").count(), 0);
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await page.getByRole("heading", { name: "Example League", exact: true }).waitFor();
  await noOverflow();
  mark("league_branch_uses_separate_hs_only_setup");

  await page.goto(origin);
  await page.getByRole("button", { name: /Open child-phone role demo/ }).click();
  for(const [index,char] of Array.from("K7P2QX").entries())await page.getByLabel(`Code character ${index+1}`, {exact:true}).fill(char);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Waiting for your parent", exact: true }).waitFor();
  await page.waitForTimeout(2200);
  assert.equal(await page.getByRole("heading", {name:/You're in/}).count(),0);
  await page.getByRole("button", {name:"Simulate approval on parent phone",exact:true}).click();
  await page.getByRole("heading", {name:"You're in, Preview",exact:true}).waitFor();
  await page.getByRole("button", {name:"Preview team chat",exact:true}).click();
  await page.getByLabel("Message this approved chat", {exact:true}).fill("Example team-only message");
  await page.getByRole("button", {name:"Send message",exact:true}).click();
  await page.getByText("Example team-only message", {exact:true}).waitFor();
  await page.getByRole("button", {name:"Preview family chat",exact:true}).click();
  await page.getByText("No messages yet.", {exact:true}).waitFor();
  assert.equal(await page.getByText("Example team-only message", {exact:true}).count(),0);
  await noOverflow();
  await page.screenshot({ path: path.join(out, "under18.png"), fullPage: true });
  mark("under18_preview_is_separate_and_clearly_simulated");
  await page.setViewportSize({width:1280,height:900});
  await noOverflow();
  mark("restricted_child_chat_composer_and_team_family_message_isolation_at_phone_and_desktop_widths");
  assert.equal(await page.evaluate(() => (window as any).__unexpectedCalls ?? 0), 0);
  assert.equal(report.providerCalls, 0);
  assert.deepEqual(report.browserErrors, []);
} catch (error) {
  await page.screenshot({ path: path.join(out, "failed-state.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(out, "result.json"), JSON.stringify(report, null, 2));
  await browser.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  console.log(JSON.stringify(report, null, 2));
}

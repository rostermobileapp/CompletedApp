// Real line editor; synthetic APIs only. No app database, real users or notifications.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { buildLineComboStats, type ComboHistoryRow } from "../shared/lineComboPredictions";

const players = ["a", "b", "c", "d", "e", "f"].map(id => ({
  userId: id, position: "C", user: { id, firstName: "Player", lastName: id.toUpperCase() },
}));
const rows: ComboHistoryRow[] = [];
for (let game = 1; game <= 6; game++) for (const [line, ids] of [[1, ["a", "b", "c"]], [2, ["d", "e", "f"]]] as const) {
  for (const id of ids) rows.push({
    lineId: `${game}-${line}`, gameId: String(game), lineType: "forward", playerId: id,
    points: { a: 1, b: 2, c: 0, d: 3, e: 0, f: 1 }[id],
  });
}
const stats = buildLineComboStats(rows);
const lines = [[1, ["a", "b", "c"]], [2, ["d", "e", "f"]]].map(([number, ids]) => ({
  id: `line-${number}`, name: `Line ${number}`, lineType: "forward", lineNumber: number,
  assignments: (ids as string[]).map((id, index) => ({
    playerId: id, position: ["LW", "C", "RW"][index],
    player: { id, firstName: "Player", lastName: id.toUpperCase() },
  })),
}));
let writes = 0;
const state = `
import React from 'react';import {QueryClient} from '@tanstack/react-query';
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
export async function apiRequest(method,url,data){const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(!r.ok)throw new Error('Fixture API failure');return r}
export function getImageUrl(path){return path}
export async function getAuthHeaders(){return {}}
export function useToast(){return {toast:()=>{}}}
export function useTeamAwardHolders(){return {data:[]}}
export function PlayerAwardBadges(){return null}
export function ClickableAvatar(){return <span/>}
export function ProfilePhotoPreview(){return null}
`;
const built = await build({
  stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClientProvider} from '@tanstack/react-query';import {queryClient} from 'fixture-state';
    import {LineManager} from './client/src/components/LineManager';
    function App(){
      React.useEffect(()=>{if(location.pathname==='/lines')document.querySelector('[data-testid="toggle-lines-view"]')?.click()},[]);
      return <main className="mx-auto max-w-3xl p-4"><LineManager teamId="fixture-team" isTeamCaptain teamMembers={${JSON.stringify(players)}}/></main>;
    }
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "esm", jsx: "automatic",
  loader: { ".png": "dataurl", ".jpg": "dataurl", ".webp": "dataurl", ".svg": "dataurl" },
  plugins: [{ name: "fixture", setup(b) {
    b.onResolve({ filter: /^(fixture-state|@\/lib\/queryClient|@\/hooks\/use-toast|@\/components\/team-awards\/TeamAwardHolders|@\/components\/ClickableAvatar|@\/components\/ProfilePhotoPreview)$/ },
      () => ({ path: "state", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: state, loader: "tsx", resolveDir: process.cwd() }));
  } }],
});
const css = await postcss([tailwindcss("./tailwind.config.ts")]).process(await readFile("client/src/index.css", "utf8"), { from: "client/src/index.css" });
createServer(async (req, res) => {
  if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(built.outputFiles[0].contents); }
  if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); return res.end(css.css); }
  if (req.url?.startsWith("/api/") || req.url === "/__writes") {
    res.setHeader("Content-Type", "application/json");
    if (req.method !== "GET") writes++;
    if (req.url === "/__writes") return res.end(JSON.stringify({ writes }));
    if (req.url.includes("/line-combos/stats")) return res.end(JSON.stringify(stats));
    if (req.url.endsWith("/line-combinations")) {
      const mixed = new URL(req.headers.referer ?? "http://fixture/").searchParams.has("mixed");
      const rendered = mixed ? lines.map((line, index) => ({
        ...line, assignments: line.assignments.map((assignment, slot) => slot === 0
          ? { ...assignment, playerId: index === 0 ? "d" : "a",
              player: { id: index === 0 ? "d" : "a", firstName: "Player", lastName: index === 0 ? "D" : "A" } }
          : assignment),
      })) : lines;
      return res.end(JSON.stringify(rendered));
    }
    return res.end("[]");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
}).listen(3002, "0.0.0.0", () => console.log("Isolated line-combo editor fixture ready"));

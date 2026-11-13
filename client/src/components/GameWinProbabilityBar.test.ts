import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";

const nativeRequire = createRequire(import.meta.url);
const prediction = {
  canViewDetails: true,
  homeTeamId: "home", awayTeamId: "away",
  homeWinProbability: 0.62, awayWinProbability: 0.38,
  moneylineHome: "-1900", moneylineAway: "+1900",
  overUnderLine: 8.5, overProbability: 0.64, underProbability: 0.36,
};
const props = {
  gameId: "game", homeTeamId: "home", awayTeamId: "away",
  homeTeamName: "Home team", awayTeamName: "Away team", viewerTeamIds: ["home"],
};

function load(path: string, mocks: Record<string, unknown>) {
  const code = buildSync({
    entryPoints: [path], bundle: true, write: false, format: "cjs",
    platform: "node", jsx: "automatic", packages: "external",
    external: ["@/hooks/useGamePrediction", "@/lib/queryClient", "@/lib/utils", "@/components/WinChanceSheet", "@/components/ui/dialog", "@/components/ui/badge", "@radix-ui/react-dialog", "lucide-react"],
  }).outputFiles[0].text;
  const module = { exports: {} as any };
  runInNewContext(code, {
    module, exports: module.exports, setTimeout, clearTimeout,
    require: (name: string) => mocks[name] ?? nativeRequire(name),
  });
  return module.exports;
}

function render(state: Record<string, unknown>, viewerTeamIds = ["home"]) {
  const { GameWinProbabilityBar } = load("client/src/components/GameWinProbabilityBar.tsx", {
    "@/hooks/useGamePrediction": { useGamePrediction: () => ({ refetch: async () => {}, ...state }) },
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
  });
  return renderToStaticMarkup(createElement(GameWinProbabilityBar, { ...props, viewerTeamIds }));
}

test("Home shows the signed-in team's green/red probability bar", () => {
  const home = render({ data: prediction });
  assert.match(home, /aria-valuenow="62"/);
  assert.match(home, /Chance to win/);
  assert.match(home, /#22c55e/);
  assert.match(home, /#ef4444/);
  assert.match(render({ data: prediction }, ["away"]), /aria-valuenow="38"/);
});

test("the prediction popup matches Home's thin green/red track and white marker", () => {
  const box = ({ children, ...props }: any) => createElement("div", props, children);
  const contentBox = ({ children, disableAnimation, closeClassName, ...props }: any) =>
    createElement("div", props, children);
  const { WinChanceSheet } = load("client/src/components/WinChanceSheet.tsx", {
    "@/components/ui/dialog": Object.fromEntries(
      ["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"].map(name => [
        name, name === "DialogContent" ? contentBox : box,
      ]),
    ),
    "@/components/ui/badge": { Badge: box },
  });
  const renderSheet = (viewerTeamId: string) => renderToStaticMarkup(createElement(WinChanceSheet, {
    open: true, onOpenChange: () => {}, ...props, viewerTeamId,
    prediction: {
      ...prediction,
      homeWinProbability: 0.95, awayWinProbability: 0.05,
      homeRecordSnapshot: { wins: 8, losses: 0, ties: 0, shootoutLosses: 1 },
      awayRecordSnapshot: { wins: 1, losses: 7, ties: 1, shootoutLosses: 0 },
      homeStreak: 3, awayStreak: -6,
      topScorersHome: Array.from({ length: 10 }, (_, index) => ({
        id: `skater-${index + 1}`,
        name: `Skater ${index + 1}`,
        projectedPoints: index === 0 ? 3.4 : index / 10,
        chanceOfPoint: 0.25,
        form: null,
      })),
      topScorersAway: [],
      expectedGoalsHome: 8.3, expectedGoalsAway: 3.5,
    },
  }));
  const home = renderSheet("home");
  assert.match(home, /h-1\.5/);
  assert.match(home, /h-3\.5/);
  assert.match(home, /bg-white/);
  assert.match(home, /bg-\[#22c55e\]" style="width:95%"/);
  assert.match(home, /left:95%/);
  assert.match(home, /Record 8-0-0-1/);
  assert.match(home, /Odds <span class="text-base font-extrabold text-primary tabular-nums">-1900<\/span>/);
  assert.match(home, /Over\/under/);
  assert.match(home, /8\.5 goals/);
  assert.match(home, /Over 64% · Under 36%/);
  assert.doesNotMatch(home, /Expected goals/);
  assert.match(home, /All skaters for your team/);
  assert.equal((home.match(/<li\b/g) ?? []).length, 10);
  assert.match(home, /3 pts · 25%/);
  assert.doesNotMatch(home, /3\.4 pts/);
  assert.match(home, /max-h-\[92dvh\]/);
  assert.match(home, /rounded-xl border border-primary\/20 bg-primary\/10 p-4/);
  assert.match(home, /rounded-xl border border-primary\/30 bg-primary\/20 p-3/);
  assert.doesNotMatch(home, /dark:bg-\[/);
  const away = renderSheet("away");
  assert.match(away, /bg-\[#ef4444\]" style="width:95%"/);
  assert.match(away, /bg-\[#22c55e\]" style="width:5%"/);
  assert.match(away, /Odds <span class="text-base font-extrabold text-primary tabular-nums">\+1900<\/span>/);
});

test("the prediction close button is easy to spot and keeps its accessible label", () => {
  const primitive = Object.fromEntries(
    ["Root", "Trigger", "Portal", "Overlay", "Content", "Close", "Title", "Description"].map(name => [
      name, ({ children, ...props }: any) => createElement(name === "Close" ? "button" : "div", props, children),
    ]),
  );
  const { DialogContent } = load("client/src/components/ui/dialog.tsx", {
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
    "@radix-ui/react-dialog": primitive,
    "lucide-react": { X: () => createElement("svg") },
  });
  const html = renderToStaticMarkup(createElement(DialogContent, {
    open: true, closeClassName: "h-10 w-10 border-primary/40 bg-primary/20",
  }));
  assert.match(html, /h-10 w-10 border-primary\/40 bg-primary\/20/);
  assert.match(html, /<svg/);
  assert.match(html, /class="sr-only">Close<\/span>/);
});

test("loading, failed and absent predictions never silently disappear for a rostered player", () => {
  assert.match(render({ isPending: true }), /Loading win chance/);
  assert.match(render({ isError: true }), /Retry win chance/);
  assert.match(render({ data: null, isPending: false }), /Win chance unavailable/);
  assert.doesNotMatch(render({ isPending: true }), /role="meter"/);
  assert.match(render({ data: prediction }, []), /Win chance unavailable for this team/);
});

test("the Home schedule integration renders predictions from the card's selected roster", () => {
  const { ScheduledGamePrediction } = load("client/src/components/ScheduledGamePrediction.tsx", {
    "@/hooks/useGamePrediction": { useGamePrediction: () => ({ data: prediction }) },
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
  });
  const game = {
    id: "game", homeTeamId: "home", awayTeamId: "away",
    homeTeam: { id: "home", name: "Mavericks" },
    awayTeam: { id: "away", name: "Neon Green" },
    isCompleted: false, homeScore: null, awayScore: null,
  };
  const renderSchedule = (overrides = {}, viewerTeams = [{ id: "home" }]) =>
    renderToStaticMarkup(createElement(ScheduledGamePrediction, { game: { ...game, ...overrides }, viewerTeams }));
  assert.match(renderSchedule(), /aria-valuenow="62"/);
  assert.match(renderSchedule(), /Mavericks estimated chance to win/);
  assert.match(renderSchedule({ homeTeamId: null, awayTeamId: null }), /aria-valuenow="62"/);
  assert.match(renderSchedule({ homeScore: 0, awayScore: 0 }), /aria-valuenow="62"/);
  assert.match(renderSchedule({}, []), /Win chance unavailable for this team/);
  assert.equal(renderSchedule({ isCompleted: true }), "");
  assert.equal(renderSchedule({ isTournamentMatch: true }), "");
  assert.equal(renderSchedule({ isScrimmage: true }), "");
});

test("Game Details keeps View Odds and exposes recoverable loading/error states", () => {
  const renderButton = (state: Record<string, unknown>) => {
    const { GamePredictionButton } = load("client/src/components/GamePredictionButton.tsx", {
      "@/hooks/useGamePrediction": { useGamePrediction: () => ({ refetch: async () => {}, ...state }) },
      "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
      "@/components/WinChanceSheet": { WinChanceSheet: () => null },
    });
    return renderToStaticMarkup(createElement(GamePredictionButton, props));
  };
  assert.match(renderButton({ data: prediction }), /View Odds/);
  assert.match(renderButton({ isLoading: true }), /Loading game prediction/);
  assert.match(renderButton({ isError: true }), /Retry game prediction/);
  const locked = renderButton({ data: { ...prediction, canViewDetails: false } });
  assert.match(locked, /button-game-prediction-locked/);
  assert.match(locked, /href="\/subscription"/);
  assert.match(locked, /Player Pro or Commissioner/);
  assert.doesNotMatch(locked, /dialog-win-chance/);
});

test("opening View Odds fetches the latest saved forecast instead of retaining three cached skaters", () => {
  let reads = 0;
  let opened = false;
  const { GamePredictionButton } = load("client/src/components/GamePredictionButton.tsx", {
    react: { ...nativeRequire("react"), useState: () => [false, (value: boolean) => { opened = value; }] },
    "@/hooks/useGamePrediction": { useGamePrediction: () => ({
      data: prediction, refetch: async () => { reads++; },
    }) },
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
    "@/components/WinChanceSheet": { WinChanceSheet: () => null },
  });
  const element = GamePredictionButton(props);
  element.props.children[0].props.onClick({ stopPropagation() {} });
  assert.equal(reads, 1);
  assert.equal(opened, true);
});

function optionsFor(request: () => Promise<unknown>) {
  const hook = load("client/src/hooks/useGamePrediction.ts", {
    "@tanstack/react-query": { useQuery: (options: unknown) => options },
    "@/lib/queryClient": { apiRequest: request },
  });
  return { options: hook.useGamePrediction("game", "home"), retry: hook.shouldRetryGamePrediction };
}

test("a transient prediction fetch recovers without a page reload", async () => {
  let calls = 0;
  const { options } = optionsFor(async () => {
    if (++calls === 1) throw new TypeError("Failed to fetch");
    return { json: async () => prediction };
  });
  const client = new QueryClient();
  try {
    const data = await client.fetchQuery({ ...options, retryDelay: 0 });
    assert.equal(data, prediction);
    assert.equal(calls, 2);
  } finally { client.clear(); }
});

test("retries remain bounded and never replay unauthorized requests", () => {
  const { retry } = optionsFor(async () => null);
  assert.equal(retry(0, new TypeError("Failed to fetch")), true);
  assert.equal(retry(1, { status: 503 }), true);
  assert.equal(retry(2, { status: 503 }), false);
  for (const status of [400, 401, 403, 404]) assert.equal(retry(0, { status }), false);
});

test("missing roster identity never enables a prediction request", () => {
  const hook = load("client/src/hooks/useGamePrediction.ts", {
    "@tanstack/react-query": { useQuery: (options: unknown) => options },
    "@/lib/queryClient": { apiRequest: () => { throw new Error("must not fetch"); } },
  });
  assert.equal(hook.useGamePrediction("game", undefined).enabled, false);
});

test("Home and Game Details share one request/cache key", async () => {
  let calls = 0;
  const { options } = optionsFor(async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { json: async () => prediction };
  });
  const client = new QueryClient();
  try {
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    assert.equal(calls, 1);
  } finally { client.clear(); }
});

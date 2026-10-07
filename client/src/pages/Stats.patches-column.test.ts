import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "esbuild";

// Render the real page's table markup without bypassing the application's auth.
const source = readFileSync("client/src/pages/Stats.tsx", "utf8");
const start = source.indexOf('<table className="w-full" data-testid="table-stats">');
const end = source.indexOf("</table>", start);
assert.ok(start >= 0 && end > start, "The stats table must exist");
const table = source.slice(start, end + "</table>".length);
const fixtureSource = `
function StatsTableFixture({ activeTab, sortBy, isTournamentContext = false }) {
  const stat = {
    type: activeTab === "goalies" ? "goalie" : "skater", userId: "fixture",
    user: { firstName: "Test", lastName: "Player" },
    goals: 2, assists: 3, points: 5, penaltyMinutes: 4, beers: 6,
    gamesPlayed: 10, wins: 4, losses: 2, ties: 1, goalsAgainstAverage: 2.5,
    shutouts: 3, patchesEarned: 7,
  };
  const getSortedStatsForTable = () => [stat];
  const membershipMap = new Map();
  const teamMap = new Map();
  const setActionSheetPlayer = () => {};
  const formatPlayerName = value => value.user.firstName + " " + value.user.lastName;
  const getInitials = () => "TP";
  const getImageUrl = () => "";
  const getPatchesEarned = value => value.patchesEarned || 0;
  const Avatar = ({ children, ...props }) => React.createElement("span", props, children);
  const AvatarFallback = Avatar;
  const AvatarImage = () => null;
  return (${table});
}`;
const compiled = transformSync(fixtureSource, { loader: "tsx", target: "es2020" });
const Fixture = new Function("React", `${compiled.code}\nreturn StatsTableFixture;`)(React);

function columns(activeTab: string, sortBy: string, isTournamentContext = false) {
  const html = renderToStaticMarkup(React.createElement(Fixture, { activeTab, sortBy, isTournamentContext }));
  const text = (value: string) => value.replace(/<[^>]*>/g, "").trim();
  const headers = Array.from(html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g), match => text(match[1]));
  const cells = Array.from(html.matchAll(/<td\b[^>]*>(.*?)<\/td>/g), match => text(match[1]));
  return { html, headers, cells };
}

for (const activeTab of ["skaters", "goalies"]) {
  test(`${activeTab}: opening Patches Earned puts its column and total immediately after Player`, () => {
    const { html, headers, cells } = columns(activeTab, "patchesEarned");
    assert.deepEqual(headers.slice(0, 3), ["#", "Player", "Patches"]);
    assert.equal(cells[2], "7");
    assert.equal(headers.filter(value => value === "Patches").length, 1);
    assert.equal((html.match(/data-testid="column-patches"/g) ?? []).length, 1);
    assert.equal((html.match(/data-testid="cell-patches"/g) ?? []).length, 1);
  });

  test(`${activeTab}: other stat categories preserve the existing trailing Patches column`, () => {
    const { headers, cells } = columns(activeTab, activeTab === "goalies" ? "wins" : "points");
    assert.equal(headers.at(-1), "Patches");
    assert.equal(cells.at(-1), "7");
    assert.notEqual(headers[2], "Patches");
  });

  test(`${activeTab}: tournaments do not show unsupported patch totals`, () => {
    const { html, headers } = columns(activeTab, "patchesEarned", true);
    assert.equal(headers.includes("Patches"), false);
    assert.equal(html.includes('data-testid="cell-patches"'), false);
  });
}

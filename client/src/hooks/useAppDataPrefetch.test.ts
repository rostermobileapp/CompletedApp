import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { runInNewContext } from "node:vm";

const bundle = buildSync({
  entryPoints: ["client/src/hooks/useAppDataPrefetch.ts"],
  bundle: true, write: false, format: "cjs", packages: "external",
}).outputFiles[0].text;

function render(enabled: boolean, pending: string[] = [], failed: string[] = []) {
  const calls: { queryKey: unknown[]; enabled: boolean; staleTime: number; retry: number }[] = [];
  const module = { exports: {} as any };
  runInNewContext(bundle, {
    module, exports: module.exports,
    require(name: string) {
      assert.equal(name, "@tanstack/react-query");
      return {
        useQuery(options: typeof calls[number]) {
          calls.push(options);
          const path = options.queryKey.join("/");
          const isPending = pending.includes(path);
          return {
            isPending, isError: failed.includes(path), isLoading: options.enabled && isPending,
            data: path === "/api/user/teams" ? [{ id: "team", leagueId: "league" }] : [],
          };
        },
      };
    },
  });
  module.exports.useAppDataPrefetch(enabled);
  return calls;
}

test("prefetch starts no requests before App supplies the account", () => {
  assert.equal(render(false).filter(query => query.enabled).length, 0);
});

test("Home requests start before ten lower-priority screen prefetches", () => {
  const calls = render(true, ["/api/user/games/upcoming"]);
  assert.equal(calls.length, 19);
  assert.equal(calls.filter(query => query.enabled).length, 9);
  for (const path of ["/api/conversations", "/api/user/stats/aggregate", "/api/payment-requests/created/by-me"]) {
    assert.equal(calls.find(query => query.queryKey.join("/") === path)?.enabled, false);
  }
  assert.equal(calls.find(query => query.queryKey[0] === "/api/user/personal-reminders")?.enabled, true);
  assert.equal(calls.find(query => query.queryKey[0] === "/api/user/team-events")?.enabled, true);
});

test("all background data still loads after Home settles, including failed Home requests", () => {
  assert.equal(render(true).filter(query => query.enabled).length, 19);
  assert.equal(render(true, [], ["/api/user/games/upcoming"]).filter(query => query.enabled).length, 19);
});

test("existing retry and freshness settings are preserved", () => {
  const calls = render(true);
  assert.ok(calls.every(query => query.retry === 2));
  assert.equal(calls.find(query => query.queryKey[0] === "/api/messages/unread-count")?.staleTime, 5000);
  assert.equal(calls.find(query => query.queryKey[0] === "/api/notifications")?.staleTime, 10000);
  assert.equal(calls.find(query => query.queryKey[0] === "/api/user/stats/aggregate")?.staleTime, 60000);
});

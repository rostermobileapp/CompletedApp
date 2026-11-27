import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

test("the actual coach hook polls, refreshes eligibility and retries acknowledgements without duplicate alerts", async () => {
  const source = await readFile("client/src/hooks/useSchoolEligibilityAlerts.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const notices: unknown[] = [], requests: { method: string; path: string }[] = [], invalidated: unknown[] = [];
  const shown = { current: new Set<string>() };
  let options: any, effect: (() => (() => void) | undefined) | undefined, failAck = true;
  const result = { data: { alerts: [{ id: "stable-alert-id" }] }, dataUpdatedAt: 1 };
  const client = { invalidateQueries: async (value: unknown) => { invalidated.push(value); } };
  const exports: any = {};
  vm.runInNewContext(compiled, {
    exports, require(name: string) {
      if (name === "react") return { useEffect: (fn: typeof effect) => { effect = fn; }, useRef: () => shown };
      if (name === "@tanstack/react-query") return {
        useQuery: (value: unknown) => { options = value; return result; }, useQueryClient: () => client,
      };
      if (name === "@/hooks/use-toast") return { toast: (value: unknown) => notices.push(value) };
      if (name === "@/lib/queryClient") return { apiRequest: async (method: string, path: string) => {
        requests.push({ method, path });
        if (method === "POST" && failAck) throw Error("Lost ACK");
        return { json: async () => result.data };
      } };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
  const render = (actor: string, team: string, enabled: boolean) => {
    exports.useSchoolEligibilityAlerts(actor, team, enabled); return effect!();
  };
  const cleanup = render("coach-a", "team-a", true);
  assert.equal(options.refetchInterval, 15_000);
  assert.equal(options.refetchOnWindowFocus, "always");
  assert.equal(options.enabled, true);
  await options.queryFn({ signal: undefined });
  await settle();
  assert.equal(notices.length, 1);
  assert.equal(invalidated.length, 2);
  assert.equal(requests.filter(r => r.method === "POST").length, 1);
  assert.equal(requests.find(r => r.method === "POST")?.path, "/api/high-school/staff/teams/team-a/eligibility-alerts/stable-alert-id/read");
  assert.ok(JSON.stringify(invalidated).includes("school-player-eligibility"));
  assert.ok(JSON.stringify(invalidated).includes("hs-staff"));
  cleanup?.();
  failAck = false; result.dataUpdatedAt++;
  render("coach-a", "team-a", true); await settle();
  assert.equal(notices.length, 1);
  assert.equal(requests.filter(r => r.method === "POST").length, 2);
  // The same ID in another account/team is not suppressed by the old scope.
  render("coach-b", "team-b", true); await settle();
  assert.equal(notices.length, 2);
  const before = requests.length;
  render("coach-b", "team-b", false); await settle();
  assert.equal(options.enabled, false);
  assert.equal(requests.length, before);
  assert.equal(notices.length, 2);
});

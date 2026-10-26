import { spawn } from "node:child_process";
import { buildTestDatabaseEnvironment } from "../server/testDatabaseEnvironment";

try {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^server\/(?:tests\/)?[\w.-]+\.(?:test|spec)\.ts$/.test(arg))) {
    throw new Error("Pass explicit server test file paths, not commands or runtime flags");
  }
  const files = args.length ? args : ["server/tests/testDatabaseIsolation.integration.test.ts"];
  const env = buildTestDatabaseEnvironment(process.env);
  const child = spawn(process.execPath, [
    "--import", "tsx", "--test", "--test-concurrency=1", ...files,
  ], { env, stdio: "inherit" });
  child.once("error", () => {
    console.error("[Tests] Could not start the isolated database test process.");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) console.error("[Tests] The isolated database test process was interrupted.");
    process.exitCode = code ?? 1;
  });
} catch {
  // Do not print exception objects: connection errors can contain credentials.
  console.error("[Tests] Refusing to start: verify the managed PG configuration, database isolation, and test file paths.");
  process.exitCode = 1;
}

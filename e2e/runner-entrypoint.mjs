import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const testOutputRoot = "/test-output";
const environmentDefaults = {
  CI: "true",
  E2E_RESULTS_DIR: `${testOutputRoot}/test-results`,
  PLAYWRIGHT_BLOB_OUTPUT_DIR: `${testOutputRoot}/blob-report`,
  CTRF_OUTPUT_FILE: `${testOutputRoot}/ctrf/ctrf-report.json`,
};

for (const [name, value] of Object.entries(environmentDefaults)) {
  process.env[name] ??= value;
}

if (!process.env.BASE_URL) {
  console.error("BASE_URL is required, for example http://host.docker.internal:4173");
  process.exit(2);
}

for (const directory of [
  process.env.E2E_RESULTS_DIR,
  process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR,
  dirname(process.env.CTRF_OUTPUT_FILE),
]) {
  mkdirSync(directory, { recursive: true });
}

const playwright = spawn(
  "./node_modules/.bin/playwright",
  ["test", ...process.argv.slice(2)],
  {
    env: process.env,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    playwright.kill(signal);
  });
}

playwright.once("error", (error) => {
  console.error(`Unable to start Playwright: ${error.message}`);
  process.exit(1);
});

playwright.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

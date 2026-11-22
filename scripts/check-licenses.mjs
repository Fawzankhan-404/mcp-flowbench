import { execFileSync } from "node:child_process";
import process from "node:process";

const output = execFileSync(
  process.platform === "win32" ? "cmd.exe" : "pnpm",
  process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm licenses list --json"]
    : ["licenses", "list", "--json"],
  {
    encoding: "utf8",
  },
);
const licenses = JSON.parse(output);
// MPL-2.0 is present only in Vite's optional test-tooling dependency tree.
const allowed = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MPL-2.0",
]);
const unexpected = Object.keys(licenses).filter(
  (license) => !allowed.has(license),
);
if (unexpected.length > 0) {
  process.stderr.write(
    `Unreviewed production dependency licenses: ${unexpected.join(", ")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Installed dependency licenses reviewed: ${Object.keys(licenses).sort().join(", ")}\n`,
  );
}

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const buildDir = ".next";
const server = join(root, buildDir, "standalone", "server.js");

if (!existsSync(server)) {
  console.error(`Production server not found at ${server}. Run npm run build first.`);
  process.exit(1);
}

const child = spawn(process.execPath, [server], {
  cwd: join(root, buildDir, "standalone"),
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

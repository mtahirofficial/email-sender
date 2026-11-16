import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";

const root = process.cwd();
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const maxAttempts = 3;

function run(command, args) {
  return new Promise((resolve) => {
    let tail = "";
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: ["inherit", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        process.stdout.write(chunk);
        tail = (tail + chunk).slice(-5000);
      });
    }
    child.on("error", (error) => resolve({ code: 1, retryable: false, error }));
    child.on("close", (code) => {
      const retryable = process.platform === "win32" && /EPERM|EBUSY/i.test(tail) && /unlink|rename/i.test(tail);
      resolve({ code: code ?? 1, retryable });
    });
  });
}

let build;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  build = await run(process.execPath, [nextCli, "build", "--webpack"]);
  if (build.code === 0) break;
  if (!build.retryable || attempt === maxAttempts) {
    if (build.error) console.error(build.error);
    process.exitCode = build.code;
    process.exit();
  }
  console.warn(`Windows temporarily locked a generated build file. Retrying production build (${attempt + 1}/${maxAttempts})...`);
  await delay(2000 * attempt);
}

const standalone = await run(process.execPath, [join(root, "scripts", "prepare-standalone.mjs")]);
process.exitCode = standalone.code;

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const buildDir = join(root, ".next");
const standalone = join(buildDir, "standalone");

for (const [source, destination] of [
  [join(root, "public"), join(standalone, "public")],
  [join(buildDir, "static"), join(standalone, ".next", "static")],
]) {
  if (!existsSync(source)) continue;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}

import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "dist");

if (existsSync(outDir)) {
  await rm(outDir, { recursive: true, force: true });
}

await mkdir(path.join(outDir, "src"), { recursive: true });
await cp(path.join(root, "index.html"), path.join(outDir, "index.html"));
await cp(path.join(root, "styles.css"), path.join(outDir, "styles.css"));
await cp(path.join(root, "src"), path.join(outDir, "src"), { recursive: true });
if (existsSync(path.join(root, "server"))) {
  await cp(path.join(root, "server"), path.join(outDir, "server"), { recursive: true });
}

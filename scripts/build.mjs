import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const distDir = path.join(root, "dist");
const xpi = path.join(distDir, "folder-import-0.1.1.xpi");

await rm(buildDir, { recursive: true, force: true });
await rm(distDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
await mkdir(distDir, { recursive: true });
await cp(path.join(root, "addon"), buildDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/bootstrap.ts")],
  outfile: path.join(buildDir, "bootstrap.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "firefox140",
  sourcemap: false,
  legalComments: "none",
});

await build({
  entryPoints: [path.join(root, "src/dialog.ts")],
  outfile: path.join(buildDir, "content/dialog.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "firefox140",
  sourcemap: false,
  legalComments: "none",
});

execFileSync("/usr/bin/zip", ["-X", "-q", "-r", xpi, "."], { cwd: buildDir });
execFileSync("/usr/bin/unzip", ["-tq", xpi]);
const digest = createHash("sha256").update(await readFile(xpi)).digest("hex");
await writeFile(`${xpi}.sha256`, `${digest}  ${path.basename(xpi)}\n`, "utf8");
console.log(xpi);

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { validateManifest, sha256 } from "./lib/manifest.mjs";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
if (!args[0] || rootIndex < 0 || !args[rootIndex + 1]) throw new Error("usage: node tools/migrate-legacy.mjs <legacy-lock.json> --root <export-root>");
const root = resolve(args[rootIndex + 1]);
const lock = JSON.parse(readFileSync(resolve(args[0]), "utf8"));
const pathOf = (p) => isAbsolute(p) ? p : resolve(root, p);
const planned = [];
for (const [key, entry] of Object.entries(lock.entries)) {
  if (entry.kind !== "effect") continue;
  const issues = [];
  const outputs = Object.entries(entry.outputs);
  for (const [path] of outputs) if (!pathOf(path).startsWith(root + sep)) throw new Error("output outside export root");
  if (!entry.tool.commit) issues.push("legacy export has no source commit; rebuild required");
  for (const [p, hash] of outputs) {
    if (!existsSync(pathOf(p))) issues.push(`missing output ${p}`);
    else if (sha256(readFileSync(pathOf(p))) !== hash) issues.push(`changed output ${p}`);
  }
  const proof = { ok: false, metrics: { legacyProof: entry.proof, legacyCodeHash: entry.tool.code ?? null, migrationIssues: issues.length ? issues : ["legacy version is unknown; rebuild required"] } };
  for (const [p] of outputs) {
    const file = `${pathOf(p)}.manifest.json`, base = dirname(file);
    if (existsSync(file)) throw new Error(`refusing to overwrite ${file}`);
    const paths = (entries) => Object.fromEntries(entries.map(([path, hash]) => [relative(base, pathOf(path)).replaceAll("\\", "/"), hash]));
    const manifest = validateManifest({ tool: "pixelfx", toolVersion: "unknown", toolCommit: entry.tool.commit ?? "unknown", inputs: paths(Object.entries(entry.inputs)), outputs: paths(outputs), proof, builtAt: entry.builtAt });
    planned.push([file, manifest, key]);
  }
}
for (const [file, manifest, key] of planned) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(`${key}: BLOCKED legacy provenance -> ${file}`);
}
console.log(`${planned.length} sidecars; legacy lock and outputs unchanged`);

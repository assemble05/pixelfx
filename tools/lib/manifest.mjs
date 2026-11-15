import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.trim().length > 0;
const date = (v) => text(v) && /^\d{4}-\d{2}-\d{2}(T.*Z)?$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v.slice(0, 10);
const json = (v) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (Array.isArray(v) && v.every(json)) || (object(v) && Object.values(v).every(json));
function fields(value, required, optional = []) {
  if (!object(value) || required.some((k) => !Object.hasOwn(value, k)) || Object.keys(value).some((k) => ![...required, ...optional].includes(k))) throw new Error("manifest has missing or unknown fields");
}
export function validateManifest(value) {
  fields(value, ["tool", "toolVersion", "toolCommit", "inputs", "outputs", "proof", "builtAt"]);
  if (value.tool !== "pixelfx" || !/^(?:\d+\.\d+\.\d+|unknown)$/.test(value.toolVersion) || !/^(?:[a-f0-9]{40}|unknown)$/.test(value.toolCommit) || !date(value.builtAt) || !value.builtAt.includes("T")) throw new Error("invalid manifest identity or date");
  for (const hashes of [value.inputs, value.outputs]) {
    if (!object(hashes) || !Object.keys(hashes).length || Object.entries(hashes).some(([p, h]) => !text(p) || isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.includes("\\") || !/^[a-f0-9]{64}$/.test(h))) throw new Error("invalid manifest hashes");
  }
  fields(value.proof, ["ok", "metrics"], ["accepted"]);
  if (typeof value.proof.ok !== "boolean" || !object(value.proof.metrics) || !json(value.proof.metrics)) throw new Error("invalid manifest proof");
  if (value.proof.ok && (value.toolVersion === "unknown" || value.toolCommit === "unknown")) throw new Error("unknown provenance cannot pass proof");
  if (Object.hasOwn(value.proof, "accepted")) {
    fields(value.proof.accepted, ["by", "reason", "date"]);
    if (![value.proof.accepted.by, value.proof.accepted.reason].every(text) || !date(value.proof.accepted.date)) throw new Error("invalid human acceptance");
  }
  return value;
}
function files(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
export function certifyEffect(id, outputs, options = {}) {
  for (const name of Array.isArray(id) ? id : [id]) {
    if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(name) || !existsSync(join(ROOT, "src/fx", `${name}.js`))) throw new Error("unknown effect for proof");
  }
  const checkArgs = [join(ROOT, "tools/check.mjs"), ...(Array.isArray(id) ? id : [id])];
  for (const name of ["opts", "fps", "seed"]) if (options[name] !== undefined) checkArgs.push(`--${name}`, String(options[name]));
  const result = spawnSync(process.execPath, checkArgs, { cwd: ROOT, encoding: "utf8", windowsHide: true });
  const proof = { ok: result.status === 0, metrics: { checkExit: result.status, diagnostic: (result.stdout + result.stderr).trim(), options } };
  writeCertificates(outputs, proof);
  return proof;
}
export function certifyPreview(outputs) {
  writeCertificates(outputs, { ok: false, metrics: { status: "preview-only; export with checked command for game use" } });
}
function writeCertificates(outputs, proof) {
  const toolVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  const toolCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", windowsHide: true }).trim();
  const inputs = [join(ROOT, "package.json"), ...files(join(ROOT, "src")), ...files(join(ROOT, "tools"))];
  for (const output of outputs) {
    const base = dirname(resolve(output));
    const hashes = (paths) => Object.fromEntries(paths.map((p) => [relative(base, resolve(p)).replaceAll("\\", "/"), sha256(readFileSync(p))]));
    const manifest = validateManifest({ tool: "pixelfx", toolVersion, toolCommit, inputs: hashes(inputs), outputs: hashes(outputs), proof, builtAt: new Date().toISOString() });
    writeFileSync(`${output}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  }
}

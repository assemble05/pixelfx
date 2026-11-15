import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sha256, validateManifest, certifyEffect } from "../tools/lib/manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specimen = () => ({ tool: "pixelfx", toolVersion: "0.3.0", toolCommit: "a".repeat(40), inputs: { "source.js": "a".repeat(64) }, outputs: { "sheet.png": "b".repeat(64) }, proof: { ok: false, metrics: {} }, builtAt: "2026-11-15T00:00:00Z" });
test("closed shape rejects unknown fields and malformed acceptance", () => {
  assert.doesNotThrow(() => validateManifest(specimen()));
  for (const mutate of [v => v.extra = true, v => v.proof.extra = true, v => v.outputs = {}, v => v.proof.ok = "yes", v => v.proof.accepted = true, v => v.proof.accepted = { by: "Joao", reason: "", date: "2026-11-15" }]) {
    const value = specimen(); mutate(value); assert.throws(() => validateManifest(value));
  }
  const value = specimen(); value.proof.accepted = { by: "Joao", reason: "intentional", date: "2026-11-15" };
  assert.equal(validateManifest(value).proof.ok, false);
});
test("real render certifies every output with check proof and exact hashes", () => {
  const dir = mkdtempSync(join(tmpdir(), "pixelfx-manifest-"));
  try {
    const result = spawnSync(process.execPath, ["tools/render.mjs", "fire/torch", "--sheet", "--out", dir], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const out = join(dir, "fire/torch"), files = readdirSync(out);
    const outputs = files.filter(f => !f.endsWith(".manifest.json"));
    assert.equal(outputs.length, 3);
    for (const file of outputs) {
      const manifest = validateManifest(JSON.parse(readFileSync(join(out, `${file}.manifest.json`), "utf8")));
      assert.equal(manifest.proof.ok, true);
      assert.equal(manifest.proof.metrics.checkExit, 0);
      assert.equal(manifest.tool, "pixelfx");
      for (const [path, hash] of Object.entries(manifest.outputs)) assert.equal(sha256(readFileSync(resolve(out, path))), hash);
    }
    writeFileSync(join(out, outputs[0]), "changed");
    const manifest = JSON.parse(readFileSync(join(out, `${outputs[0]}.manifest.json`)));
    assert.notEqual(sha256(readFileSync(join(out, outputs[0]))), manifest.outputs[outputs[0]]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("legacy migration retains hashes and refuses unsupported provenance", () => {
  const dir = mkdtempSync(join(tmpdir(), "pixelfx-legacy-"));
  try {
    writeFileSync(join(dir, "asset.png"), "old");
    const hash = sha256(Buffer.from("old"));
    const lock = { entries: { "effect:fire/torch": { kind: "effect", tool: { commit: null, code: "old-code" }, inputs: { "source.js": hash }, outputs: { "asset.png": hash }, proof: { ok: true }, builtAt: "2026-11-01T00:00:00Z" } } };
    const body = JSON.stringify(lock); writeFileSync(join(dir, "lock.json"), body);
    const run = () => spawnSync(process.execPath, ["tools/migrate-legacy.mjs", join(dir, "lock.json"), "--root", dir], { cwd: root, encoding: "utf8" });
    assert.equal(run().status, 0);
    const manifest = validateManifest(JSON.parse(readFileSync(join(dir, "asset.png.manifest.json"))));
    assert.equal(manifest.outputs["asset.png"], hash);
    assert.equal(manifest.proof.ok, false);
    assert.equal(manifest.toolCommit, "unknown");
    assert.equal(readFileSync(join(dir, "lock.json"), "utf8"), body);
    assert.equal(run().status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("configured variant proof checks the actual fps and seed", () => {
  const dir = mkdtempSync(join(tmpdir(), "pixelfx-variant-"));
  try {
    const output = join(dir, "asset.png"); writeFileSync(output, "fixture");
    const failed = certifyEffect("fire/torch", [output], { fps: "0", seed: "2" });
    assert.equal(failed.ok, false);
    assert.match(failed.metrics.diagnostic, /fps must be/);
    assert.equal(JSON.parse(readFileSync(`${output}.manifest.json`)).proof.ok, false);
    const passed = certifyEffect("fire/torch", [output], { fps: "12", seed: "2", opts: "{}" });
    assert.equal(passed.ok, true, passed.metrics.diagnostic);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("comparison previews also get explicitly unapproved sidecars", () => {
  const dir = mkdtempSync(join(tmpdir(), "pixelfx-preview-"));
  try {
    const file = join(dir, "compare.png");
    const result = spawnSync(process.execPath, ["tools/compare.mjs", "fire/torch", "--out", file], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const manifest = validateManifest(JSON.parse(readFileSync(`${file}.manifest.json`)));
    assert.equal(manifest.proof.ok, false);
    assert.equal(manifest.outputs["compare.png"], sha256(readFileSync(file)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("legacy missing outputs remain visible and paths cannot escape the export root", () => {
  const dir = mkdtempSync(join(tmpdir(), "pixelfx-missing-"));
  try {
    const hash = "a".repeat(64);
    const entry = { kind: "effect", tool: { commit: null }, inputs: { "source.js": hash }, outputs: { "missing.png": hash }, proof: { ok: true }, builtAt: "2026-11-01T00:00:00Z" };
    const lock = { entries: { "effect:fire/torch": entry } };
    const file = join(dir, "lock.json"); writeFileSync(file, JSON.stringify(lock));
    const run = () => spawnSync(process.execPath, ["tools/migrate-legacy.mjs", file, "--root", dir], { cwd: root, encoding: "utf8" });
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(readFileSync(join(dir, "missing.png.manifest.json"))).proof.ok, false);
    entry.outputs = { "../escape.png": hash }; writeFileSync(file, JSON.stringify(lock));
    const result = run(); assert.equal(result.status, 1); assert.match(result.stderr, /outside export root/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

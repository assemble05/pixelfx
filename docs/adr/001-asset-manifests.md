# 001. Effects own their manifests

Accepted. Each effect export writes a sidecar for every output, including previews and sheet metadata. Paths are relative to the sidecar directory. The output map covers the whole export and excludes sidecars to avoid circular hashes.

The closed shape is `{ tool, toolVersion, toolCommit, inputs, outputs, proof, builtAt }`. `inputs` and `outputs` map paths to SHA-256. `proof` contains `ok`, `metrics`, and optional `accepted` with `by`, `reason`, and `date`. A field addition requires another ADR. Metrics retain the deterministic check's exit status and diagnostics. Existing timing warnings are informational.

The exporter passes its `--opts`, `--fps`, and `--seed` to the same checker. These options therefore participate in proof. Shared PNG and video writers attach failed, preview-only manifests to diagnostic output; explicit checked exports replace these with checked proof. This covers comparison and montage previews without granting them a gameplay verdict.

This tool neither imports nor calls another asset tool. The game developer selects versions. The consumer verifies proof, declared versions, and output hashes without converting assets. AI produces inputs or reads findings. Only code produces `ok`; a person can record an acceptance with a reason.

Human findings become issues in this repository and retain the failing case as a regression fixture. A deliberate acceptance stays visible in the manifest. Outputs are never manually repaired to pass checks.

Historical exports without a source commit cannot claim one. Migration preserves the old hashes, proof, code hash, and date, but marks proof false and uses `unknown` for absent identity. Rebuild with this version to obtain new proof. No historical lock or output is removed.

# pixelfx

This tool renders deterministic pixel effects. It owns effect geometry, seeded rendering, frame timing, canvas bounds, and effect proof.

- Read the relevant effect and `tools/check.mjs` before changing an effect rule.
- Run `npm test` and `npm run check` before committing.
- Exported assets carry `<filename>.manifest.json`. The closed fields are defined in `tools/lib/manifest.mjs`. A new field requires an ADR.
- Code decides `proof.ok`. AI may generate inputs and explain diagnostics, never approve proof.
- A human acceptance contains `by`, `reason`, and `date`, remains visible, and does not change `proof.ok`.
- A human finding becomes an issue here with its failing input as a test fixture. Add the regression before the fix. Never edit the asset to pass.
- This repository never imports, invokes, or locates another asset tool.

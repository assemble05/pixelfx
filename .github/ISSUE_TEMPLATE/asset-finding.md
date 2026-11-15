---
name: Asset finding
about: A failed effect case that needs a regression fixture
title: "Effect finding: "
---

## Reproduce

Provide the original input or effect ID, command, options, tool version and commit, and output manifest.

## Expected and observed

Describe the human finding and include the deterministic diagnostic. A visual opinion does not change `proof.ok`.

## Regression fixture

Keep the failing input under `test/fixtures/` and add a failing test before changing the implementation. Do not modify an output image, relax a threshold, or change a reference to make the case pass.

## Human acceptance

If the case is intentional, record who accepted it, why, and the date in the manifest. Acceptance does not change `proof.ok`.

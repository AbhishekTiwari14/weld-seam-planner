# Milestone 3 verification

Verified locally on 5 November 2026 on `feat/seam-planning-core`, based on merged Milestone 2 (`1144146`). No push, merge, rebase or deployment was performed. Remote CI for these commits has **not** run. The existing GitHub Actions workflow already runs all the commands below and automatically discovers the new tests; no CI configuration or dependency version changes were needed.

## Final automated gates

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 131 packages installed, existing R3F patch applied, zero audit vulnerabilities reported |
| `npm run typecheck` | Passed under the existing strict TypeScript configuration |
| `npm test` | **135 passed, 0 failed**, across 11 files |
| `npm run build` | Passed; 214 modules transformed |
| `npm run test:browser` | **10 passed, 0 failed**: all six M2 cases preserved plus four M3 cases |
| `npm run test:production` | Passed against the built app: import, actual surface authoring, parameters, sequence, review, downloaded JSON and no debug API |
| `npm run schema:generate` and `git diff --exit-code -- schemas fixtures` | Passed; no schema or fixture drift |

Known tool output remains visible: the lazy viewport chunk is approximately 1,015 kB minified / 271 kB gzip, so Vite reports its size warning. The Node R3F timing test emits Three.js's separate CommonJS-import deprecation warning. Browser tests deliberately simulate unavailable WebGL in one case, which logs the expected renderer/error-boundary errors. No tests were skipped, no retries or arbitrary sleeps were added, and no timeouts were increased. The application does not emit the deprecated Clock warning in the browser checks.

## New automated coverage

Domain tests cover draft/commit isolation, UUID uniqueness, point bounds/coincidence/capacity, rename/delete, independent targets, unchanged-value revisions, invalid/intermediate text, exact sequence permutations, empty/incomplete export rejection and deterministic external-job round trips. Store tests retain an edited plan after failed/cancelled import, reject stale-workpiece edits, preserve asset identity on plan changes, and atomically clear the document on successful replacement.

The four new real-browser cases exercise:

1. A two-point and a three-point path created with actual mouse events and production surface picking, cm normalization, names, independent target values, line selection, reordering, review metrics, warning evidence, download filename, SHA-256, UUIDs, point order and exact exported coordinates. Downloaded JSON passes the checked-in JSON Schema through Ajv and semantic validation through `validateWeldJob`. A second download with an unfinished draft is byte-identical.
2. Orbit, pan, zoom, modified clicks and empty-space clicks without point creation; duplicate-point rejection, Backspace, Escape and Enter; intermediate/nonfinite/zero/negative parameter inputs; Apply/Discard, null targets, unchanged numeric revisions and confirmed/cancelled deletion.
3. Three cycles of creating a configured seam plus a new draft, failing/cancelling replacement and comparing preserved JSON, then successful replacement. Each new workpiece is required to complete its own first render and return to exactly **one** GPU geometry. A selected straight seam has five geometries, including its owned overlays; dark line casings share geometry.
4. A 50,000-triangle layered binary STL with a `solid` header, reversed face winding and an occluded lower surface. The real worker builds the BVH; real production clicks must pick the upper surface and produce externally valid JSON. No test injects seams or document state.

The analytic workflow and built-production workflow use an independent test-side camera projection to locate clicks, with no application debug API. The replacement/resource case uses the existing read-only renderer diagnostic for synchronization. The BVH case clicks visible canvas locations without debug helpers. Production smoke uses inches and verifies approximately -127 mm X / 127 mm Z for a known picked source point, plus exact equality between ordered-point tooltips and downloaded positions.

## Additional model checks and measured observations

Reference: Windows 10 / Intel Core i3-6006U @ 2.00 GHz / 7.88 GiB RAM; Chrome 156.0.8078.49; Node 24.11.1; 1280 × 720. Existing local M2 fixtures were reused without redistributing external meshes. Sources and hashes for the two holdouts are in [the M2 inventory](milestone-2-verification.md#unfamiliar-models); the envelope cases come from `scripts/generate-profile-models.ts`.

All four below imported, accepted a real three-point UI seam, accepted illustrative parameter inputs, reviewed and downloaded a semantically valid JSON job. Source metadata, camera and geometry revision stayed unchanged during plan edits; each subsequent workpiece started with one GPU geometry. No page errors occurred.

| Model | Triangles | Import through first render | Parse / prepare / BVH | Maximum sampled successful pick |
| --- | ---: | ---: | ---: | ---: |
| `torus.STL` (curved holdout) | 8,700 | 2.54 s | 27.7 / 22.3 / 0 ms | 14.0 ms |
| `counter.unitsmm.STL` (mechanical holdout) | 83,750 | 1.48 s | 109.3 / 90.3 / 164.3 ms | 2.7 ms |
| `curved-500000.stl` (authored envelope) | 500,000 | 3.53 s | 418.8 / 389.8 / 534.6 ms | 0.3 ms |
| `ascii-50mib.stl` (exactly 50 MiB) | 250,000 | 6.03 s | 3,800.8 / 210.9 / 272.4 ms | 0.2 ms |

These are single local development runs, not performance guarantees or a new capacity benchmark. Import times include worker startup, digest, automation and confirmation. A 35-position screen grid was sampled through the existing development picker to locate three actual surface clicks; reported maxima cover successful hits only. The selected points were committed through production UI events, never through direct state injection. Geometry need not represent a sensible welding joint; these are interaction/export checks, not evidence of welding feasibility. No new peak-memory or sustained-framerate claim is made. The M2 resource guards remain unchanged.

Raw evidence and images remain ignored in `.local/evidence/m3-model-checks.json`, `.local/evidence/m3-*.png` and `.local/evidence/production*.png`. The local probe is `.local/check-m3-models.ts`; it is not a CI dependency. Browser-suite screenshots are in the ignored Playwright output folders. The workbench, parameter panel, review dialog and curved-model overlay were visually inspected at 1280 × 720.

## Defects found and resolved

- The initial new browser test expected an exact 600 mm length from screen-projected input. Actual picked coordinates gave 600.0001 mm. The assertion now derives length/time independently from the UI's stored coordinates and permits only display rounding, while separately checking proximity to the analytic values. No geometry was rounded to satisfy a test.
- The 50 MiB model exposed a pre-existing external-job validator defect: Chrome computed a turn of `94.26362249342733°`, while Node recomputed `94.26362249342735°`. Exact JSON equality rejected a valid browser export. The captured coordinates first failed an automated regression, then passed after adding a documented `32 × EPSILON × max(1, |a|, |b|)` allowance only for derived warning measurements. Exact warning identities/membership/counts and all geometry/parameter rules remain enforced. Larger forged changes, missing/duplicate records and wrong references still fail. Schema and heuristic thresholds are unchanged; numerical consumer policy is clarified in [the contract documentation](weld-job-v1.md#engineering-review).
- Visual inspection found insufficient contrast in light unselected lines against the shaded plate. Dark casings now share the original line geometry and have separately disposed materials. Actual geometry-count assertions still pass.

## Remaining limits and review handoff

There are no known failing M3 acceptance cases after these corrections. This does not establish correctness on every browser or imported part. Remote Linux CI and Firefox/Safari have not been verified for these commits. Extremely boundary-adjacent warning classification can still differ across numerical implementations; external validation deliberately continues to require the same warning set.

Straight connecting chords are not proven surface-conforming. Overlay visibility through the mesh is explicit; only actual surface placement uses occlusion. Close/overlapping seams may require list selection. Sessions are memory-only and are lost on refresh. Committed point insertion/replacement, reversal UI, undo/redo and clickable diagnostics remain M4. No candidate detection, robot execution, persistence or deployment was added.

Use [the exact manual acceptance procedure](seam-planning.md#manual-acceptance-procedure) before approving Milestone 4. The document transaction boundary, transient draft state and separated overlay ownership provide the foundation for recoverable point editing and history, but those features are not implemented here.

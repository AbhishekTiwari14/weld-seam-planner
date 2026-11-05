# Milestone 4 verification

Verified locally on 5 November 2026 on `feat/seam-editor-history`, based on merged M3/main `035d50e`. No push, merge, rebase, deployment or later milestone work was performed. Remote GitHub Actions has **not** run for these commits. The existing workflow already discovers the new tests and runs the required gates; no CI configuration, dependency versions, parser or exported schema changes were needed.

## Automated gates

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 131 packages, existing R3F patch applied, zero audit vulnerabilities reported |
| `npm run typecheck` | Passed under the existing strict configuration |
| `npm test` | **156 passed, 0 failed**, across 13 files; all 135 existing tests retained |
| `npm run build` | Passed; 220 modules transformed |
| `npm run test:browser` | **16 passed, 0 failed** in 3.8 minutes; all 10 existing cases plus six M4 cases |
| `npm run test:production` | Passed against the built app: surface replacement, undo/redo, exact export and all previous production checks |
| `npm run schema:generate` and `git diff --exit-code -- schemas fixtures` | Passed; no schema or fixture drift |

Known existing output remains visible: Vite warns about the lazy viewport chunk (1,016.73 kB minified / 271.79 kB gzip). The Node R3F timer regression emits Three.js's separate CommonJS-import deprecation warning. The deliberate unavailable-WebGL browser case logs renderer/error-boundary errors. None of these warnings is suppressed. No existing tests were removed, weakened, skipped or given retries/longer timeouts.

## New coverage

The 21 new unit cases exercise point ID preservation, immutable operations, consecutive-endpoint insertion, min-two removal, newly coincident neighbors, invalid/nonfinite/bounds rejection, global/per-seam capacities, reverse-twice traversal, stale edit intents and stable-ID selection validity. Controller history is checked for each of the nine committed operations, exact deletion restoration including parameters/sequence, monotonic revisions, no-ops, invalid edits, redo invalidation, import failure/cancellation/success, bounded capacity, validation before restoration, snapshot isolation and a 100-seam/10,000-point document.

Six new browser cases use genuine DOM pointer events, actual WebGL, the real worker and the production nearest-surface picker. No committed planning state is injected:

1. Replace and insert on a known analytic plate imported as cm; verify preview does not change revision/content, one Apply transaction, stable/new IDs, removal/undo/redo, double reversal, authoritative mm coordinates, unchanged source/camera/STL geometry, Ajv schema validation, semantic validation and byte-identical repeat download.
2. Undo/redo execution order, delete a configured seam and restore its exact IDs/points/parameters/sequence, redo its deletion and clear selection, then make a new edit that clears redo. Verify parameter-input resynchronization, native Ctrl+Z inside a name input, global Ctrl+Z/Ctrl+Shift+Z, dirty-input history blocking, draft cancellation and min-two removal protection.
3. Reject coincident adjacent replacements; orbit/pan/zoom and misses cannot commit; staged replacement and insertion cancel without document/history changes.
4. Click short-segment/turn diagnostics in inspector and review; assert exact endpoint/point references and corresponding pressed inspector control. Five selection cycles allocate/release the actual highlight geometries (5 → 8 → 7 → 5). Five real replacement/undo/redo cycles return to five geometries with unchanged STL identity, camera and source frame.
5. Failed/cancelled replacement imports retain both history stacks and the staged point candidate. A successful replacement clears plan/history/editor state, renders its own new geometry revision, and returns to exactly one GPU geometry. Enter cannot apply an old callback to the new model.
6. Replace and insert on a 50,000-triangle layered binary STL with a `solid` header, reverse winding and an occluded lower surface. The real BVH picker must select the upper surface; all exported Z coordinates are 127 mm for source Z=5 inches. Old endpoint IDs and exact intended final coordinates survive.

Production smoke retains the previous complete flow and adds a real surface replacement with undo/redo before export. It verifies point IDs, exact edited positions, inches-to-mm conversion, parameters, sequence and absence of development diagnostics. The browser suite's 10 previous tests remain unchanged.

## Visual and large-model checks

Reference machine: Windows 10, Intel Core i3-6006U @ 2.00 GHz, 7.88 GiB RAM, Chrome 156.0.8078.49, Node 24.11.1; viewport 1280 × 720. The replacement preview and diagnostic-selection screenshots were visually inspected: the original path, provisional chords, selected geometry, explicit modes and history controls remain readable within the existing workbench layout.

Existing local M2 holdouts and generated acceptance-envelope fixtures were reused without redistributing outside assets. Each model imported, accepted a three-point UI seam and test parameters, replaced its second point, inserted one point, completed five Undo/Redo cycles and exported semantically valid JSON with the exact displayed coordinates. Each remained at five GPU geometries after highlight cleanup; subsequent imports returned to one after the new workpiece's first render. No page errors occurred. Source provenance, camera and STL geometry revision were unchanged through edits/history.

| Model | Triangles | Import through first render | Parse / prepare / BVH | Maximum sampled successful pick |
| --- | ---: | ---: | ---: | ---: |
| Curved holdout `torus.STL` | 8,700 | 1.93 s | 22.5 / 18.5 / 0 ms | 8.3 ms |
| Mechanical holdout `counter.unitsmm.STL` | 83,750 | 1.52 s | 81.3 / 64.6 / 138.1 ms | 1.6 ms |
| Authored `curved-500000.stl` | 500,000 | 2.74 s | 605.8 / 311.6 / 414.8 ms | 0.2 ms |
| Exact-envelope `ascii-50mib.stl` | 250,000 | 4.69 s | 3,403.3 / 174.4 / 203.0 ms | 0.1 ms |

These are single local runs, not latency guarantees. Import totals include worker startup, digest, automation and confirmation. A 35-position screen grid used the existing read-only development picker to locate actual surface clicks; maxima cover successful picks only. Edits were still made exclusively through production pointer/UI actions. They test correctness and ownership, not whether the selected paths describe sensible weld joints. No new browser peak-memory or sustained-framerate claim is made.

Raw evidence and images are ignored in `.local/evidence/m4-model-checks.json`, `.local/evidence/m4-*.png`, production screenshots and Playwright's output folder. The local model probe is `.local/check-m4-models.ts`. Fixture URLs/provenance remain in [M2's inventory](milestone-2-verification.md#unfamiliar-models).

## Bounded history measurements

Reproduce with `node --expose-gc scripts/profile-history.ts`. The final sequential run used a valid 100-seam/10,000-point authored document, 100 renames and 30 Undo/Redo pairs; it did not run concurrently with browser tests. The probe includes pure operation validation plus history recording/restoration, not controller overhead, React work or GPU rendering.

- Accounted snapshot storage reached **15,730,220 bytes / 11 states**, then remained flat from edit 40 through edit 100 and all history traversals. The configured limit remains 16 MiB / 50 combined states, not a fixed promise of 50 full-size states.
- Node heap after explicit GC: 15.61 MB baseline; 26.34–26.35 MB after edits 20–100; 26.91 MB after the traversal run. These are decimal MB allocation snapshots, not peak memory/RSS or browser memory guarantees.
- Pure edit + record: median **58.9 ms**, maximum **120.2 ms**. Undo: median **39.3 ms**, maximum **48.3 ms**. Redo: median **42.7 ms**, maximum **49.9 ms**. Revision ended at 160, never moving backwards.

Full-plan validation/serialization is synchronous and can produce noticeable pauses near the upper point limit, especially with UI/controller work added or other applications competing for memory/CPU. Hover performs neither operation. The measured bounded behavior does not justify a new worker/dependency for this milestone; browser latency on a fully populated 10,000-point UI has not been established.

## Issues found during verification and remaining limits

- The first new test read edit attributes from the canvas instead of its focusable parent viewport region. Its locator was corrected; no production assertion was relaxed.
- Preview review identified that pointer hover should not move the shown candidate after a click while Apply still references the clicked position. The clicked candidate now takes precedence until another click/cancel/commit. Insertion-preview construction also guards obsolete endpoint references during reconciliation.
- The standalone large-model probe initially used Playwright's default five-second expectation instead of the repository's 30-second expectation. A 50 MiB ASCII parse was still visibly processing when that check expired. The probe now uses the existing 30-second browser budget for import readiness, justified by the prior measured six-second envelope run; the application and CI timeouts were not changed. All four model checks subsequently passed.

Local Chrome is verified; remote Linux CI and Firefox/Safari have not been run for these commits. History and plans remain session-only. Very short segments can occupy only a few screen pixels; the inspector exposes their exact endpoints and coordinates. Overlay visibility does not prove surface conformance. No manufacturing, robot registration, collision or reachability guarantee is added. There are no domain-contract, export-schema, generated-fixture or dependency changes.

Use [the manual acceptance checklist](seam-editor-history.md#manual-acceptance-procedure) before authorizing later work. Milestone 5, automatic seam detection and robot execution have not begun.

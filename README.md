# Armatrix Weld Seam Planner

Browser-based engineering prototype. Milestone 5 adds engineering review grouping, warning navigation, focus framing, and reliable project recovery from original STL + exported weld-job JSON to the complete manual weld-planning workflow.

## Local development

Use Node.js 24 and npm. Install with `npm ci`, then run `npm run dev`.

- `npm run typecheck` — strict TypeScript checks.
- `npm test` — focused automated tests.
- `npm run build` — typecheck and production bundle.
- `npm run preview` — serve the production bundle locally.
- `npm run schema:generate` — regenerate the versioned JSON Schema and export fixtures.
- `npm run test:browser` — real Chrome/Chromium rendering, camera, picking, import lifecycle and end-to-end planning/download tests. Windows uses installed Chrome; elsewhere run `npx playwright install chromium` first.
- `npm run test:production` — build first, then verify the complete surface-authoring, parameter, sequence, review and JSON-download workflow, plus production worker/units and exclusion of development diagnostics against a temporary local preview server.

The application uses Vite, React, TypeScript, React Three Fiber, Three.js, Zustand, and Zod. Large-mesh picking uses three-mesh-bvh after measured linear-raycast latency justified it. The domain foundation remains independent of the renderer and store.

This is a weld **plan**, not an executable robot trajectory. Source units and workpiece coordinates are explicit. Robot registration, torch orientation, collision avoidance, and motion timing are outside this milestone.

## Implemented in Milestone 1

- Workpiece, frame, source units, seam/point, welding-parameter, document, and sequence contracts.
- Pure double-precision coordinate transforms, path measurements, turn angles, and nominal arc-on time.
- Structural and semantic validation with geometry-addressable findings.
- Immutable seam addition, sequencing, and direction reversal.
- Candidate contracts and explicit, validated conversion to ordinary seams. No detection algorithm.
- Deterministic v1 JSON export with freshly calculated review warnings and downstream limitations.
- Official palette tokens, Onest font with its license, and an asset provenance inventory.
- Vitest tests, independent Ajv schema checks, reproducible fixtures, and GitHub Actions checks.

## Review materials

- [Engineering review, warning navigation and project recovery](docs/engineering-review-recovery.md)
- [Milestone 5 verification and test evidence](docs/milestone-5-verification.md)
- [Precision seam editing, history rules and manual acceptance](docs/seam-editor-history.md)
- [Milestone 4 verification and measured limits](docs/milestone-4-verification.md)
- [Manual planning architecture and exact acceptance procedure](docs/seam-planning.md)
- [Milestone 3 verification and remaining limits](docs/milestone-3-verification.md)
- [Architecture and numerical policy](docs/architecture.md)
- [STL import, precision, ownership, and resource policy](docs/import-viewer.md)
- [Measured performance, unfamiliar models, acceptance evidence and limitations](docs/milestone-2-verification.md)
- [Authored analytic plate](fixtures/models/analytic-plate.stl) — 40 × 60 × 0 source units, at Z = 5, with negative X/Y coordinates.
- [Every exported field and consumer responsibilities](docs/weld-job-v1.md)
- [JSON Schema](schemas/weld-job.v1.schema.json)
- [Representative valid weld job](fixtures/weld-job.v1.json)
- [Representative planning document](fixtures/planning-document.json)
- [Intentionally invalid zero-speed job](fixtures/invalid-zero-speed.v1.json)
- [Brand values, logo variants, font choices, and licenses](docs/branding.md)

The fixture's SHA-256 and welding settings are illustrative. They do not represent an imported model or a recommended welding procedure.

## Using the workbench

Import an STL, confirm mm/cm/m/in against the dimension preview, then orbit, pan, zoom, fit (`F`) and reset (`Home`). Shortcuts apply while the viewport is focused. Replacements remain staged until confirmed. Files are processed locally in a cancellable worker; no model upload or backend is involved. Development URL `/?inspect=1` enables a surface-hit diagnostic; it is absent from production builds.

Choose **Add seam**, click at least two surface points, then **Finish seam** (Enter). Escape cancels and Backspace removes the last draft point while the viewport is focused. Select a seam to rename it, inspect ordered points and configure travel speed (mm/s), current (A) and voltage (V); **Apply parameters** commits all three. Missing targets block export. Move seams earlier/later, then **Review & Export** to download the validated plan. Unfinished drafts are excluded explicitly.

Select a point or segment in **Ordered points & geometry** to replace, insert or remove it. Surface edits show a candidate before **Apply point**; Escape cancels. Reverse direction changes traversal. Undo/Redo restore committed content under increasing revisions, retaining up to 50 states within a 16 MiB snapshot budget. Native text undo remains available inside input fields. Engineering review groups findings by workpiece and execution sequence; clicking an error or warning navigates directly to the parameter input or geometry. **Focus selection** frames selected geometry without altering sightlines.

Use **Restore Plan** in the topbar to reliably reconstruct a previous plan from its original STL and exported weld-job JSON without server dependencies. Verification checks SHA-256 fingerprint, source unit, bounds, schema, and point IDs before activation. Failed or cancelled recovery leaves the current workspace untouched.

Lines are straight chords between clicked surface points, not surface-following robot trajectories. Geometry warnings and nominal arc-on time support inspection, not process certification. Plans and history live in memory; refreshing loses the session. Successful model replacement clears history. Candidate detection, persistence and deployment remain later work. The controller-neutral JSON contract is unchanged. CI checks source, tests, build, browser acceptance and schema drift; this work does not push or deploy a branch.

## Reproduce capacity and unfamiliar-file checks

With the local dev server running, use `node scripts/fetch-test-models.ts`, `node scripts/generate-profile-models.ts`, then `node scripts/profile-viewer.ts`. Holdouts and generated large meshes stay in ignored `.local/models`; screenshots and raw timing reports go to `.local/evidence`. Downloads require internet, but the application itself does not. `node --expose-gc scripts/profile-import.ts` measures Node import allocation snapshots; `node scripts/profile-upstream.ts` reproduces the unaccelerated baseline. The fetched model URLs and hashes are recorded locally; external artwork is not redistributed.

`node --expose-gc scripts/profile-history.ts` measures history storage and pure edit/restore timings on an authored 100-seam, 10,000-point document. It prints results without generating files; these Node observations are separate from browser/GPU measurements.

# Armatrix Weld Seam Planner

Browser-based engineering prototype. Milestone 2 adds local STL import, physical-unit confirmation, and an interactive engineering viewport to the validated Milestone 1 foundation.

## Local development

Use Node.js 24 and npm. Install with `npm ci`, then run `npm run dev`.

- `npm run typecheck` — strict TypeScript checks.
- `npm test` — focused automated tests.
- `npm run build` — typecheck and production bundle.
- `npm run preview` — serve the production bundle locally.
- `npm run schema:generate` — regenerate the versioned JSON Schema and export fixtures.
- `npm run test:browser` — real Chrome/Chromium rendering, camera, picking, and import lifecycle tests. Windows uses installed Chrome; elsewhere run `npx playwright install chromium` first.
- `npm run test:production` — build first, then verify the production worker, units, rendered viewport, and exclusion of development diagnostics against a temporary local preview server.

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

## Explicit limits of this milestone

Import an STL, confirm mm/cm/m/in against the dimension preview, then orbit, pan, zoom, fit (`F`) and reset (`Home`). Shortcuts apply while the viewport is focused. Replacements remain staged until confirmed. Files are processed locally in a cancellable worker; no model upload or backend is involved. Development URL `/?inspect=1` enables a surface-hit diagnostic; it is absent from production builds.

Seam authoring, welding-parameter UI, sequencing UI, candidate detection, export download UI, persistence, and deployment remain outside this milestone. The controller-neutral JSON foundation is unchanged. CI checks source, tests, build, browser acceptance and schema drift; no branch is pushed or deployed by this work.

## Reproduce capacity and unfamiliar-file checks

With the local dev server running, use `node scripts/fetch-test-models.ts`, `node scripts/generate-profile-models.ts`, then `node scripts/profile-viewer.ts`. Holdouts and generated large meshes stay in ignored `.local/models`; screenshots and raw timing reports go to `.local/evidence`. Downloads require internet, but the application itself does not. `node --expose-gc scripts/profile-import.ts` measures Node import allocation snapshots; `node scripts/profile-upstream.ts` reproduces the unaccelerated baseline. The fetched model URLs and hashes are recorded locally; external artwork is not redistributed.

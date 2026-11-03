# Armatrix Weld Seam Planner

Browser-based engineering prototype. Milestone 1 implements the domain and numerical foundation; it does not yet implement STL import or the planning interface.

## Local development

Use Node.js 24 and npm. Install with `npm ci`, then run `npm run dev`.

- `npm run typecheck` — strict TypeScript checks.
- `npm test` — focused automated tests.
- `npm run build` — typecheck and production bundle.
- `npm run preview` — serve the production bundle locally.
- `npm run schema:generate` — regenerate the versioned JSON Schema and export fixtures.

The approved application stack is Vite, React, TypeScript, React Three Fiber, Three.js, Zustand, and Zod. Rendering and state libraries are installed for later milestones; the foundation is independent of them.

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
- [Every exported field and consumer responsibilities](docs/weld-job-v1.md)
- [JSON Schema](schemas/weld-job.v1.schema.json)
- [Representative valid weld job](fixtures/weld-job.v1.json)
- [Representative planning document](fixtures/planning-document.json)
- [Intentionally invalid zero-speed job](fixtures/invalid-zero-speed.v1.json)
- [Brand values, logo variants, font choices, and licenses](docs/branding.md)

The fixture's SHA-256 and welding settings are illustrative. They do not represent an imported model or a recommended welding procedure.

## Explicit limits of this milestone

The application entry point is a foundation status page. STL parsing, camera controls, picking, editor UI, history storage, project persistence, detection, and deployment are not implemented. The 500,000-triangle / 50 MiB import envelope is a later acceptance target, not a claim verified by these domain tests. No backend or external service is required.

Before Milestone 2, review the frame convention, fixture/schema, validation thresholds, candidate acceptance boundary, and documented palette-versus-logo differences. Run the three checks above and open `npm run dev` to verify the minimal entry point and local font. CI is configured but has not run remotely until the branch is pushed with authorization.

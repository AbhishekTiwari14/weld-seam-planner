# Guided seam discovery

Discovery suggests geometry for an engineer to inspect. It does not determine whether a joint should be welded. Load a workpiece, select **Discover Seams**, select a suggestion to inspect its cyan overlay and evidence, and accept or reject it. An accepted path becomes an ordinary editable seam; specify its welding parameters and review it before export. Manual seam creation remains available.

## Method and limits

The current contact-path detector uses the imported Float64 millimetre triangle positions. It clusters nearby vertices, groups triangles connected through clustered vertices, and examines edges with exactly two incident faces. It considers edges whose unsigned angle between face normals is at least 70 degrees and whose length is at least 15% of the workpiece bounding-box diagonal. The pure detector also accepts an explicit minimum length and a corner threshold between 45 and 89 degrees; the UI currently uses the defaults. It checks a spatial hierarchy for triangles on a distinct component that cover the complete straight edge and are approximately coplanar with one adjacent face. It does not classify isolated sharp edges as welds. Up to 64 longest candidates are returned, with a truncation notice.

The vertex and contact tolerance is `max(1e-9, min(0.01, diagonal * 1e-7))` mm. Witness faces must be within 5 degrees of the supporting face; endpoints must be within the contact tolerance of the witness plane. The triangle coverage test also allows that tolerance. Consequently, a gap within tolerance can be treated as contact; the tolerance is a numerical heuristic, not a measured gap or manufacturing acceptance criterion. Normals are compared without regard to sign, which tolerates reversed winding but does not identify concavity. Edge endpoints and triangle references are evidence, not proof of a physical joint.

Detection handles only complete straight edge-on-face contacts between components that remain distinct after vertex clustering. Triangulation can split a long junction into edges too short for the threshold; contacts sharing clustered vertices can merge components and be missed. Boundary and nonmanifold edges are skipped. Partial overlaps, penetrating bodies, curved pipe contacts, general mesh intersections, and surface-following paths are not supported. The built-in pipe sample currently yields no candidates. A candidate's straight chord is not a surface-conforming trajectory. Manually inspect unfamiliar geometry and use manual planning when needed.

Evidence includes the method/version, contact length, unsigned corner angle, tolerance, and triangle references. Triangle numbers index the imported triangle buffer after the importer has omitted degenerate triangles; they are not persistent CAD face IDs. No heuristic probability or quality score is produced. IDs use quantized endpoints relative to the workpiece bounds and tolerance. Results are repeatable for identical input geometry, ordering and settings, but IDs are not guaranteed to survive re-triangulation, vertex reordering or different models.

## Worker and review lifecycle

Analysis starts only on request and is limited to 4,000 triangles before copying geometry. The worker receives a bounded copy of the authoritative buffer, never ownership of the active mesh. Cancellation, replacement, disposal, a worker error, or the 30-second deadline terminates it; request generation and workpiece identity prevent stale responses from being installed. Results are checked against the candidate contract, identity, bounds and count limit. Models over the boundary remain available for manual planning.

Rejection changes only session review state. Acceptance validates the current workpiece and creates fresh seam and point UUIDs with unset parameters in one ordinary history transaction. Session-only candidate-to-seam associations derive accepted status from seam IDs in the current document: undoing acceptance or deleting the seam restores availability; redo restores accepted status. Editing an accepted seam preserves its association. Accepting again after undo creates a new seam and clears redo through ordinary plan history. Rediscovery retains the association during the current workpiece session. Candidate review state is cleared on workpiece replacement or reload and is not exported or restored. Existing manual seams are not automatically matched to suggestions, and after restoring a saved job rediscovery cannot identify which seams originated from earlier suggestions; inspect for duplicates before accepting.

## Measurements

On the reference Windows machine (Intel Core i3-6006U, four logical CPUs, 7.9 GiB RAM, Node 24.11.1), `node scripts/measure-discovery.ts` ran the pure detector five times per case. The synthetic grid comprises 100 separated T-joints and uses an explicit 20 mm minimum; it is not an unfamiliar industrial STL. Times exclude STL parsing, worker startup, messaging, rendering and browser scheduling. They are observations, not guarantees.

| Geometry | Triangles | Candidates | Five runs (ms) |
| --- | ---: | ---: | --- |
| T-joint | 24 | 2 | 44.9, 3.4, 10.6, 2.1, 2.5 |
| Gusset | 32 | 4 | 10.3, 2.9, 2.6, 3.4, 19.1 |
| Pipe-on-plate | 300 | 0 | 24.9, 31.4, 16.3, 18.9, 30.8 |
| T-joint grid | 2,400 | 64, truncated | 348.6, 252.2, 252.7, 225.2, 202.5 |

The script compares complete results across runs. Browser tests also exercise worker termination and preview resource cleanup; they do not establish a general memory or responsiveness guarantee.

## Verification record

On the reference machine, the following commands passed during M6B.4:

| Command | Result |
| --- | --- |
| `npm ci` | Clean install passed after stopping a Vite server that held a native dependency open. |
| `npm run typecheck` | Passed. |
| `npm test` | 208 tests passed. |
| `npm run build` | Passed; emitted `discovery.worker-BgfqFp5k.js`. Vite reported its large-chunk warning. |
| `npm run test:browser -- --reporter=line` | 38 tests passed in Chromium against Vite development server. |
| `npm run test:production` | Production smoke passed. |
| `npm run schema:generate` and `npm run samples:generate` | Passed; `git diff --exit-code -- schemas fixtures public/samples` found no drift. |
| `npm run inspect:fixture` | Production validator accepted the canonical downstream fixture. |
| `node scripts/measure-discovery.ts` | Produced the timings and deterministic comparisons above. |
| `npm run preview -- --host 127.0.0.1 --port 5173 --strictPort`, then `npx playwright test tests/browser/discovery.spec.ts -g "discovers, reviews" --reporter=line` | One test passed against the built app: T-joint discovery, selection, acceptance, parameters, review, export, reload and restoration with the original STL and exported JSON. The test also checked the discovery worker URL, undo/redo and deletion. |

These are local Windows results; remote CI and deployment were not run for this branch.

## Downstream responsibility

Export contains only accepted seams, coordinates, explicitly entered targets, sequence and review data. Suggested or rejected candidates and detector evidence are excluded. The resulting JSON is a controller-neutral weld plan, not an executable robot trajectory: registration, torch orientation, reachability, collision checks, motion timing, surface conformance and process suitability remain unassessed.

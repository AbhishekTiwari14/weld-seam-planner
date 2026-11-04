# Milestone 1 architecture

This document records the foundation decisions. For the implemented Milestone 2 import/runtime/viewport lifecycle, see [Import and viewport ownership](import-viewer.md); its runtime implementation supersedes the future-tense importer notes below without changing the domain/export contracts.

## Boundaries

- `src/domain`: Zod-backed contracts and immutable add/reorder/reverse operations. There is one sequence array, and ordered points define direction.
- `src/geometry`: pure numeric unit, coordinate, length, turn-angle, and nominal duration calculations. No React, Three.js, store, browser, or mesh-parser dependency.
- `src/validation`: shared semantic checks and derived analysis. Findings identify seams, point IDs, segment endpoint IDs, or parameter fields for future geometry-linked diagnostics. Results carry the document revision.
- `src/export`: structural JSON contract, semantic external-job validation, fresh review generation, and deterministic serialization.
- `src/candidates`: separate suggestion contract and a pure acceptance operation. No detection algorithm, adjacency construction, worker, BVH, or detection UI.
- `src/styles`: official palette tokens and the selected licensed font, with provenance in `branding.md`.

React Three Fiber, Three.js, and Zustand are installed for the approved later architecture, but no unused store or renderer wrapper is invented. Milestone 1's small React entry point explicitly reports the missing import/viewport workflow.

## Planning data and operations

The planning document contains `jobId`, a nonnegative safe-integer `revision`, and `content`. Content consists of one workpiece, one process-profile identifier, a seam map keyed by seam UUID, and the authoritative sequence array. Parameters may be null in planning state; invalid supplied numeric values are never allowed. Complete positive parameters are required for export. No machine-specific process limits or default welding settings are invented.

Operations validate input and output, return independent data, and never mutate the caller's document. Successful changes increment revision; setting an identical sequence does not. A caller later installs each result as one history transaction. History storage, point-editing interaction, and a Zustand store are intentionally later milestone work. Draft editing geometry must stay outside the committed planning document until valid.

Limits: 100 seams, 1,000 points per seam, and 10,000 points in a document. IDs are globally unique in a document; point IDs survive direction reversal. Consecutive points must be distinct within tolerance. Explicitly closed loops may repeat the initial position with a distinct final point ID. No closing segment is inferred.

## Coordinates and numerical policy

Source-to-workpiece conversion is uniform multiplication: mm = 1, cm = 10, m = 1,000, in = 25.4. It preserves source axes and origin. Exported bounds and points are already millimetres. `handedness: right` records the application's frame convention, not measured CAD provenance or robot registration.

For bounds centre `c` and diagonal `D`, view coordinates are `(p - c) / D`; the inverse is `p = view * D + c`. No camera state enters these functions. A future picking adapter must first convert a Three.js world-space hit into this defined view frame if scene transforms are present. The workpiece is not recentered in the exported job.

Coordinates and arithmetic use JavaScript double precision. The coincidence tolerance is `max(1e-6 mm, 32 * Number.EPSILON * D)`. It depends on model extent rather than distance from the origin and is a validation policy, not a precision guarantee. Length uses Euclidean segment distance with no implicit loop closure. Angles use normalized incoming/outgoing vectors and `atan2(|cross|, dot)`; straight = 0 degrees, reversal = 180 degrees. Degenerate turns are undefined.

Warnings are heuristic: segment length below 1 mm (but above coincidence tolerance), or turn above 45 degrees plus a 1e-6-degree comparison tolerance. Nominal arc-on time is total path length divided by constant travel speed. Missing speed yields unavailable time, not zero. Numeric overflow is an error. Plan-wide time is unavailable if any contributing seam's time is unavailable.

Tests include a 1e9 mm coordinate offset and demonstrate the distinction between centering before Float32 conversion and promoting already-rounded Float32 values. This does not establish a universal spatial accuracy bound. Three.js STLLoader uses Float32 positions; importer precision must be measured in Milestone 2. There is no `q > 0.01 mm` rejection policy.

## Import boundary, still unimplemented

500,000 triangles / 50 MiB is the future guaranteed acceptance-test envelope, not an export maximum. Larger-file support is best effort; resource safety limits require actual measurements. Binary metadata currently assumes canonical STL length `84 + 50 * triangleCount`. If the later importer deliberately accepts trailing bytes, this relation must be revised with a fixture and documented provenance policy.

No STL parser is implemented in this milestone. Future import must check structure proportionately, replace workpieces atomically, and discard stale asynchronous results. Buffers, parsed meshes, asset-revision tokens, and acceleration structures belong to runtime state, not planning data. No worker or BVH lifecycle is invented before measurements establish the need.

## Candidate isolation

A candidate has a stable detector-scoped ID, workpiece ID, runtime geometry revision, ordered millimetre path, method/version, evidence, and review state. Optional heuristic ranking requires a definition and is not a calibrated probability. Stable-ID generation belongs to the future detector, not this milestone.

`acceptCandidate` validates the workpiece/revision, requires suggested state, assigns fresh seam and point UUIDs, leaves parameters null, and returns both a new planning document and accepted review record. The future command handler must commit/undo these two values atomically and use its current review ledger; it must not replay an outdated suggested record. This pure helper does not implement a concurrency or history store. Accepted paths are copied, so detector changes cannot overwrite them. Rejection/recovery UI and deletion/history synchronization remain later work.

Candidate metadata is never added to `Seam` or exported JSON. A runtime analysis session may fail or disappear without changing accepted/manual seams. Engine-controlled detection is not a prerequisite for manual planning.

## Tooling and quality gates

Node.js 24 executes the small schema generator directly using native TypeScript stripping; application-source imports use explicit `.ts` extensions. This avoids a second TypeScript runner dependency. Zod is the structural source of truth; checked-in JSON Schema is generated, not maintained independently. Ajv 2020 validates fixtures independently in tests. Semantic rules remain explicit because JSON Schema alone cannot establish geometry or cross-reference correctness.

CI runs `npm ci`, typechecking, tests, production build, and an artifact-drift check on GitHub-hosted Linux. Local verification is on Windows. The workflow has read-only repository permissions and does not deploy, publish, or push.

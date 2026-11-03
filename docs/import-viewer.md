# Import and viewport ownership

Milestone 2 keeps Milestone 1's planning/export/candidate contracts unchanged. Canonical binary STL length is exactly `84 + 50 * triangleCount`; trailing data is rejected explicitly. Color extensions are rendered as neutral geometry. No topology repair, watertightness check, or welding-intent inference is performed.

## Parsing and precision

The installed Three.js STLLoader converts ASCII vertices into Float32 positions. `tests/stl-precision.test.ts` demonstrates a 0.125-unit edge collapsing at a 1e9 offset. Binary source coordinates already are Float32; the established loader is retained for binary input after structural/finite checks. A narrow ASCII facet reader captures decimal coordinates directly into Float64, requires complete standard facet blocks and solid wrappers, and rejects partial parses. It supports multiple solids, scientific notation and whitespace. It does not implement a CAD parser or mesh repair.

Only triangles with numerically zero area are omitted. Thin triangles are retained. Normals are recomputed from centered display triangles, and material/picking are double-sided to tolerate inconsistent winding. Topology quality is not inferred from successful loading.

Source-to-mm conversion preserves origin and axes. Authoritative buffers are Float64. Display vertices are `(pMm - centerMm) / diagonalMm` in Float32; mesh scene transform is identity. Camera controls never mutate those buffers. Display rounding and display-collapsed triangles are measured and reported, not used as an arbitrary 0.01 mm rejection threshold. Completely invisible geometry is rejected. Binary input precision and finite double arithmetic remain inherent limitations.

Picking chooses the nearest double-sided displayed triangle, then reintersects its authoritative vertices in centered double arithmetic. A rounded-edge hit that misses the precise triangle returns no hit. A collapsed display feature cannot be selected. This is neither mesh metrology nor a guarantee of arbitrary manufacturing precision.

## Lifecycle

One import worker owns the File, source bytes, parsed Float64 vertices, and preview until unit confirmation. Preparation returns authoritative mm positions plus separate display position/normal buffers with transfer lists; worker buffers detach, then the worker terminates. No constructed Three.js object crosses threads. Cancelling, starting another import, a processing timeout, or worker failure terminates that worker and invalidates its generation. Preview waiting has no processing timeout.

The controller publishes the new runtime asset and a validated empty planning document in one Zustand update. Existing active state stays intact through parsing, confirmation, failure, cancellation and stale completion. A confirmed replacement establishes a new workpiece identity; it does not rescale an existing plan.

The viewport owns its Three.js geometry, material and OrbitControls. Effect cleanup removes the mesh and disposes GPU resources and controls; runtime typed arrays become collectible when old asset references disappear. React StrictMode exercises setup/cleanup twice. On-demand rendering avoids idle animation loops. Development-only `?inspect=1` provides hit coordinates and a browser-test adapter; production builds expose neither.

## Capacity policy

The guaranteed test target is 500,000 input triangles and 50 MiB source bytes. Larger imports are explicitly best effort. Current resource guards are 750,000 triangles and 64 MiB, checked before large geometry allocation; a 60-second processing deadline stops stalled workers. These are implementation safety policies, not STL or export format limits. Measurements and their hardware/browser context are recorded separately before milestone completion. Browser/device memory cannot be guaranteed from file size alone; failures preserve the active plan and context loss has recovery guidance.

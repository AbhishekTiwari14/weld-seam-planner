# Milestone 2 verification

Reference measurement date: 5 November 2026 (Asia/Calcutta). These are local measurements, not portable browser-speed or metrology guarantees.

## Reference machine and method

- Windows 10, build 19045; Intel Core i3-6006U @ 2.00 GHz, 4 logical CPUs, 7.88 GiB installed RAM.
- Chrome 156.0.8078.49, headless with actual Intel HD Graphics 520 through ANGLE / D3D11, not SwiftShader. Viewport: 1280 × 720; device pixel ratio 1.
- Node 24.11.1; Three.js 0.187.0; three-mesh-bvh 0.9.18.
- `scripts/profile-viewer.ts` imports real local files through the UI and actual worker. A single browser page replaces its model 11 times. Each row samples 10 surface rays and actual mouse-driven orbit; RAF interval p95 is scheduling evidence, not a GPU timer or a sustained framerate guarantee.
- Preview/visible times include worker startup, SHA-256, processing and automated confirmation. They exclude human deliberation. Development-server timings are reported; production has a separate smoke check. `parseMs` includes fingerprinting in the worker.
- Raw reports and screenshots are generated into ignored `.local/evidence/`. Reproduce using the README commands; no downloaded external models or large generated assets are committed.

## Measured capacity cases

| Input | Bytes / triangles | Preview | Visible | Parse + hash | Prepare | BVH build | Worst of 10 picks | Orbit RAF p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authored curved shell, binary | 25,000,084 / 500,000 | 1.39 s | 2.73 s | 470 ms | 503 ms | 600 ms | 0.2 ms | 16.8 ms |
| Authored tiled surface, ASCII padded with legal whitespace | 52,428,800 / 250,000 | 5.67 s | 7.39 s | 3,851 ms | 225 ms | 265 ms | 1.5 ms | 16.8 ms |
| Authored curved shell, binary, **best effort** | 37,500,084 / 750,000 | 1.91 s | 4.27 s | 734 ms | 1,128 ms | 991 ms | 0.3 ms | 16.7 ms |

The two P0 boundary cases exercise the triangle and byte envelopes separately. They do not represent every possible topology at those sizes. The large ASCII workload includes substantial trailing whitespace; it is deliberately an allocation/scanning boundary case. Normal engineering models are separately tested below.

Before acceleration, the 500k curved model's worst sampled pick was 104.2 ms; the 50 MiB case reached 79.7 ms. This justified one additional dependency and worker-built acceleration for meshes with at least 50k displayed triangles. The main-thread long-task observer recorded maxima of 121 ms (500k activation), 207 ms (50 MiB activation), and 129 ms (750k activation). Imports do not promise zero activation stalls. No page errors occurred in the 11-model profile.

## Memory and safety policy

- Geometry count reported by the real renderer remained **one** after every successful replacement. Browser tests also repeat imports and check this invariant under React StrictMode.
- Main-renderer JS heap snapshots were approximately 20–27 MiB during the profile. This is **not** total browser memory: it excludes much of the transferred backing storage, worker allocation and GPU memory. No whole-browser peak-memory number is claimed.
- A separate Node process sampled RSS after parsing/preparing: about 299 MiB for the 50 MiB case, 257 MiB for 500k, and 389 MiB at the 750k case in a repeated-import run. These are observed process snapshots before adding BVH, not isolated browser peaks; garbage collection timing and earlier buffers affect them.
- Retained CPU positions/normals cost 144 bytes per usable triangle: 72 Float64 coordinate bytes + 36 Float32 display-position bytes + 36 Float32 normal bytes. That is 68.7 MiB at 500k and 103.0 MiB at 750k, before BVH, source storage, temporary parser allocations, and GPU copies. Old and pending workpieces coexist until confirmation. Serialized BVH buffers are transferred, not duplicated by structured cloning.
- The tested 750k case and allocation growth justify conservative current guards of **750,000 triangles / 64 MiB**, rather than extrapolating to millions of triangles on an 8 GiB machine. The larger-file interval beyond 500k / 50 MiB is best effort. Above the guards, reject before geometry allocation. A processing phase taking over 60 seconds terminates its worker.
- These guards reduce risk, but do not guarantee every device's memory or graphics-driver behavior. Graphics context loss produces recovery guidance. The application cannot repair a driver or recover an unsaved session after reload.

## Unfamiliar models

All eight imported, rendered and were camera/picking tested successfully. Units were explicitly selected as mm for these tests; that does not certify the models' original intended physical units. The supplied files were not modified.

| Holdout | Encoding | Input triangles | Purpose | SHA-256 |
| --- | --- | --- | --- | --- |
| slotted_disk.stl | ASCII | 288 | Curved mechanical disk, scientific notation | `5c0d95ca55352ccf5cca12197a5f9fa17eb2e905d1bb3a45c8ba51c9a22699a4` |
| pr2_head_pan.stl | Binary | 1,000 | Robotics mechanical part | `c4ebcc17156642a8e4df8564a09f730b54db236e783320d71af3e51de17e8315` |
| pr2_head_tilt.stl | Binary | 1,052 | Different extent/orientation | `4c98307430589fbb86f0310b25b1896bbb0ac4c4f5b97d9dc4f03d3250003533` |
| colored.stl | Binary | 2,156 | Color extension accepted as neutral geometry | `0012b62d4bb485f902a972192eef29d6ce4b97a9deb2de67a02d30a5b738f461` |
| counter.unitsmm.STL | Binary | 83,750 | Larger unfamiliar mechanical part | `770c966cd97988375f8429fe9dea5c0aef7bc0ffaa3db0cf3a0ea4749ab90774` |
| torus.STL | Binary | 8,700 | Curvature and interior visibility | `91441a7f60479bda93c59dd88134da3b4f33d1df71729fe71e1b2ae989974da3` |
| busted.STL | Binary | 3,878 | Imperfect test geometry | `ec9d11fd0db249f1e40b737d07227cfc2f06bbd033e3dcc9e785b5ec25b8d024` |
| multibody.stl | ASCII | 32 | Disconnected solids | `d53e9c74e66080959e76297b864d68756a7e881e87ccbaf30cbe96a280a81d0d` |

Sources: [Three.js r187 STL examples](https://github.com/mrdoob/three.js/tree/r187/examples/models/stl) and [Trimesh pinned model inventory](https://github.com/mikedh/trimesh/tree/6c158cce226500fc64b12acd265af0cf01d1c212/models). `scripts/fetch-test-models.ts` pins these revisions and records exact raw URLs and hashes. External meshes are downloaded only into ignored local test storage, not redistributed.

## Correctness gates

Final local results: `npm ci` succeeded with zero reported vulnerabilities; typecheck passed; **105 tests across 9 Vitest files passed**; production build passed; **5 Playwright acceptance tests passed** (54 seconds on the final run); production smoke passed; regenerating schemas/JSON fixtures produced no drift. No checks remain failing. The build emits an expected large-chunk warning for the lazy Three.js viewport (approximately 991 kB minified / 264 kB gzip); it is loaded only when a model is activated. R3F's use of deprecated Three.Clock emits a development warning; it did not produce a runtime failure.

- Unit tests: canonical ASCII/binary, `solid` binary headers, incomplete/malformed/nonfinite input, zero-area omission, thin triangles, open/non-manifold/disconnected surfaces, normalization, bounds and coordinate round trips, rotated and offset models, stale/cancelled/failed imports, timeouts, sequencing/export foundation regressions, real Three.js occlusion and winding, gesture filtering, and transferable BVH face identity.
- Browser acceptance: actual mesh drawing and camera gestures; immutable workpiece frame; SHA-256; source cm conversion; replacement failure and cancellation; repeated GPU cleanup; large-offset picking; competing real workers; unavailable-WebGL recovery. Unavailability alone is simulated; ordinary rendering and picking use real WebGL and Three.js.
- Production smoke: real built worker, inches-to-mm dimensions, canvas, camera control, no page errors, and no development inspection API even with `?inspect=1`.
- CI performs clean install, typecheck, tests, build, Chromium browser checks, production smoke and schema/fixture drift checks. No remote CI execution, deployment or push is claimed.

## Known boundaries and manual review

Binary trailing bytes and binary-length/count disagreement are intentionally rejected; Milestone 1 provenance stays canonical. ASCII requires standard complete facet/solid blocks; no generalized repair is attempted. Colors, CAD assemblies, STL units and welding intent are not inferred. Source ASCII doubles are preserved where JavaScript arithmetic permits; binary source precision cannot be recovered. Display-collapsed features may be unpickable; measured display rounding is not a manufacturing-accuracy claim. Browser verification currently covers Chrome/Chromium, not Firefox/Safari or low-memory mobile devices.

Before approving Milestone 3: import the authored plate in mm and inches; check dimensions and source Z; orbit/pan/zoom and use Fit/Reset; try an unfamiliar part; cancel and fail a replacement; inspect provenance/warnings; use development `?inspect=1` to check hits on front/back surfaces; inspect the production page at 1280 × 720. No seam editing, welding-parameter UI, sequencing UI, candidate analysis, JSON download or robot registration is implemented.

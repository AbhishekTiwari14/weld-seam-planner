# Milestone 6A Verification & Release Readiness

Independent review on 10 November 2026 on branch `feat/release-demo`, preserving the existing M6A implementation and uncommitted corrections. Reference machine: Windows x64, Intel Core i3-6006U @ 2.00 GHz, 7.88 GiB RAM, Node 24.11.1, Chrome 156.0.8078.49. No merge, rebase, deployment or M6B work is included.

---

## 1. Automated Quality Gates Summary

| Command | Status | Result / Details |
| :--- | :--- | :--- |
| `npm.cmd ci` | **Passed** | Exact lockfile install; existing R3F patch applied. No dependency upgrades. This is not a security audit. |
| `npm.cmd run typecheck` | **Passed** | Strict TypeScript compilation (`tsc --noEmit`) with zero errors under `exactOptionalPropertyTypes: true`. |
| `npm.cmd test` | **Passed** | **193 passed, 0 failed** across 17 files: 176 pre-M6A tests + 9 sample tests + 8 consumer tests. |
| `npm.cmd run build` | **Passed** | Vite production bundle created cleanly in `dist/`; Web Worker and static assets bundled without external runtime dependencies. |
| `npm.cmd run test:browser` | **Passed** | **29 passed, 0 failed** in 7.2 minutes across 5 suites, including the 20 pre-M6A browser tests. |
| `npm.cmd run test:production` | **Passed** | Built production preview: sample loading, surface authoring, editing, history, parameters, sequence, review, exact download and restore, diagnostic exclusion. |
| `npm.cmd run schema:generate` | **Passed** | Zero schema drift against `schemas/weld-job.v1.schema.json` and `fixtures/weld-job.v1.json`. |
| `git diff --exit-code -- schemas fixtures` | **Passed** | Schema and fixture definitions remain byte-identical. |
| `npm.cmd run inspect:fixture` | **Passed** | Standalone downstream consumer script validates and prints fixture plan cleanly under Node 24 using the production validation engine. |
| `npm.cmd run samples:generate` + sample diff | **Passed** | All three generated binary files are byte-identical to checked-in samples. |

---

## 2. New Coverage & Deliverables

### A. Programmatic 3D Sample Assemblies (`scripts/generate-samples.ts` & `public/samples/`)
Three locally hosted, deterministic, self-authored binary STL models generated from first principles without external CAD dependencies:
1. **T-joint assembly** (`t-joint.stl`):
   - Dimensions: $120.0 \times 150.0 \times 80.0\text{ mm}$ (bounds: $X \in [-60, 60]$, $Y \in [-75, 75]$, $Z \in [0, 80]$).
   - Geometry: Base plate ($120 \times 150 \times 10\text{ mm}$, $Z \in [0, 10]$) and vertical web plate ($10 \times 130 \times 70\text{ mm}$, $Z \in [10, 80]$, $X \in [-5, 5]$, $Y \in [-65, 65]$).
   - File Size: 1,284 bytes (24 triangles: 12 base + 12 web).
   - Topology: Assembly of two individually closed solid rectangular prisms touching at the $Z=10$ coplanar contact interface.
2. **Gusset bracket assembly** (`gusset-bracket.stl`):
   - Dimensions: $100.0 \times 120.0 \times 120.0\text{ mm}$ (bounds: $X \in [-50, 50]$, $Y \in [-15, 105]$, $Z \in [0, 120]$).
   - Geometry: Vertical backplate ($100 \times 15 \times 120\text{ mm}$, $Y \in [-15, 0]$), horizontal base flange ($100 \times 105 \times 15\text{ mm}$, $Y \in [0, 105]$), and triangular stiffener gusset ($10\text{ mm}$ thick with $90\text{ mm}$ legs: $Y \in [0, 90]$ at $Z=15$, and $Z \in [15, 105]$ at $Y=0$).
   - File Size: 1,684 bytes (32 triangles: 12 backplate + 12 base flange + 8 gusset rib).
   - Topology: Multi-component assembly of three closed solid volumes touching along planar contact faces ($Y=0$ and $Z=15$).
3. **Pipe-on-plate assembly** (`pipe-on-plate.stl`):
   - Dimensions: $150.0 \times 150.0 \times 90.0\text{ mm}$ (bounds: $X \in [-75, 75]$, $Y \in [-75, 75]$, $Z \in [0, 90]$).
   - Geometry: Square base plate ($150 \times 150 \times 15\text{ mm}$, $Z \in [0, 15]$) with hollow cylindrical pipe ($\text{OD}=70\text{ mm}$, $\text{ID}=50\text{ mm}$, wall thickness $10\text{ mm}$, height $75\text{ mm}$ [$Z \in [15, 90]$], 36 radial segments).
   - File Size: 15,084 bytes (300 triangles: 12 plate + 288 pipe segments).
   - Topology: Assembly of solid plate prism and hollow annular pipe cylinder touching at $Z=15$.

*Topology Note*: Each model is programmatically constructed from individually closed faceted solids (boxes, prisms, cylindrical shells) that touch along planar contact faces. They represent realistic multi-body engineering assemblies rather than single-boundary boolean manifolds and are not claimed to be certified watertight solids.

### B. Sample Manifest & UI Integration (`src/samples/` & `src/ui/`)
- **Manifest (`src/samples/manifest.ts`)**: Defines stable model identifiers (`t-joint`, `gusset-bracket`, `pipe-on-plate`), display titles, physical bounding boxes, dimensions, feature descriptions, and a typed helper `fetchSampleFile(sample, signal?)` supporting cancellation via `AbortSignal`.
- **Custom Vector Graphics (`src/ui/SampleIcons.tsx`)**: Illustrative sample diagrams using the existing official Dark Forest, Light Sand and Bright Discovery tokens. Undefined `dark-forest-s*`/`dark-forest-base` references were corrected to the established `dark-forest-t*`/`dark-forest` tokens; no new brand values or logo modifications.
- **Interactive 5-Step Workflow Stepper (`src/ui/WorkflowStepper.tsx`)**:
  - Clear visual indicator: `1. Import` $\rightarrow$ `2. Define Seams` $\rightarrow$ `3. Configure` $\rightarrow$ `4. Sequence` $\rightarrow$ `5. Review & Export`.
  - State-driven reactivity tracking model presence, seam counts, unparameterized seams, active drafting, and review dialog status.
  - Step statuses: `is-completed`, `is-active`, `is-ready`, and `is-upcoming`.
  - Review navigation respects pending parameter/point edits at both the button and workspace boundary. Finishing an edit does not replay a blocked review request. Readiness means ready for review, not certified robot execution.
- **First-Use Empty Workspace (`src/ui/Workbench.tsx`)**:
  - Clean split card layout: **Option A (Upload Workpiece STL)** and **Option B (Try a 3D Sample Model)** with instant 1-click loading.
  - Header "Try Sample" action button available at any time to open `SampleDialog`.
- **Race Condition & Fetch Cancellation (`src/ui/Workbench.tsx`)**:
  - Generation ticket counter (`sampleTicketRef`) and `AbortController` (`sampleAbortRef`) guarantee that older pending sample fetches cannot overtake newer sample selections, file imports, drag-and-drops, or plan restorations.
  - User cancellation or dialog dismiss immediately aborts pending network fetches and leaves the active workspace untouched.
  - Sample downloads show status and Cancel import. Every sample entry point cancels earlier worker work before opening the chooser; choosing a sample also cancels it before starting the fetch. The existing controller remains the only activation/history boundary.
- **Contextual Seam Authoring Guidance (`src/ui/SeamPanel.tsx`)**:
  - 3-step empty state instructions when no seams exist: *1. Click "Add seam"*, *2. Click surface points on workpiece*, *3. Press Enter to finish*.
  - Warning tip banner when selected seam lacks travel speed, current, or voltage parameters.

### C. Downstream Consumer Inspector (`examples/inspect-weld-job.ts`)
- Repository-based Node.js consumer example importing the production validator. The CLI works when invoked by absolute path from another working directory, and rejects invalid files with a nonzero exit. Printed point coordinates are explicitly rounded for display; returned values are unchanged.
- Evaluates:
  - Strict schema version compliance (`1.0.0`).
  - Production `validateWeldJob()` validation checking Zod schema and domain semantic rules.
  - Workpiece provenance (filename, byte size, SHA-256 fingerprint, source unit, triangle count).
  - Explicit documentation that the recorded SHA-256 digest captures source provenance, but verifying an external STL requires independently computing its hash.
  - Normalized coordinate bounds and reference frame.
  - Seam execution sequence traversal, resolving point lists in workpiece millimeters.
  - Total planned path length and nominal arc-on duration calculations.
  - Heuristic review warnings and explicit unassessed downstream robotic criteria.

### D. Production Deployment Configuration (`vercel.json`)
- Configured for client-side Single Page Application (SPA) deployment on Vercel:
  - Framework: `vite`
  - Build command: `npm run build`
  - Output directory: `dist`
  - Clean URLs: `true`
  - Rewrites: `/* -> /` with clean URLs; `.html` destinations conflict with this setting per [Vercel's Vite documentation](https://vercel.com/docs/frameworks/frontend/vite). Actual hosted routing remains unverified until deployment is authorized.

---

## 3. Automated Test Evidence

### Unit Tests (`npm test`)

193 tests passed in 17 files. The consumer tests reject malformed JSON, missing/duplicate sequence entries, invalid process values and forged warnings, and exercise CLI invocation from a different working directory. Sample tests compare each checked-in STL byte-for-byte with its generator and compare production-parser bounds/counts with the manifest.

The prior test that simulated a ticket counter without importing application logic was replaced by these sample-integrity checks and real browser cancellation tests. No production validation or existing M1–M5 regression assertions were relaxed.

### Browser End-to-End Tests (`npm run test:browser`)

| Suite | Tests | Focus |
| --- | ---: | --- |
| `editor.spec.ts` | 7 | Existing precision/history regressions plus workflow review guards during uncommitted edits |
| `planning.spec.ts` | 4 | Manual end-to-end planning and validated export |
| `recovery.spec.ts` | 4 | Atomic recovery, review navigation, identity and resource invariants |
| `samples.spec.ts` | 8 | Three samples, export/restore, layout, and actual pending-fetch cancellation by Cancel, local file, Restore Plan and newer sample |
| `viewer.spec.ts` | 6 | Actual rendering, unit/precision checks, camera gestures, replacement and large imports |

Cancellation tests hold an actual HTTP request at a Playwright route barrier, supersede it through user actions and wait for its cancellation. They use no delay-based ordering, injected planning state or arbitrary retries.

### Production Smoke Test (`npm run test:production`)
- Tests executed against production bundle running on a local Vite preview server:
  1. Successful load of built-in sample STL via worker without dev-only helpers.
  2. Authoring 2 surface seams on an analytic plate in inches.
  3. Reverse direction, point editing, and undo/redo operations.
  4. Parameter configuration (speed, current, voltage) and sequence re-ordering.
  5. Heuristic review execution and navigation.
  6. Deterministic JSON download.
  7. Full plan restoration from STL + downloaded JSON, validating SHA-256, source units, and seam geometry.
  8. Exclusion of dev diagnostics (`window.__weldDebug` is undefined).

---

## 4. Responsive Viewport Verification

The layout browser test checks no document-level horizontal overflow, non-overlapping workpiece/canvas/seam panels, and a usable canvas height at 1280 × 720 and 1440 × 900. Screenshots are saved in the ignored Playwright output directory. Scrollable inspector/dialog content is intentional; these checks do not claim every control is simultaneously visible.

The welcome and workbench screenshots were also visually inspected at these sizes. At 1280 × 720 the welcome sample area scrolls to reveal the full card actions; this is not a claim of a scroll-free layout.

4K, high-DPI, Firefox, Safari and mobile operation have not been independently verified. No new universal frame-rate or memory guarantee is claimed. Existing large-model, repeated replacement, history and recovery coverage remains in the full suite.

Known non-blocking tooling warnings: Vite reports the lazy viewport chunk at about 1,018 kB minified (272 kB gzip); unit tests report a Three.js CommonJS deprecation from the test dependency path. No dependency upgrade or chunk-warning suppression was introduced.

Remote checks are linked from [PR #6](https://github.com/AbhishekTiwari14/weld-seam-planner/pull/6). The pre-correction head `0eac4ba` had a successful [Engineering checks run](https://github.com/AbhishekTiwari14/weld-seam-planner/actions/runs/42322694534); that result is not evidence for these local corrections. The PR's final head checks must pass independently after pushing.

---

## 5. Scope & Boundary Adherence

In accordance with Milestone 6A specifications:
- **No Automatic Seam Detection**: Path authoring remains intentional, manual, and engineer-driven.
- **No Robot Kinematics / Reachability Claims**: Export explicitly documents unassessed downstream criteria.
- **No Backend / Database / IndexedDB**: Application remains a pure client-side SPA with verified file-based cryptographic recovery.
- **No Controller-Specific Export**: Retains universal, versioned `weld-job.v1.json` format.
- **No Unapproved Deployment**: Code is prepared and tested for Vercel deployment; no deployment command was run. Hosted acceptance remains a separate authorized step.

# Armatrix Weld Seam Planner

A high-integrity, browser-based 3D weld seam planning application engineered for robotic welding with snake-like robotic arms.

The system allows welding engineers and robotic technicians to import arbitrary 3D STL workpieces, author and edit precision weld seams directly on part surfaces, configure process parameters, sequence weld paths, perform engineering review checks, export a deterministic JSON weld job, and recover plans offline from the original STL and exported plan.

---

## Live Demo & Deployment

> **Deployment Status**: Client-side Single Page Application (SPA), awaiting release review. No backend or database; application dependencies are bundled locally.
>
> **Live Demo URL**: *Pending production release approval (see [Vercel Deployment Guide](#vercel-deployment-guide) below)*.

---

## Key Differentiators & Engineering Principles

1. **Weld Plan vs. Robot Program**:
   This application authors an authoritative **Weld Plan** in workpiece coordinate space ($\text{mm}$). It intentionally does **not** generate executable robot trajectories or claim unverified reachability for snake-like arms. Upfront separation of concerns guarantees that downstream robot controllers receive clean, unpolluted geometric and process data without undocumented kinematic approximations.
2. **Double-Precision Coordinate Architecture**:
   Authoritative source positions and planning measurements use JavaScript double precision. Display positions and normals use Float32 buffers. Rendering transforms (centering, scaling) are separate from workpiece coordinates; binary STL precision remains limited by its source Float32 values.
3. **Worker-Driven BVH Surface Picking**:
   Binary/ASCII STL parsing, bounds analysis, and SHA-256 fingerprinting execute in a cancellable Web Worker. Meshes with at least 50,000 displayed triangles use a serialized BVH (`three-mesh-bvh`) for picking. Responsiveness depends on hardware and mesh structure; see the measured [import performance evidence](docs/milestone-2-verification.md).
4. **Verified Cryptographic Project Recovery**:
   Projects can be restored without cloud storage or user accounts. Re-uploading the original STL alongside an exported `weld-job.v1.json` verifies SHA-256 digests, units, bounding boxes, schema integrity, and point identities before restoring the session.
5. **Deterministic Canonical Serialization**:
   The same committed plan produces identical JSON bytes via fixed key ordering and ID-sorted seam definitions. Coordinates are serialized without additional rounding; independently created plans have different UUIDs.

---

## Quick Start

### Prerequisites
- Node.js 24 (`>=24 <25`)
- npm

### Installation & Local Run
```bash
# Clone the repository
git clone https://github.com/AbhishekTiwari14/weld-seam-planner.git
cd weld-seam-planner

# Install exact dependencies
npm ci

# Start the Vite development server
npm run dev
```
Open `http://localhost:5173` in Chrome or Chromium. Automated acceptance coverage uses real Chromium-family browsers; Firefox and Safari have not been verified.

### Downstream Consumer Inspection
Verify how an external robotic controller or process pipeline reads and validates the exported plan using the production validation engine:
```bash
# Inspect the checked-in canonical fixture
npm run inspect:fixture

# Or inspect any exported weld-job file
node examples/inspect-weld-job.ts path/to/your.weld-job.v1.json
```

---

## 5-Step End-to-End Workflow

The application guides the engineer through five structured, reactive stages:

```
[1. Import] ──► [2. Define Seams] ──► [3. Configure] ──► [4. Sequence] ──► [5. Review & Export]
```

### 1. Import Workpiece
- **Upload STL**: Drag and drop or browse for standard binary or ASCII STL. The tested acceptance envelope is 500,000 triangles / 50 MiB. Larger files are best effort, subject to hard safety limits of 750,000 triangles / 64 MiB and the existing import deadline.
- **Or Try a Sample**: Choose one of three built-in engineering assemblies:
  - **T-Joint Assembly** ($120 \times 150 \times 80\text{ mm}$, 24 triangles): Horizontal base plate ($120 \times 150 \times 10\text{ mm}$) and vertical web plate ($10 \times 130 \times 70\text{ mm}$, $Z \in [10, 80]$). Provides two $130\text{ mm}$ longitudinal contact junctions for review.
  - **Gusset Bracket Assembly** ($100 \times 120 \times 120\text{ mm}$, 32 triangles): Vertical backplate ($100 \times 15 \times 120\text{ mm}$), base flange ($100 \times 105 \times 15\text{ mm}$), and triangular stiffener gusset ($10\text{ mm}$ thick with $90\text{ mm}$ legs along $Y$ and $Z$).
  - **Pipe-on-Plate Assembly** ($150 \times 150 \times 90\text{ mm}$, 300 triangles): Square base plate ($150 \times 150 \times 15\text{ mm}$) with hollow cylindrical pipe ($\text{OD} = 70\text{ mm}$, $\text{ID} = 50\text{ mm}$, wall thickness $10\text{ mm}$, height $75\text{ mm}$, 36 radial segments) for circumferential path planning.
  - *Topology note*: Sample models are programmatically generated multi-body contact assemblies with touching coplanar faces at component interfaces; they are structured engineering parts, not certified single-boundary watertight manifolds.
- **Unit Confirmation**: Inspect source units (`mm`, `cm`, `m`, `in`) against physical dimensions. The geometry is automatically normalized to millimetres.

### 2. Define Seams
- **Optional assistance**: Click **Discover Seams**, inspect a highlighted candidate and its evidence, then accept or reject it. Suggestions are unverified geometric contact paths, not confirmed welds. The current straight edge-on-face detector supports at most 4,000 triangles and does not detect curved pipe junctions; manual planning remains available. See [guided seam discovery](docs/guided-seam-discovery.md) for tolerances and limits.
- Click **Add seam**.
- Click two or more surface points on the 3D model. Raycasting snaps directly to triangular mesh faces.
- Press **Enter** or click **Finish seam** to commit the seam.
- **Precision Point Editing**: Select any point or segment in the side panel to replace, insert, or delete points. Reverse direction flips the path traversal.
- **Full History**: Bounded 50-step Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) with a 16 MiB memory budget.

### 3. Configure Parameters
- Select any seam to inspect its ordered points and set welding targets:
  - **Travel Speed** ($v$ in $\text{mm/s}$, $> 0$)
  - **Current Target** ($I$ in $\text{A}$, $> 0$)
  - **Voltage Target** ($U$ in $\text{V}$, $> 0$)
- Click **Apply parameters** to validate and commit process values.

### 4. Sequence Execution
- Reorder seams using the **Move Up** / **Move Down** controls in the execution sequence panel.
- Sequence dictates the exact traversal order passed downstream to the robot planner.

### 5. Review & Export
- **Engineering Review**: Automated heuristics check for:
  - `SHORT_SEGMENT`: Segments $< 1\text{ mm}$ flagged for inspection.
  - `TURN_ANGLE_HIGH`: Direction changes $> 45^\circ$ flagged for inspection.
  - `DEGENERATE_TRIANGLES_OMITTED`: Source STL mesh defect tracking.
- **Interactive Navigation**: Click a geometry warning to select and highlight its point or segment. Use **Focus selection** to frame it. Parameter findings focus the relevant input.
- **Export**: Generates and downloads the schema-compliant `weld-job.v1.json`.
- **Restore Plan**: Re-load the original STL and JSON to reconstruct the entire plan state offline.

---

## 2–3-Minute Demonstration Walk-Through

Follow this script to reproduce the core workflow in under 3 minutes:

1. **Launch & Sample Selection (0:00–0:30)**:
   - Open the application. On the clean welcome screen, click **Load sample** on the **T-Joint Fillet Assembly** card.
   - Confirm unit `mm` in the import dialog and click **Confirm & open model**.
   - Inspect the worker import, SHA-256 provenance, and 3D viewport rendering.
   - Use viewport controls: Orbit (Left-drag), Pan (Right-drag), Zoom (Wheel), Frame (`F`), Reset (`Home`).
2. **Authoring Seams (0:30–1:15)**:
   - Click **Add seam**.
   - Click along the longitudinal fillet junction between the vertical web and horizontal base: point 1 at $X=5, Y=-50, Z=10$, point 2 at $X=5, Y=50, Z=10$.
   - Press **Enter** to finish the seam. These are illustrative target locations: manual clicks are approximate, with no numeric point entry or edge snapping. Inspect the actual coordinates and measured length rather than expecting exactly 100 mm.
   - Click **Add seam** again and author a second seam along the opposite fillet ($X=-5, Z=10$).
3. **Process Configuration & Sequencing (1:15–1:50)**:
   - Select Seam 1. Notice the parameter guidance banner. The following numbers are demonstration inputs only, not a welding procedure or recommended settings.
   - Enter Travel Speed: `8` mm/s, Current: `140` A, Voltage: `23` V. Click **Apply parameters**.
   - Select Seam 2. Enter Speed: `10` mm/s, Current: `160` A, Voltage: `24` V. Click **Apply parameters**.
   - In the Execution Sequence panel, click **Move Up** on Seam 2 to prioritize it first.
4. **Engineering Review & Warning Navigation (1:50–2:20)**:
   - Click **Review & Export** in the seam-panel footer (or step 5 in the workflow bar).
   - In the review dialog, examine the warnings and unassessed downstream criteria.
   - If a short segment or sharp turn is present, click the warning to highlight the affected geometry, then use **Focus selection** if needed.
5. **JSON Export & Recovery Verification (2:20–3:00)**:
   - Click **Download weld job**. The browser downloads the validated `.weld-job.v1.json` plan. Keep `public/samples/t-joint.stl` alongside it; the JSON does not contain the STL.
   - Run the downstream inspector in your terminal: `node examples/inspect-weld-job.ts path/to/downloaded.json`.
   - In the application, click **Restore Plan** in the topbar, provide `t-joint.stl` and the downloaded JSON, and confirm restoration. The entire project state is recovered.

---

## Exported JSON Structure (`weld-job.v1.json`)

The export format is strictly governed by JSON Schema 2020-12 at [`schemas/weld-job.v1.schema.json`](schemas/weld-job.v1.schema.json). Every field is explicit, unambiguous, and typed.

### Root Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `schemaVersion` | `string` | Exact contract version (`"1.0.0"`). Unsupported versions are rejected. |
| `kind` | `string` | `"weld-plan"`. Identifies the document as an engineering plan, not executable machine code. |
| `jobId` | `string` (UUID) | Unique identifier for this planning session (RFC 4122 / RFC 9562 versions 1–8, nil, or max UUID). |
| `revision` | `integer` | Monotonically increasing revision counter of committed document changes ($\ge 0$). |
| `workpiece` | `object` | Source provenance, coordinate frame definition, and bounding box. |
| `processProfile` | `string` | Process profile identifier (`"generic-arc-targets-v1"`). Targets only; not certified procedure. |
| `seams` | `array` | List of defined weld seams, lexicographically sorted by `id` ($1..100$ items). |
| `sequence` | `array<string>` | Ordered array of seam UUIDs defining the planned robotic execution order. Exact permutation of seam IDs. |
| `review` | `object` | Recomputed heuristic review warnings and explicitly unassessed robotic criteria. |

### Workpiece Object (`workpiece`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `workpiece.id` | `string` (UUID) | Unique identifier for the workpiece instance (RFC 4122 / RFC 9562 versions 1–8, nil, or max UUID). |
| `workpiece.source.filename` | `string` | Original validated base filename (1–255 characters, no path separators or control characters). Invalid source names are rejected. |
| `workpiece.source.byteLength` | `integer` | Exact file size in bytes of the original STL file ($\ge 1$). |
| `workpiece.source.sha256` | `string` | 64-character lowercase hexadecimal SHA-256 digest of original STL bytes. Captures source provenance; verifying an external STL requires independently computing its SHA-256 digest. |
| `workpiece.source.encoding` | `string` | Format encoding: `"binary"` or `"ascii"`. |
| `workpiece.source.unit` | `string` | User-confirmed original source unit: `"mm"`, `"cm"`, `"m"`, or `"in"`. |
| `workpiece.source.inputTriangles` | `integer` | Count of triangles parsed from the source STL ($\ge 1$). |
| `workpiece.source.omittedDegenerateTriangles` | `integer` | Count of collapsed/zero-area triangles filtered during import ($\ge 0$). |
| `workpiece.frame.id` | `string` | Coordinate frame reference: `"workpiece"`. |
| `workpiece.frame.lengthUnit` | `string` | Normalized unit for all downstream coordinates: `"mm"`. |
| `workpiece.frame.axes` | `string` | Axis convention: `"source_xyz"`. Matches source STL orientation. |
| `workpiece.frame.origin` | `string` | `"source_origin"`. Origin is fixed to source coordinates, not viewport center. |
| `workpiece.frame.handedness` | `string` | Geometric handedness: `"right"`. |
| `workpiece.boundsMm.min` | `[number, number, number]` | Minimum bounding box coordinates $[X_{\min}, Y_{\min}, Z_{\min}]$ in millimetres. |
| `workpiece.boundsMm.max` | `[number, number, number]` | Maximum bounding box coordinates $[X_{\max}, Y_{\max}, Z_{\max}]$ in millimetres. |

### Seam Object (`seams[]`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` (UUID) | Unique identifier for the seam (RFC 4122 / RFC 9562 versions 1–8, nil, or max UUID). |
| `name` | `string` | Non-empty display label (1–80 characters). |
| `geometry.type` | `string` | `"polyline"`. Straight chords between ordered points; surface conformance is not established. |
| `geometry.points` | `array` | Ordered list of 2 to 1,000 vertices defining the weld path. Array order is weld direction. |
| `geometry.points[].id` | `string` (UUID) | Stable point identifier. Preserved across reversals and replacements. |
| `geometry.points[].positionMm` | `[number, number, number]` | Finite $[X, Y, Z]$ coordinates in the workpiece frame ($\text{mm}$). |
| `parameters.travelSpeedMmPerS` | `number` | Requested torch travel speed in $\text{mm/s}$ ($> 0$). |
| `parameters.currentTargetA` | `number` | Requested arc current target in amperes ($> 0$). |
| `parameters.voltageTargetV` | `number` | Requested arc voltage target in volts ($> 0$). |

### Engineering Review (`review`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `review.rulesetVersion` | `string` | Ruleset version (`"1.0.0"`). Decoupled from structural schema version. |
| `review.warnings` | `array` | Recomputed heuristic findings (max 20,000 items). Discriminated by `code`. |
| `review.warnings[].code` | `string` | Finding code: `"TURN_ANGLE_HIGH"`, `"SHORT_SEGMENT"`, or `"DEGENERATE_TRIANGLES_OMITTED"`. |
| `review.warnings[].seamId` | `string` (UUID) | Seam UUID where the warning occurs (required for `TURN_ANGLE_HIGH` and `SHORT_SEGMENT`). |
| `review.warnings[].pointId` | `string` (UUID) | Vertex UUID at which direction turn angle exceeds threshold (required for `TURN_ANGLE_HIGH`). |
| `review.warnings[].startPointId` | `string` (UUID) | Starting vertex UUID of the short segment (required for `SHORT_SEGMENT`). |
| `review.warnings[].endPointId` | `string` (UUID) | Ending vertex UUID of the short segment (required for `SHORT_SEGMENT`). |
| `review.warnings[].valueMm` | `number` | Measured segment chord length in millimetres (required for `SHORT_SEGMENT`, $> 0$). |
| `review.warnings[].valueDeg` | `number` | Measured direction change angle in degrees (required for `TURN_ANGLE_HIGH`, $0 \le \theta \le 180$). |
| `review.warnings[].count` | `integer` | Count of omitted degenerate triangles (required for `DEGENERATE_TRIANGLES_OMITTED`, $\ge 1$). |
| `review.notAssessed` | `array<string>` | Fixed 8-element list of explicit robot execution responsibilities not certified by this plan. |

#### Explicit Downstream Exclusions (`review.notAssessed`)
The export explicitly documents that downstream robot control software must provide:
1. `surface_conformance`: Verifying polyline chords follow complex curved surfaces.
2. `process_suitability`: Metallurgical verification of current/voltage/speed for specific materials.
3. `torch_orientation`: Calculating torch push/drag angles, work angles, and tool center points (TCP).
4. `workpiece_to_robot_registration`: Physical fixture calibration and coordinate frame alignment.
5. `robot_kinematics`: Inverse kinematics, arm reachability, joint torque limits, and singularities.
6. `collision_avoidance`: Obstacle and self-collision avoidance for the snake robot body.
7. `motion_timing`: Dynamic trajectory generation, axis acceleration limits, and speed blending.
8. `inter_seam_transfers`: Safe air-cut transfer moves between consecutive weld seams.

---

## Downstream Consumer Example

A Node.js consumer example is included in [`examples/inspect-weld-job.ts`](examples/inspect-weld-job.ts). Run it from this installed repository: it imports the production `validateWeldJob()` validator for structural and semantic checks, including warning derivations. It does not independently hash an STL or establish robot feasibility. Printed coordinates are rounded for readability; the returned job retains exact saved values.

```bash
# Run inspector against fixture
npm run inspect:fixture

# Or inspect any exported weld-job JSON
node examples/inspect-weld-job.ts path/to/your.weld-job.v1.json
```

**Output snippet:**
```text
===============================================================
ARMATRIX WELD JOB INSPECTOR — DOWNSTREAM CONSUMER VERIFICATION
===============================================================
File: .../fixtures/weld-job.v1.json

[1] JOB IDENTIFICATION
    Job ID:       00000000-0000-4000-8000-000000000001
    Revision:     0
    Schema:       v1.0.0
    Kind:         weld-plan

[2] WORKPIECE PROVENANCE & COORDINATE SYSTEM
    Original STL: sample-block.stl (684 bytes, binary)
    SHA-256:      aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
                  (Recorded provenance digest; does not verify local STL bytes unless the file is hashed independently.)
    Source Unit:  mm (normalized to mm in export)
    Triangles:    12 (0 degenerate omitted)
    Frame Axes:   source_xyz (authoritative millimetres, right-handed)
    Bounds (mm):  X [0, 100], Y [0, 100], Z [0, 100]

[3] PROCESS PROFILE
    Profile:      generic-arc-targets-v1

[4] EXECUTION SEQUENCE (1 seam)
    [1] SEAM: "Sample seam" (ID: 00000000-0000-4000-8000-000000000003)
        Parameters:  Speed: 5 mm/s | Current: 120 A | Voltage: 22 V
        Geometry:    3 points | Path length: 10.500 mm | Nominal Arc-On: 2.1 s
        Point List (Workpiece mm):
          P1: [   0.000,    0.000,    0.000] [START]
          P2: [  10.000,    0.000,    0.000]
          P3: [  10.000,    0.500,    0.000] [END]
```

---

## Vercel Deployment Guide

The application is structured for zero-configuration, client-side SPA deployment on Vercel:

1. **Deploying via Vercel CLI**:
   ```bash
   # Install Vercel CLI if needed
   npm install -g vercel

   # Deploy preview
   vercel

   # Deploy production
   vercel --prod
   ```
2. **Deploying via GitHub Integration**:
   - Push repository to GitHub.
   - Import the project into the [Vercel Dashboard](https://vercel.com/new).
   - Preset: **Vite**.
   - Build Command: `npm run build` (runs `tsc --noEmit && vite build`).
   - Output Directory: `dist`.
   - Routing: [`vercel.json`](vercel.json) rewrites fallback requests to `/` with `cleanUrls: true`, avoiding an `.html` destination as required by [Vercel's Vite guidance](https://vercel.com/docs/frameworks/frontend/vite). Hosting behavior still requires a future authorized deployment check.
3. **Production Characteristics**:
   - Web Worker (`import.worker.ts`) is bundled cleanly into static assets without external runtime dependencies.
   - Built-in 3D samples in `/public/samples/` are copied to `dist/samples/` and served as static assets.
   - Diagnostic debug endpoints (`?inspect=1`) are excluded from production builds.

---

## Automated Verification & Quality Gates

The codebase enforces strict, reproducible verification gates:

```bash
# Strict TypeScript compilation without emissions
npm run typecheck

# Unit and integration tests covering domain logic, discovery, recovery, samples, and consumer validation
npm test

# Production build bundle verification
npm run build

# End-to-end browser tests in real headless Chromium (viewport picking, discovery, UI, samples, recovery)
npm run test:browser

# Production smoke test against a live preview server
npm run test:production

# Verify JSON schema and fixture synchronization
npm run schema:generate
git diff --exit-code -- schemas fixtures
```

### Complete Test Coverage Summary
- **Unit & Integration Tests**:
  - `tests/export.test.ts`: Serialization, Zod schema validation, independent Ajv validation against JSON Schema 2020-12, fixture roundtrips.
  - `tests/validation.test.ts`: Planning document invariants, bounds checking, sequence validation.
  - `tests/geometry.test.ts`: Double-precision Float64 vector math, segment distances, turn angle measurements.
  - `tests/history.test.ts`: 50-revision bounded undo/redo stacks, 16 MiB history quota enforcement.
  - `tests/recovery.test.ts`: Cryptographic SHA-256 verification, unit locking, asset activation, mismatch rejection.
  - `tests/samples.test.ts`: Programmatic sample generation, physical bounds, checked-in byte reproducibility, production parsing, and abort signals.
  - `tests/inspect-weld-job.test.ts`: Downstream consumer verification, rejection of malformed JSON, duplicate sequence entries, invalid parameter values.
  - `tests/point-editing.test.ts`: Precision point replacement, insertion, removal, direction reversal.
  - `tests/planning-operations.test.ts`: Immutable planning document modifications, seam addition, reversal, reordering.
  - `tests/limits.test.ts`: Boundary condition scaling (100 seams, 10,000 points).
  - `tests/import.test.ts`: Binary/ASCII STL parsing, degenerate triangle omission, safety caps. Import reads the complete file buffer; it is not a streaming parser.
  - `tests/acceleration.test.ts`: Bounding Volume Hierarchy (`three-mesh-bvh`) buffer transfer and raycasting.
  - `tests/review.test.ts`: Heuristic review grouping and viewport navigation targets.
  - `tests/picking.test.ts`: Authoritative surface picking on meshes.
  - `tests/render-timer.test.ts`: Frame rendering metrics.
  - `tests/candidates.test.ts`: Candidate seam conversion.
  - `tests/discovery.test.ts` and `tests/discovery-controller.test.ts`: Contact detection, evidence and worker lifecycle.
  - `tests/stl-precision.test.ts`: High-precision large-offset coordinates.
- **Browser End-to-End Tests**:
  - `tests/browser/discovery.spec.ts`: Candidate review, acceptance, history, recovery, worker lifecycle and unsupported models.
  - `tests/browser/samples.spec.ts`: Sample loading, 5-step stepper synchronization, seam creation on T-joint, JSON export, recovery, responsive layout at 1280x720 and 1440x900, and rapid selection/cancellation isolation.
  - `tests/browser/recovery.spec.ts`: End-to-end browser verification of plan recovery from STL + JSON.
  - Review grouping, warning navigation and focus are covered within `recovery.spec.ts` and `editor.spec.ts`.
  - `tests/browser/editor.spec.ts`: Direct surface picking, point replacement, insertion, deletion, and reversal.
  - `tests/browser/planning.spec.ts`: Workflow from STL import to parameter assignment and JSON download.
  - `tests/browser/viewer.spec.ts`: Real rendering, source units, surface hit, camera gestures, replacement readiness.

---

## Reference Documentation & Materials

- [Guided Seam Discovery: Method, Limits and Measurements](docs/guided-seam-discovery.md)
- [Milestone 6A Release Readiness and Verification](docs/milestone-6a-verification.md)
- [Engineering Review, Warning Navigation and Project Recovery](docs/engineering-review-recovery.md)
- [Milestone 5 Verification and Test Evidence](docs/milestone-5-verification.md)
- [Precision Seam Editing, History Rules and Manual Acceptance](docs/seam-editor-history.md)
- [Milestone 4 Verification and Measured Limits](docs/milestone-4-verification.md)
- [Manual Planning Architecture and Exact Acceptance Procedure](docs/seam-planning.md)
- [Architecture and Numerical Policy](docs/architecture.md)
- [STL Import, Precision, Ownership, and Resource Policy](docs/import-viewer.md)
- [Every Exported Field and Consumer Responsibilities](docs/weld-job-v1.md)
- [JSON Schema 2020-12 Specification](schemas/weld-job.v1.schema.json)
- [Representative Canonical Weld Job Fixture](fixtures/weld-job.v1.json)
- [Brand Identity, Typography, and Palette Tokens](docs/branding.md)

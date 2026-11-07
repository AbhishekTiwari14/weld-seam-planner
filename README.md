# Armatrix Weld Seam Planner

A high-integrity, browser-based 3D weld seam planning application engineered for robotic welding with snake-like robotic arms.

The system allows welding engineers and robotic technicians to import arbitrary 3D STL workpieces, author and edit precision weld seams directly on part surfaces, configure process parameters, sequence weld paths, perform engineering review checks, export a deterministic JSON weld job, and recover plans offline from the original STL and exported plan.

---

## Live Demo & Deployment

> **Deployment Status**: Production-ready client-side Single Page Application (SPA). Zero backend, zero database, and zero external runtime dependencies.
>
> **Live Demo URL**: *Pending production release approval (see [Vercel Deployment Guide](#vercel-deployment-guide) below)*.

---

## Key Differentiators & Engineering Principles

1. **Weld Plan vs. Robot Program**:
   This application authors an authoritative **Weld Plan** in workpiece coordinate space ($\text{mm}$). It intentionally does **not** generate executable robot trajectories or claim unverified reachability for snake-like arms. Upfront separation of concerns guarantees that downstream robot controllers receive clean, unpolluted geometric and process data without undocumented kinematic approximations.
2. **Double-Precision Coordinate Architecture**:
   All positions, normals, and path measurements are maintained in IEEE 754 Float64 precision within the domain core. Rendering transformations (centering, scaling) are completely decoupled from workpiece coordinates.
3. **Worker-Driven BVH Surface Picking**:
   Heavy binary/ASCII STL parsing, bounds analysis, and SHA-256 fingerprinting execute in a cancellable Web Worker. Raycasting uses bounding volume hierarchies (`three-mesh-bvh`) to maintain 60 FPS surface picking on complex industrial meshes.
4. **Verified Cryptographic Project Recovery**:
   Projects can be restored without cloud storage or user accounts. Re-uploading the original STL alongside an exported `weld-job.v1.json` verifies SHA-256 digests, units, bounding boxes, schema integrity, and point identities before restoring the session.
5. **Deterministic Canonical Serialization**:
   Exports produce identical JSON bytes across runs via canonical key ordering, lexicographically sorted seam definitions, and strict numeric formatting, ensuring clean version control diffs.

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
Open `http://localhost:5173` in a modern browser (Chrome, Chromium, Edge, Firefox, or Safari).

### Downstream Consumer Inspection
Verify how an external robotic controller or process pipeline reads and validates the exported plan:
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
- **Upload STL**: Drag and drop or browse for any binary or ASCII STL (e.g. up to 100 MB+).
- **Or Try a Sample**: Choose one of three built-in engineering assemblies:
  - **T-Joint Assembly** ($120 \times 150 \times 80\text{ mm}$): Perpendicular plates forming standard fillet weld joints.
  - **Gusset Bracket Assembly** ($100 \times 120 \times 120\text{ mm}$): Multi-plate structural bracket with corner gussets.
  - **Pipe-on-Plate Assembly** ($150 \times 150 \times 90\text{ mm}$): Cylindrical saddle joint for curved path evaluation.
- **Unit Confirmation**: Inspect source units (`mm`, `cm`, `m`, `in`) against physical dimensions. The geometry is automatically normalized to millimetres.

### 2. Define Seams
- Click **Add seam** (or press shortcut).
- Click two or more surface points on the 3D model. Raycasting snaps directly to triangular mesh faces.
- Press **Enter** or click **Finish seam** to commit the seam.
- **Precision Point Editing**: Select any point or segment in the side panel to replace, insert, or delete points. Reverse direction flips the path traversal.
- **Full History**: Bounded 50-step Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) with a 16 MiB memory budget.

### 3. Configure Parameters
- Select any seam to inspect its ordered points and set welding targets:
  - **Travel Speed** ($v$ in $\text{mm/s}$)
  - **Current Target** ($I$ in $\text{A}$)
  - **Voltage Target** ($U$ in $\text{V}$)
- Click **Apply parameters** to validate and commit process values.

### 4. Sequence Execution
- Reorder seams using the **Move Up** / **Move Down** controls in the execution sequence panel.
- Sequence dictates the exact traversal order passed downstream to the robot planner.

### 5. Review & Export
- **Engineering Review**: Automated heuristics check for:
  - `SHORT_SEGMENT`: Micro-segments $< 1\text{ mm}$ that risk torch dwell burn-through.
  - `TURN_ANGLE_HIGH`: Sharp corners $> 45^\circ$ where continuous robotic welding may falter without pause/re-orientation.
  - `DEGENERATE_TRIANGLES_OMITTED`: Source STL mesh defect tracking.
- **Interactive Navigation**: Click any warning to frame the camera (`F`) directly on the affected geometry or highlight the parameter input.
- **Export**: Generates and downloads the schema-compliant `weld-job.v1.json`.
- **Restore Plan**: Re-load the original STL and JSON to reconstruct the entire plan state offline.

---

## 2–3-Minute Demonstration Walk-Through

Follow this script to reproduce the core workflow in under 3 minutes:

1. **Launch & Sample Selection (0:00–0:30)**:
   - Open the application. On the clean welcome screen, click **Try a 3D sample**.
   - Select the **T-joint assembly** ($120 \times 150 \times 80\text{ mm}$).
   - Notice the instant worker import, SHA-256 calculation, and 3D viewport rendering.
   - Use viewport controls: Orbit (Left-drag), Pan (Right-drag), Zoom (Wheel), Frame (`F`).
2. **Authoring Seams (0:30–1:15)**:
   - Click **Add seam**.
   - Click along the fillet intersection between the vertical web and horizontal base: point 1 at $X=-50, Y=0, Z=10$, point 2 at $X=50, Y=0, Z=10$.
   - Press **Enter** to finish the seam. Seam 1 appears in the panel with calculated path length ($100.000\text{ mm}$).
   - Add a second seam on the opposite side fillet.
3. **Process Configuration & Sequencing (1:15–1:50)**:
   - Select Seam 1. Notice the guidance banner: *"Parameters needed for export"*.
   - Enter Travel Speed: `8` mm/s, Current: `140` A, Voltage: `23` V. Click **Apply parameters**.
   - Select Seam 2. Enter Speed: `10` mm/s, Current: `160` A, Voltage: `24` V. Click **Apply parameters**.
   - In the Execution Sequence panel, click **Move Up** on Seam 2 to prioritize it first.
4. **Engineering Review & Warning Navigation (1:50–2:20)**:
   - Click **Review & Export**.
   - In the review pane, examine the warnings and unassessed downstream criteria.
   - If a short segment or sharp turn is introduced, click the warning card to verify the viewport automatically frames the exact problem point.
5. **JSON Export & Recovery Verification (2:20–3:00)**:
   - Click **Export weld-job JSON**. The browser downloads the validated `weld-job.v1.json`.
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
| `jobId` | `string` (UUID v4) | Unique identifier for this planning session. |
| `revision` | `integer` | Monotonically increasing revision counter of committed document changes. |
| `workpiece` | `object` | Source provenance, coordinate frame definition, and bounding box. |
| `processProfile` | `string` | Process profile identifier (`"generic-arc-targets-v1"`). Targets only; not certified procedure. |
| `seams` | `array` | List of defined weld seams, lexicographically sorted by `id`. |
| `sequence` | `array<string>` | Ordered array of seam UUIDs defining the planned robotic execution order. |
| `review` | `object` | Recomputed heuristic review warnings and explicitly unassessed robotic criteria. |

### Workpiece Object (`workpiece`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `workpiece.id` | `string` (UUID v4) | Unique identifier for the workpiece instance. |
| `workpiece.source.filename` | `string` | Cleaned base filename of the imported STL (1–255 characters). |
| `workpiece.source.byteLength` | `integer` | Exact file size in bytes of the original STL file. |
| `workpiece.source.sha256` | `string` | 64-character lowercase hexadecimal SHA-256 hash of the original STL bytes. |
| `workpiece.source.encoding` | `string` | Format encoding: `"binary"` or `"ascii"`. |
| `workpiece.source.unit` | `string` | User-confirmed original source unit: `"mm"`, `"cm"`, `"m"`, or `"in"`. |
| `workpiece.source.inputTriangles` | `integer` | Count of triangles parsed from the source STL. |
| `workpiece.source.omittedDegenerateTriangles` | `integer` | Count of collapsed/zero-area triangles filtered during import. |
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
| `id` | `string` (UUID v4) | Unique identifier for the seam. |
| `name` | `string` | Non-empty display label (max 80 characters). |
| `geometry.type` | `string` | `"polyline"`. Represents piecewise linear surface chords. |
| `geometry.points` | `array` | Ordered list of 2 to 1,000 vertices defining the weld path. Array order is weld direction. |
| `geometry.points[].id` | `string` (UUID v4) | Stable point identifier. Preserved across reversals and replacements. |
| `geometry.points[].positionMm` | `[number, number, number]` | Finite $[X, Y, Z]$ coordinates in the workpiece frame ($\text{mm}$). |
| `parameters.travelSpeedMmPerS` | `number` | Requested torch travel speed in $\text{mm/s}$ ($> 0$). |
| `parameters.currentTargetA` | `number` | Requested arc current target in amperes ($> 0$). |
| `parameters.voltageTargetV` | `number` | Requested arc voltage target in volts ($> 0$). |

### Engineering Review (`review`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `review.rulesetVersion` | `string` | Ruleset version (`"1.0.0"`). Decoupled from structural schema version. |
| `review.warnings` | `array` | Heuristic findings (`SHORT_SEGMENT`, `TURN_ANGLE_HIGH`, `DEGENERATE_TRIANGLES_OMITTED`). |
| `review.warnings[].code` | `string` | Machine-readable finding code. |
| `review.warnings[].seamId` | `string` (optional) | Associated seam UUID for path warnings. |
| `review.warnings[].pointId` | `string` (optional) | Associated vertex UUID for angle warnings. |
| `review.warnings[].valueMm` | `number` (optional) | Measured segment length for short segment warnings. |
| `review.warnings[].valueDeg` | `number` (optional) | Measured turn angle in degrees for direction changes. |
| `review.notAssessed` | `array<string>` | Explicit list of robot execution responsibilities that this plan does **not** certify. |

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

A lightweight, zero-dependency Node.js script is included in [`examples/inspect-weld-job.ts`](examples/inspect-weld-job.ts) demonstrating how downstream systems parse, validate, and walk the plan:

```bash
node examples/inspect-weld-job.ts fixtures/weld-job.v1.json
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

[2] WORKPIECE PROVENANCE & COORDINATE SYSTEM
    Original STL: sample-block.stl (684 bytes)
    SHA-256:      aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    Source Unit:  mm
    Triangles:    12
    Frame Axes:   source_xyz (authoritative millimetres)
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

The application is fully architected for zero-configuration, static SPA deployment on Vercel:

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
   - Build Command: `npm run build` (or `tsc --noEmit && vite build`).
   - Output Directory: `dist`.
   - Routing: Pre-configured via [`vercel.json`](vercel.json) rewrite `/* -> /index.html` for client-side SPA routing.
3. **Verification in Production**:
   - Web Worker (`stl.worker.ts`) is bundled cleanly into static assets without external runtime dependencies.
   - Built-in 3D samples in `/public/samples/` are served with deterministic cache headers.
   - Diagnostic debug endpoints (`?inspect=1`) are automatically stripped from production builds.

---

## Automated Verification & Quality Gates

The codebase enforces strict, reproducible verification gates:

```bash
# Strict TypeScript compilation without emissions
npm run typecheck

# 181 unit & integration tests covering pure domain logic, recovery, and sample generation
npm test

# Production build bundle verification
npm run build

# 23 end-to-end browser tests in real headless Chromium (viewport picking, UI, samples, recovery)
npm run test:browser

# Production smoke test against a live preview server
npm run test:production

# Verify JSON schema and fixture synchronization
npm run schema:generate
git diff --exit-code -- schemas fixtures
```

### Complete Test Coverage Summary
- **181 Unit & Integration Tests**:
  - `tests/samples.test.ts`: Sample generation, physical bounds, worker parsing pipeline, and plan recovery.
  - `tests/recovery.test.ts`: Full offline plan recovery, SHA-256 fingerprint verification, mismatch rejection.
  - `tests/review.test.ts`: Heuristic rule checks (`SHORT_SEGMENT`, `TURN_ANGLE_HIGH`, `DEGENERATE_TRIANGLES_OMITTED`).
  - `tests/contracts.test.ts` & `tests/schema.test.ts`: Zod schema enforcement and independent Ajv validation against JSON Schema 2020-12.
  - `tests/history.test.ts`: Undo/redo state limits and snapshot memory constraints.
  - `tests/domain.test.ts`: Vector math, polyline lengths, turn angle calculations, Float64 numerical stability.
- **23 Browser End-to-End Tests**:
  - `tests/browser/samples.spec.ts`: Sample loading, 5-step stepper synchronization, seam creation on T-joint, JSON export, and recovery. Responsive layout checks at 1280x720 and 1440x900.
  - `tests/browser/recovery.spec.ts`: End-to-end browser verification of plan recovery from STL + JSON.
  - `tests/browser/review.spec.ts`: Warning navigation, review grouping, and viewport focus framing.
  - `tests/browser/editor.spec.ts`: Direct surface picking, point replacement, insertion, deletion, and reversal.
  - `tests/browser/planning.spec.ts`: Workflow from STL import to parameter assignment and JSON download.

---

## Reference Documentation & Materials

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

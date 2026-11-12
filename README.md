<div align="center">

# Weld Seam Planner

**3D workpiece → weld seams → process targets → validated JSON job**

A browser-based engineering workbench for planning robotic welding operations. Import an STL, define or review weld paths on a 3D part, configure each seam, choose the execution order, and export a controller-neutral weld plan.

**[Live Application](https://weld-seam-planner-theta.vercel.app/)** · **[Video Walkthrough](https://youtu.be/fszpufLLuYM)** · **[JSON Schema](schemas/weld-job.v1.schema.json)** · **[Architecture](docs/architecture.md)**

[![Watch the Weld Seam Planner walkthrough](https://img.youtube.com/vi/fszpufLLuYM/hqdefault.jpg)](https://youtu.be/fszpufLLuYM)

*Click the image to watch the recorded end-to-end demonstration.*

</div>

> **Planning, not robot control.** This tool creates and validates an engineering weld plan in workpiece coordinates. It does **not** certify welding-process suitability, infer torch orientation, solve robot kinematics, check collisions, or generate executable robot motions.

## What it does

| Capability | How it works |
| --- | --- |
| **Import 3D geometry** | Load your own binary/ASCII STL, confirm source units (mm, cm, m, in), or choose one of three bundled engineering samples. Imported workpiece coordinates are normalized to millimetres. |
| **Inspect in 3D** | Orbit, pan, zoom and frame the Three.js model. Surface raycasting places precise points on the imported mesh. |
| **Plan weld seams** | Manually click two or more surface points to build an ordered path; rename, reverse, insert/replace/remove points, and undo/redo committed edits. |
| **Review suggestions** | Guided seam discovery proposes straight geometric contact paths on supported meshes. An engineer inspects, accepts or rejects each candidate. |
| **Set welding targets** | Configure travel speed (mm/s), current (A) and voltage (V) independently for each seam. |
| **Sequence operations** | Move seams earlier or later in an explicit execution order. |
| **Review and export** | Check missing targets and geometric heuristics; download a versioned, schema-validated JSON weld job. |
| **Recover saved plans** | Select exported JSON; matching bundled STL files are automatically located and SHA-256 verified. For custom parts, select the original STL. No server-side accounts or autosave. |

### End-to-end workflow

```text
Import STL ──→ Define seams ──→ Configure targets ──→ Sequence ──→ Review & export
      ↑                                                
   Try sample / custom STL          Restore later using saved JSON (+ original custom STL)
```

**Try it in a minute:** Open the [live app](https://weld-seam-planner-theta.vercel.app/), load **T-Joint Fillet Assembly**, confirm **mm**, choose **Discover Seams**, inspect and accept the two proposed contact paths, set targets for both seams, reorder them, and select **Review & Export**.

### Bundled parts and discovery coverage

| Sample | Geometry | Guided discovery |
| --- | --- | --- |
| **T-Joint Fillet Assembly** | Two perpendicular plates; 24 triangles | Two longitudinal straight contact-path candidates |
| **Gusseted Mounting Bracket** | Base, backplate and stiffener; 32 triangles | Four candidates |
| **Pipe-on-Plate Nozzle Joint** | Hollow pipe on a baseplate; 300 triangles | Curved junction detection is not supported; use manual seam planning |

**Candidate ≠ weld instruction.** The detector identifies geometrically plausible **straight edge-on-face contacts**, not welding intent. It has a **4,000-triangle analysis limit** and does not detect curved contacts, penetrations or general mesh intersections. See [discovery method, evidence and limitations](docs/guided-seam-discovery.md).

## Run locally

**Requirements:** Node.js **24** (`>=24 <25`), npm, and a current Chrome/Chromium browser.

```bash
git clone https://github.com/AbhishekTiwari14/weld-seam-planner.git
cd weld-seam-planner
npm ci
npm run dev
```

Open **http://localhost:5173**. No environment variables, server API, database, external CAD service or authentication are required for the core workflow. The browser fetches bundled samples from the same host; uploaded STL files and weld plans are processed locally.

To build and view the production bundle:

```bash
npm run build
npm run preview
```

The production app is deployed as a static Vite SPA on [Vercel](https://weld-seam-planner-theta.vercel.app/). The public endpoint is the submitted deployment; hosting the project locally does not require a Vercel account.

## Architecture and design decisions

| Layer | Main modules | Why |
| --- | --- | --- |
| **UI and interactive viewport** | `src/ui`, `src/viewport` | React 19 + React Three Fiber/Three.js render the workpiece and seam overlays; the canvas and engineering controls are separate. |
| **Import and mesh processing** | `src/import` | A cancellable Web Worker parses and fingerprints binary/ASCII STL; resource limits and stale-operation guards protect the active session. |
| **Geometry and surface picking** | `src/geometry`, `src/viewport/picking.ts` | Authoritative double-precision coordinates are independent of display transforms. `three-mesh-bvh` accelerates picking on large meshes. |
| **Engineering plan domain** | `src/domain`, `src/planning` | Zod-backed contracts and pure, immutable operations enforce valid points, sequence and parameters; history stores bounded revisions. |
| **Guided discovery** | `src/candidates` | A separate cancellable worker suggests limited straight contact paths with evidence. Accepting a candidate produces a normal editable seam; rejected suggestions are not exported. |
| **Validation and JSON export** | `src/validation`, `src/export`, `schemas` | Shared semantic rules and generated JSON Schema distinguish a valid planning artifact from a feasible physical robot program. |
| **Recovery** | `src/recovery`, `src/import/store.ts` | JSON is parsed first, source bytes are checked using SHA-256, and an existing workspace is not replaced until verified and confirmed. |

### Why these choices?

- **Controller-neutral output:** the JSON describes **what** and **where** to weld, plus ordered target settings, while leaving robot-specific reachability and motion planning to a downstream system. No unverified tool poses are fabricated.
- **Stable workpiece coordinates:** all planning coordinates are millimetres in the imported part's **source axes and origin**, even though the viewer recenters/scales geometry for display. Numeric calculations use JavaScript double precision; source binary STL precision is still limited by its encoded values.
- **Local-first architecture:** no login, backend or file upload is required for editing. Recovery uses the exported JSON and either a verified bundled sample or the exact original external STL.
- **Reliable editing and replacement:** import/recovery is transactional and cancellable. Failed or cancelled operations leave the current plan intact. Explicit confirmation precedes replacement.
- **Reproducible exports:** schema version `1.0.0`, stable point/seam identities, ID-sorted seam definitions, an explicit sequence array and deterministic serialization make unchanged plans export to identical JSON bytes.
- **Meaningful review:** missing targets block export; very short segments (<1 mm), turns (>45°) and omitted degenerate triangles produce **heuristic** review findings, not manufacturing certification.

The code includes source-focused decisions and measurements in [architecture](docs/architecture.md), [import/viewer](docs/import-viewer.md), [manual planning](docs/seam-planning.md), [discovery](docs/guided-seam-discovery.md) and [engineering review/recovery](docs/engineering-review-recovery.md).

## Weld-job JSON contract

**Source of truth:** [`schemas/weld-job.v1.schema.json`](schemas/weld-job.v1.schema.json), generated from the Zod contract; see also [validation and consumer notes](docs/weld-job-v1.md) and the [checked-in JSON example](fixtures/weld-job.v1.json).

A complete export has the following shape:

```text
weld-job.v1.json
├── schemaVersion, kind, jobId, revision
├── workpiece
│   ├── id, source { filename, byteLength, sha256, encoding, unit,
│   │                inputTriangles, omittedDegenerateTriangles }
│   ├── frame { id, lengthUnit, axes, origin, handedness }
│   └── boundsMm { min, max }
├── processProfile
├── seams[] { id, name,
│             geometry { type, points[] { id, positionMm } },
│             parameters { travelSpeedMmPerS, currentTargetA, voltageTargetV } }
├── sequence[]   (ordered seam UUIDs)
└── review { rulesetVersion, warnings[], notAssessed[] }
```

The `seams` array is sorted by ID for canonical serialization. **Execution order comes from `sequence`**, not the order of the `seams` array. All positions are in workpiece millimetres; points are ordered within each seam, and their order defines direction. The `review` section records recomputed warnings plus explicit robot responsibilities that have **not** been assessed.

<details>
<summary><strong>Complete JSON field reference (types, meanings and constraints)</strong></summary>

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


</details>

### Validate an exported job in a downstream consumer

The included Node inspector imports the production validator to check structural and semantic fields. It does **not** independently verify a separate STL unless it is hashed by the caller, and it does not establish robot feasibility.

```bash
npm run inspect:fixture

# Inspect your own exported JSON
node examples/inspect-weld-job.ts path/to/downloaded.weld-job.v1.json
```

See [the consumer example](examples/inspect-weld-job.ts) and [export contract documentation](docs/weld-job-v1.md).

## Verification

Run the same checks used by [GitHub Actions](.github/workflows/ci.yml):

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:production
npm run schema:generate
git diff --exit-code -- schemas fixtures
```

Tests include geometry and numerical precision, STL parsing, source provenance, immutable planning operations, schema/semantic validation, deterministic export, undo/redo, worker lifecycle, sample restoration, Chromium UI interactions and production smoke checks.

The supported import test envelope is **500,000 triangles / 50 MiB**, with harder safety caps of **750,000 triangles / 64 MiB**; larger models are not guaranteed. Browser end-to-end coverage uses **Chromium**; Firefox and Safari are not claimed as verified.

## Scope and limitations

This is an **engineering weld-plan editor**, not a welding procedure qualification tool or robot controller:

- Geometric discovery is intentionally narrow: up to 4,000 triangles, complete straight edge-on-face contacts only. It cannot infer general welding intent or detect the built-in pipe's curved seam.
- Authored seams are **polylines**: clicked points lie on the mesh, but straight connecting chords are not guaranteed to follow curved surfaces.
- Targets for current, voltage and speed are supplied by the user; no metallurgy, material suitability or qualified welding procedure is inferred.
- The exported plan does not contain certified torch orientation, robot-to-workpiece registration, inverse kinematics, reachability, collision avoidance, acceleration timing or safe between-seam transfer moves.
- Nominal arc-on time = path length ÷ constant travel speed; it is **not** total robot cycle time.
- No autosave or cloud persistence. **Download JSON before refreshing.** For custom parts, keep the original STL as well.

## More documentation

- [Detailed JSON schema and semantic rules](docs/weld-job-v1.md)
- [Architecture and numerical policy](docs/architecture.md)
- [Import, viewport ownership and performance](docs/import-viewer.md)
- [Manual planning and editing](docs/seam-planning.md)
- [Precision seam editing and history](docs/seam-editor-history.md)
- [Guided discovery and its limitations](docs/guided-seam-discovery.md)
- [Engineering review and project recovery](docs/engineering-review-recovery.md)
- [Brand assets, typography and palette provenance](docs/branding.md)
- [Verification and benchmark records](docs/milestone-6a-verification.md)

---

**Built by Abhishek Tiwari for the Armatrix Software Intern assignment.** The official Armatrix brand asset pack is used for this submission; no general rights to redistribute the brand assets are implied.

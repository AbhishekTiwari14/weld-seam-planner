# Weld-job JSON contract 1.0.0

The complete machine-readable structural schema is `schemas/weld-job.v1.schema.json` (JSON Schema 2020-12). The example is `fixtures/weld-job.v1.json`. All listed fields are required; additional fields are rejected. No orientation or robot transform is supplied.

## Root fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Exact string `1.0.0`; unsupported versions are rejected rather than guessed |
| `kind` | Exact string `weld-plan`; explicitly not a robot program |
| `jobId` | UUID identifying this planning job |
| `revision` | Nonnegative safe integer identifying the committed document revision |
| `workpiece` | Source provenance, frame definition, and normalized bounds |
| `processProfile` | `generic-arc-targets-v1`, a generic requested speed/current/voltage profile, not a certified welding procedure |
| `seams` | Ordinary accepted/manual seams, sorted by ID in serialization; not execution order |
| `sequence` | Seam UUIDs in intended execution order, each exactly once |
| `review` | Fresh heuristic findings and explicitly unassessed downstream concerns |

## Workpiece

| Field | Meaning / units |
| --- | --- |
| `id` | UUID identifying the workpiece |
| `source.filename` | Source basename, 1–255 characters; slashes and control characters are rejected |
| `source.byteLength` | Original file size in bytes, positive safe integer; not capped at the guaranteed import envelope |
| `source.sha256` | Lowercase 64-character SHA-256 hex digest of original file bytes; provenance, not proof of geometry validity |
| `source.encoding` | `ascii` or `binary` STL |
| `source.unit` | User-confirmed `mm`, `cm`, `m`, or `in`; provenance only, since geometry below is already normalized |
| `source.inputTriangles` | Positive original triangle count |
| `source.omittedDegenerateTriangles` | Nonnegative omitted count, strictly smaller than input count |
| `frame.id` | `workpiece` |
| `frame.lengthUnit` | `mm` for all positions and bounds |
| `frame.axes` | `source_xyz`: source axis order is preserved |
| `frame.origin` | `source_origin`: rendering centering does not move the export origin |
| `frame.handedness` | `right`: application interpretation, not robot calibration |
| `boundsMm.min`, `boundsMm.max` | Finite `[x,y,z]` bounds in millimetres, ordered componentwise with a finite positive diagonal |

Binary source metadata currently requires `byteLength = 84 + 50 * inputTriangles` and a count fitting the format's unsigned 32-bit field. There is no equivalent ASCII byte-count formula. Source digest authenticity cannot be checked from the job alone because STL bytes are not embedded.

## Seams and parameters

| Field | Meaning / units |
| --- | --- |
| `id` | Seam UUID |
| `name` | Trimmed nonempty display name, at most 80 characters |
| `geometry.type` | `polyline` for both straight and multipoint seams |
| `geometry.points` | Ordered points, 2–1,000 per seam; increasing array order is weld direction |
| `geometry.points[].id` | Stable point UUID; replacement/reversal preserves identity |
| `geometry.points[].positionMm` | Finite `[x,y,z]` workpiece coordinates in millimetres |
| `parameters.travelSpeedMmPerS` | Requested constant travel speed in mm/s, finite and positive |
| `parameters.currentTargetA` | Requested current target in amperes, finite and positive |
| `parameters.voltageTargetV` | Requested voltage target in volts, finite and positive |

Numbers are targets only. No material, process mode, synergic relationship, controller-supported range, or welding-procedure suitability is inferred. Null parameters are permitted in the internal planning document but never in exported jobs.

There are at most 100 seams and 10,000 total points. IDs must be globally unique. Sequence must be an exact permutation of seam IDs. Points must lie within bounds plus validation tolerance; this does not prove surface conformance. Adjacent points cannot coincide within tolerance. Closed paths explicitly repeat the initial location with a distinct final point ID. Segment lengths, total length, direction flags, durations, and sequence indices are not duplicated as editable/exported fields.

## Engineering review

`review.rulesetVersion` is `1.0.0`. It identifies the numerical/heuristic policy independently of the structural schema. `review.warnings` contains only these records:

| Code | Additional fields | Meaning |
| --- | --- | --- |
| `SHORT_SEGMENT` | `seamId`, `startPointId`, `endPointId`, `valueMm` | Valid segment shorter than 1 mm |
| `TURN_ANGLE_HIGH` | `seamId`, `pointId`, `valueDeg` | Direction change above 45 degrees plus 1e-6 degrees comparison tolerance |
| `DEGENERATE_TRIANGLES_OMITTED` | `count` | Nonzero number omitted during import |

These are warnings, not certified machine limits. Export regenerates warnings from the committed document and rejects geometric/structural errors. The library's external-job validator also recomputes warning identities and values and rejects stale, forged, missing, or duplicate records. Warning array order is non-semantic. Exact numeric warning reproduction is expected for this ruleset/exporter; a differently implemented downstream checker may need a documented numerical comparison policy.

`review.notAssessed` is the fixed ordered list:

| Value | Unavailable assurance |
| --- | --- |
| `surface_conformance` | Polyline segments follow the intended physical surface/joint |
| `process_suitability` | Parameters suit the process, joint, and material |
| `torch_orientation` | Torch attitude, work/travel angle, and tool offset |
| `workpiece_to_robot_registration` | Calibrated transform into robot/fixture coordinates |
| `robot_kinematics` | Reachability, joint limits, singularities, and IK |
| `collision_avoidance` | Robot/tool/workpiece clearance |
| `motion_timing` | Acceleration, blending, controller timing, and executable trajectory |
| `inter_seam_transfers` | Approach, retract, and travel motions between welds |

## Consumption and serialization

A downstream adapter checks schema version and semantic invariants, resolves IDs through `sequence`, and reads each ordered millimetre path plus process targets. It must then supply controller-specific calibration, tool poses, process setup, motion planning, and execution validation. Source units must **not** be applied again. The plan alone is not suitable for direct robot execution.

Serialization uses schema-defined property order, lexicographically ID-sorted seam records, authoritative sequence order, two-space indentation, and a final newline. It introduces no deliberate coordinate rounding or timestamps. Normal JSON number serialization applies, including normalization of negative zero. The same validated data produces the same bytes regardless of input object insertion order.

Use the exported `validateWeldJob` function for both structure and semantics; Ajv/JSON Schema alone checks only structure. Zod failures identify schema paths; semantic failures use `PlanValidationError.findings`. Breaking contract changes require a new major version; do not add unrecognized detector fields to v1. The current consumer deliberately accepts only the exact implemented schema and ruleset versions.

Run `npm run schema:generate` after changing the structural contract or illustrative fixture. Tests detect checked-in artifact drift. Fixture hash and process values are illustrative, not a real source digest or recommended weld settings. `invalid-zero-speed.v1.json` is intentionally invalid.

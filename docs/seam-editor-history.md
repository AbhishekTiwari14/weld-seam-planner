# Precision editing and document history

Milestone 4 extends the existing planning workbench. The STL parser, workpiece coordinate policy, domain contracts, candidate contracts and v1 exported-job schema are unchanged. There is no automatic detection, persistence or robot execution.

## Editing a committed path

Select a seam and open **Ordered points & geometry**. Point and segment buttons reference stable point IDs; displayed ordinal numbers are derived from the current traversal. Point selection displays the authoritative XYZ tuple in millimetres and a bordered square marker. Segment selection displays a wider light line and its endpoints. **Clear highlight** returns to ordinary seam selection without changing the plan.

| Action | Interaction | Committed result |
| --- | --- | --- |
| Replace | Select a point → Replace on surface → hover/click model → Apply point | Same seam and point IDs; one changed position |
| Insert | Select a segment → Insert point on surface → hover/click model → Apply point | One new UUID between the selected consecutive endpoints; all existing IDs/order preserved |
| Remove | Select a point → Remove point | Removes that ID; minimum two points; rejects a newly coincident adjacent pair |
| Reverse | Select seam → Reverse direction | Same seam/points/parameters/sequence position; reversed point traversal |

Replacement/insertion enter explicit modes. Hover shows provisional adjacent chords. A valid click stages a candidate and its full-precision coordinates without modifying the document. The green preview then stays fixed to the candidate that Apply will commit; another click replaces it. The original orange path remains visible for comparison. Click validation and Apply both use the same pure operation and full planning validation. A failed pick clears the candidate and displays the reason. **Escape/Cancel** leaves the committed plan and history unchanged. **Enter** applies while the viewport is focused.

Only real nearest-surface hits from the established picker can supply edit positions. Its DoubleSide/BVH behavior, Float64 source-triangle intersection, coordinate transform and ClickGuard are reused. Dragging, modified clicks, wheel navigation and cancelled gestures never become edits. Connecting segments remain straight chords; the application does not certify surface conformance or welding intent.

Each surface-edit intent captures workpiece ID, document revision, seam ID and target point/endpoint IDs. Insertion allocates its new ID once when entering the mode. Applying an obsolete intent fails instead of editing a newer document. Successful workpiece replacement resets all transient editor state. Invalid selection references are cleared before paint when history removes a point/seam or reverses a selected segment. Undo restores document content, not the earlier UI selection.

## Transaction and history boundary

`createImportController` owns the sole committed `PlanningDocument` and a private `PlanHistory`. The React workspace holds only selection, draft, active edit, preview, parameter text and dialog state. No React component maintains a second document or its own history stack.

`editPlan` validates the operation output and unchanged job/workpiece identity, compares committed content for a no-op, requires exactly the next revision, records the previous content, then installs the new document and history summary together. It records add/delete/rename/parameters/order/replace/insert/remove/reverse identically. Rejected edits and content-equivalent changes do not add entries or clear redo.

Undo/redo restore immutable JSON snapshots of **document content only**. They parse and validate the proposed restoration before mutating stacks, verify the workpiece is unchanged, preserve the current job ID and assign `current.revision + 1`. Export therefore identifies the current committed revision even when its geometry matches an older plan. Revision cannot overflow the safe-integer contract. Reversing twice likewise restores traversal with two new revisions.

History is bounded by **50 total past/future states** and **16 MiB of accounted snapshot strings**, whichever is reached first. Accounting uses two bytes per UTF-16 code unit; it is not a claim about total browser heap. The oldest undo states are evicted first, then the furthest redo states if necessary. Near-limit plans retain fewer than 50 states (11 for the measured integer-coordinate 10,000-point fixture; other coordinates/names change that count). JSON snapshots isolate historical values from accidental caller mutations and never retain STL buffers, meshes, materials or BVHs. Serialization/parsing and validation still incur transient allocation and synchronous work; see the measurements in the verification report.

New committed edits clear future history. Successful model activation clears both stacks atomically with the new empty document; failed, cancelled and stale imports do not. History is memory-only and cannot cross a workpiece replacement or page reload.

Visible Undo/Redo buttons expose available-state counts in their titles. Ctrl/Cmd+Z, Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z operate on committed history outside editable fields. Native undo remains untouched in inputs, textareas, selects, role=textbox and contenteditable fields. Drafts, point-edit candidates and unapplied parameter text block plan history until finished/discarded; keyboard commands do not implicitly apply them. Review/import dialogs retain modal keyboard ownership.

## Actionable diagnostics and resource ownership

The inspector and engineering review share `GeometryDiagnostics`; findings retain the existing stable point or segment references. Buttons show seam name, current point/segment number, measured mm/degrees and the rule explanation. Clicking a review warning closes review and selects that geometry in the inspector/viewport. It never changes the document. Finish/cancel a draft before navigating from its review to a warning.

Existing short-segment (<1 mm) and high-turn (>45°, with the existing numerical tolerance) rules remain inspection heuristics. No process recommendations, torch orientation or registration are inferred.

The STL asset remains unchanged through edits/history. Its original scene owner retains the mesh, buffers and acceleration structure. Committed paths, draft overlays, and target/candidate overlays have separate disposal effects. Hover rebuilds only the small transient layer; it does not rebuild the STL/BVH or committed paths. Picking continues to target the STL exclusively, even though overlays remain visible through it. Geometry selection changes can rebuild committed path styling; this is bounded by the existing plan limits and is not performed on pointer hover.

## Manual acceptance procedure

1. Run `npm run dev`; open at 1280 × 720. Import `fixtures/models/analytic-plate.stl` as cm. Confirm 400 × 600 × 0 mm and preserved source axes/origin.
2. Create a three-point path; set your illustrative test parameters; add a second seam and change sequence. Open ordered points, select point 2 and confirm its XYZ/marker.
3. Replace on surface: hover, click, orbit/pan/zoom, and inspect the fixed candidate. The revision must remain unchanged until Apply. Apply increments it once and preserves the point ID (inspect exported JSON or the inspector's `data-point-id`).
4. Select a segment and insert a point; cancel once, then repeat and Apply. Confirm one new ID, old point order, lengths and turns. Remove that point, Undo, Redo. Removing from a two-point seam must be disabled.
5. Reverse twice and check point order, start/end and chevron. Undo a seam deletion and verify geometry, parameters and sequence; Redo deletes it again. Each traversal advances the revision. Make a new edit after Undo and confirm Redo becomes unavailable.
6. Type in a parameter/name field and try native Ctrl+Z. Test global shortcuts outside inputs. Unapplied parameter text and active drafts must block plan undo without being committed.
7. Create a short segment and a turn above 45°. Select each warning in inspector and review; confirm endpoint/point highlights and numeric units. Clear highlight and verify the document revision did not change.
8. Fail/cancel an STL replacement while a candidate and history exist; both remain. Confirm a successful replacement clears the plan, candidate and history. Check that camera gestures and a miss never apply a point.
9. Export after undo/redo and compare exact intended points, IDs, sequence and parameters. Repeat download without editing: the bytes must match. Inspect the explicit downstream limitations.

Automated evidence and honest performance/browser limits are recorded in [Milestone 4 verification](milestone-4-verification.md).

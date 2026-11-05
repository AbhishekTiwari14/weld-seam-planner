# Milestone 3: end-to-end manual planning

Import STL → confirm units → Add seam → click surface points → Finish seam → configure targets → order seams → Review & Export → download validated JSON.

## State and module boundaries

`createImportController().store.active.document` is the only committed plan. `editPlan(workpieceId, operation)` reads the latest document, validates an independent copy, applies a pure operation, validates the result and installs it atomically. It rejects obsolete workpiece IDs, changed workpiece/job identity and revisions other than the next integer. Identical results do not notify the store. The runtime `MeshAsset` object remains unchanged on plan edits.

- `domain/operations.ts`: add, rename, remove, parameter update and exact sequence permutation. Changes increment revision once; unchanged names, numeric values and sequence do not. Removing a seam also removes its sequence reference. Reversal remains a foundation operation, with no M3 UI.
- `planning/draft.ts`: append validated surface points and commit through `addSeam`. UUIDs are supplied by the caller; coincidence, bounds, global ID uniqueness and capacity rules are checked. Draft arrays never enter the document before Finish.
- `planning/parameter-input.ts`: positive finite decimal/scientific text or blank/null. Intermediate strings such as `-` and `1e` stay local; they cannot enter the document. There are no machine defaults.
- `ui/PlanningWorkspace.tsx`: transient draft, selected seam, error, parameter-dirty flag and review visibility. It passes document operations through the controller and clears editor state before paint when a new workpiece activates. It preserves the Canvas owner across replacements.
- `ui/SeamPanel.tsx`, `ParameterEditor.tsx`: sequence list, rename/delete, derived metrics, ordered points and explicit parameter Apply/Discard. Parameter changes are one transaction across the three fields. Dirty parameter inputs prevent switching seams or reviewing stale saved values. Blank values may be saved but block export.
- `viewport/SeamInteraction.tsx`: production DOM pointer handling and existing surface picker. `SeamLayer.tsx`: explicitly owned overlay objects and cleanup, separate from STL ownership.
- `ui/ReviewDialog.tsx`, `export/download.ts`: shared analysis for review, then a fresh read of the committed document and the existing validated exporter at download time. An unfinished draft can remain open; review explicitly excludes it.

The import parser, coordinate policies, candidate contracts, process profile and weld-job schema are unchanged. A real cross-runtime export regression required a narrow roundoff allowance for derived warning measurements in external-job validation; see [the documented comparison policy](weld-job-v1.md#engineering-review). No new package dependencies were introduced. No detector metadata enters ordinary seams or export.

## Interaction and geometry

Add seam explicitly enters creation mode and focuses the viewport. A primary pointer release adds a point only when the existing `ClickGuard` accepts it: less than 600 ms, at most 4 CSS pixels of maximum movement, one pointer, no modifier keys. Orbit, right-button pan, wheel, cancellation and blur do not place points. Empty-space clicks report a miss. Hover previews are limited to one queued animation frame and disabled while dragging.

The picker raycasts only the active STL, never the overlays. Its nearest double-sided intersection uses the existing BVH when available and is reintersected with the authoritative Float64 triangle before conversion to workpiece millimetres. The camera and renderer never become a robot registration. No additional source-unit scaling or export rounding is applied.

Finish/Enter requires at least two distinct consecutive points. Escape cancels; Backspace removes the latest draft point. Keyboard shortcuts operate while the viewport itself is focused, not while typing in sidebar inputs. Explicit buttons provide the same actions. Clicking a committed line selects its seam when no draft or unsaved parameter edit is active. Overlapping seam lines may be ambiguous; the list is the precise selection alternative.

Committed lines have white start markers and orange end markers. The selected line is orange, includes a direction chevron and is identified by name in the viewport. Sequence numbers live in the list to avoid label clutter. Overlay depth testing is disabled intentionally to retain path visibility through the mesh; the viewport states this explicitly. This does **not** change occlusion for new surface picks. Straight connecting segments are chords, not surface-conforming trajectories. A chevron can be foreshortened in some views; ordered points and endpoint colors remain available.

All geometry calculations use the shared domain utilities. The point inspector shows segment lengths, interior turn angles and existing warnings. Short segments below 1 mm and turns above 45° plus numerical comparison tolerance are heuristics, not certified welding limits. Nominal arc-on time is length / constant speed; missing speed means unavailable time. Summaries are display-rounded; coordinate tooltips expose full stored numbers and exported numbers remain unchanged.

## Resource and replacement lifecycle

The STL geometry/material/BVH remain owned by the existing Scene effect, keyed by the asset. Each seam overlay effect owns its line/point geometries and materials, removing and disposing all of them on replacement, editing or unmount. Hover changes update only the transient draft layer, not committed overlays or STL geometry. Rendering remains demand-driven; no continuous animation loop or damping was introduced.

GPU geometry count includes overlays. With one selected straight seam the measured count is five: the workpiece, path line, two endpoint point-cloud geometries and direction line. This is expected, not a mesh leak. A newly activated empty workpiece must return to exactly one after its own first render. The original geometry-revision/rendered-revision synchronization is preserved.

Failed/cancelled imports preserve the entire plan, selection, draft and parameter text. A confirmed successful replacement installs a new workpiece and revision-zero empty plan, then clears editor state. The confirmation dialog warns that the weld plan and draft will be cleared. It does not clear the old plan before the replacement succeeds.

## Validation and download

Review shows sequence, total length, nominal time, blocking issues, heuristic warnings and every established downstream limitation. Empty plans and missing targets cannot download. Positive finite parameters are accepted as user targets without claiming process suitability. Schema/semantic validation still applies at export, even if the UI previously showed a valid plan.

Download uses `exportPlanningDocument` and `weldJobFilename`. Only committed seams enter schema `1.0.0`; source SHA-256, frame, UUIDs, ordered points, sequence and recomputed warnings are preserved. Blob URLs are released after the browser receives the download action. Deterministic serialization makes repeated downloads of the same revision byte-identical, including while an unfinished draft exists.

## Manual acceptance procedure

1. Run `npm ci`, `npm run dev`; open the local URL at 1280 × 720 or larger. Use `fixtures/models/analytic-plate.stl`, select **cm**, and verify dimensions **400 × 600 × 0 mm**. Production review can use `npm run build` then `npm run preview`.
2. Click **Add seam**, then two separated visible locations on the plate. Confirm the preview, count and connected path. Drag/orbit, right-drag/pan and scroll; the count must not change. Reset view as needed. Click empty space; it must report a miss. Backspace removes the last point while the viewport is focused. Replace that point and press Enter or Finish seam.
3. Rename the selected seam **Root pass**. Inspect its point order, white start/orange end, length and unavailable time. Open Review & Export; three missing targets must block download.
4. Set travel speed **5**, current **80**, voltage **20**, then **Apply parameters**. These are test inputs only, not welding recommendations. Observe the new revision and nominal time.
5. Add a three-point path with a clear turn, finish and rename it **Return pass**. Its inputs must initially be unset. Apply **10**, **110**, **24** respectively. Inspect the ordered points and turn diagnostic. Move it earlier, then select Root pass and verify its original parameters remain unchanged.
6. Enter `1e` or `0` as travel speed. Confirm the field error and disabled Apply/Review. Discard; the committed revision must be unchanged. Enter `5.0` and Apply; this equal numeric value must not create a revision.
7. Review sequence and totals, warnings, and unassessed robotics concerns. Download and inspect `analytic-plate.weld-job.v1.json`: source unit remains cm, bounds and path positions are millimetres, sequence IDs resolve exactly once, and no robot orientation/calibration is fabricated.
8. Start another draft with one point, then Review & Export. Confirm the exclusion notice and identical downloaded JSON. Close review and cancel the draft. Select and delete a seam; cancellation must retain it, confirmation must remove its sequence entry.
9. On a populated plan, attempt an invalid upload and cancel a valid replacement. The model and plan must remain. Confirm a valid replacement; the list, selection, draft and revision must reset. Optional development `?inspect=1` can inspect the renderer, but the planning workflow must also work without it and in production.
10. Repeat authoring on an unfamiliar curved part. Rotate to expose the intended surface and verify points there. Connecting chords may leave the surface; this is disclosed and remains for engineering assessment.

## Boundaries

No saved-session persistence: refresh/close loses the in-memory plan. JSON export is a weld-plan download, not a portable project restore feature. Surface authoring requires a pointing device; management forms, buttons and dialogs support keyboard navigation. Browser verification covers Chrome/Chromium on the reference Windows machine; remote Linux CI and other browser engines require their own evidence.

Point insertion/replacement, direction-reversal UI, undo/redo and geometry-linked diagnostic actions are deferred to Milestone 4. Manual drafts are recoverable only through Remove last/Cancel at this stage; committed deletion explicitly warns it cannot be undone. Automatic candidates, torch orientation, registration, IK, collision planning, simulation and deployment remain outside this milestone.

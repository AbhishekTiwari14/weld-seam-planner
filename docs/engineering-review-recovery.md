# Engineering review, warning navigation and project recovery

Milestone 5 enhances the engineering review workflow and implements reliable session recovery. Workpiece coordinate policies, Float64 double-precision arithmetic, domain contracts, and the v1 exported-job schema are preserved. There is no automatic seam detection or robot execution.

## Engineering review and geometry-linked navigation

Engineering review is accessible via **Review & Export** whenever committed seams exist. It presents structural validation, parameter completeness, geometry heuristics, and explicit downstream limitations before export.

### Finding grouping and sequence order

Findings from `validatePlanning(document, 'export')` are partitioned by target into ordered groups via `groupFindings`:
1. **Plan & workpiece**: Global structural rules, workpiece bounds, or plan-level constraints.
2. **Seams in sequence order**: Findings for individual seams follow the execution sequence defined in the plan.

Groups render as collapsible `<details>` elements (`finding-group`), open by default for documents with up to 100 findings. Each group summary displays the seam name and finding count.

### Actionable navigation and parameter correction

Review findings link directly to planning controls without mutating geometry:
- **Parameter errors**: Clicking a missing parameter finding (speed, current, voltage) closes the review dialog, selects that seam, and focuses the corresponding input field in the parameter editor.
- **Geometry warnings**: Clicking a warning row closes the review dialog, selects the seam, highlights the specific point or segment in both the inspector and 3D viewport, and opens **Ordered points & geometry**.
- **Change tracking**: When reviewing an edited revision, the dialog reports the number of previously reported findings that have been resolved (`N previously reported findings are no longer present at revision R`).
- **Readiness indicator**: A distinct status banner indicates whether the plan is valid for export or requires corrections before download.

### Viewport focus framing

When a seam, point, or segment is selected, the **Focus selection** button in the viewport header frames the target in view space:
- **Point target**: Focuses on the point with a practical minimum inspection radius (0.015 units in normalized view space) to prevent over-zooming.
- **Segment target**: Frames both endpoints of the segment.
- **Seam target**: Frames all points belonging to the seam.
- **Orientation preservation**: Camera position shifts along the existing sightline vector toward the selection centroid, preserving orbit angles and perspective while updating frustum clipping planes.

---

## Reliable project recovery

Plans live in browser memory during editing. Project recovery reconstructs the exact authoring state from the original STL model and a previously exported `.weld-job.v1.json` file without server storage or proprietary project files.

### Recovery workflow

1. Click **Restore Plan** in the topbar.
2. Select the original STL and the exported weld-job JSON file.
3. The system parses and validates the saved JSON plan before starting background processing.
4. The background worker parses the STL, computes its SHA-256 hash, and extracts geometry bounds.
5. Verification compares the imported model against saved workpiece provenance:
   - Exact SHA-256 digest match.
   - Exact source units (`mm`, `cm`, `m`, `in`).
   - Matching byte length, encoding (ASCII/binary), input triangles, and degenerate triangle counts.
   - Matching physical bounding box in millimetres.
6. The confirmation dialog displays the verified filename, seam count, saved revision, and locks the unit selection to the saved source unit.
7. Confirming restores the exact workpiece, document revision, seam IDs, point IDs, Float64 coordinates, parameters, and sequence.
8. History stacks reset to 0 (empty history for the restored session), and the save marker synchronizes to avoid showing unsaved changes.

### Preflight and bounds enforcement

To prevent memory exhaustion and schema violations before allocation:
- Plan JSON file size is capped at 16 MiB (`MAX_PLAN_FILE_BYTES`).
- STL file size is capped at 64 MiB (`IMPORT_SAFETY_LIMITS.bytes`).
- `preflight` verifies `schemaVersion === '1.0.0'` and enforces contract capacity limits: at most 100 seams, 1,000 points per seam, 10,000 total points, and 20,000 review warnings.
- `validateWeldJob` verifies full schema compliance, semantic rules, and derived warning tolerances.

### Geometry reuse and zero-clone activation

`activateRestoredPlan` verifies that the worker-prepared `MeshAsset` matches the plan's workpiece frame and bounding box. The restored asset reuses transferred typed arrays and BVH acceleration structures directly without cloning geometry buffers.

---

## Safety and transaction boundaries

Project recovery guarantees that failed, invalid, or cancelled restorations leave the active workspace untouched:
- **Malformed or mismatched files**: Corrupt JSON, schema violations, SHA-256 mismatches, or dimension mismatches produce error notifications and dismiss safely; the current model, draft, point candidates, and history remain unchanged.
- **Cancellation**: Cancelling at file selection, preview confirmation, or during background worker execution preserves the current workspace.
- **Unsaved changes warning**: If the current workspace has unsaved edits, the confirmation dialog explicitly warns that unexported changes will be replaced.
- **Drop isolation**: Window drag-and-drop file imports are ignored while any modal dialog or recovery flow is active.

---

## Manual acceptance procedure

1. **Setup**: Run `npm run dev` and open `http://localhost:5173`.
2. **Create and export a plan**: Import `fixtures/models/analytic-plate.stl` as `cm`. Create two seams (one with 3 points, one with 2 points). Configure welding parameters. Reverse one seam. Open **Review & Export** and download `analytic-plate.weld-job.v1.json`.
3. **Inspect review grouping**: In review, verify seams are listed in sequence order. Clear a parameter field, re-open review, and click the parameter error; verify review closes and focuses the empty field.
4. **Test warning navigation and focus**: Create a turn sharper than 45° or segment shorter than 1 mm. Open review, click the warning row, and verify that the point/segment is selected in the inspector and highlighted in the viewport. Click **Focus selection**; verify camera frames the geometry smoothly.
5. **Reload and restore**: Reload the page (`F5`). Click **Restore Plan**. Select `analytic-plate.stl` and the downloaded JSON.
6. **Verify confirmation dialog**: Confirm that the dialog displays the correct filename, 2 seams, matching revision, and locks the unit radio to `cm`.
7. **Confirm restoration**: Click **Confirm & restore plan**. Verify the statusbar reads `Restored analytic-plate.stl · 2 seams · revision R`. Verify that Undo/Redo buttons are disabled.
8. **Verify deterministic re-export**: Open **Review & Export** without making changes and download the job. Compare the new file with the original download: JSON contents must be byte-identical.
9. **Verify rejection and isolation**:
   - Attempt restoring with mismatched STL bytes or renamed different STL; verify SHA-256 rejection.
   - Attempt restoring with forged warnings or modified coordinates; verify validation rejection.
   - Cancel recovery; verify current workspace state is preserved.

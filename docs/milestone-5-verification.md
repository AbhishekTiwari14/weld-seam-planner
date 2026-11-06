# Milestone 5 verification

Verified locally on 6 November 2026 on `feat/engineering-review`. No push, merge, rebase, deployment or Milestone 6 work was performed. Remote GitHub Actions has not run for these commits; the existing workflow discovers the new tests and runs the required gates with zero CI or dependency configuration changes.

## Automated gates

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 131 packages, existing R3F patch applied, zero audit vulnerabilities |
| `npm run typecheck` | Passed under strict TypeScript configuration (`tsc --noEmit`) |
| `npm test` | **176 passed, 0 failed**, across 15 test files; all 156 previous tests retained |
| `npm run build` | Passed; 223 modules transformed, production assets bundled cleanly |
| `npm run test:browser` | **20 passed, 0 failed** in 5.2 minutes; all 16 previous tests plus four M5 recovery suites |
| `npm run test:production` | Passed against the built production preview server: surface authoring, point editing, undo/redo, parameter validation, sequence, review, exact JSON download, diagnostic exclusion, and end-to-end plan restoration with byte-identical re-export |
| `npm run schema:generate` and `git diff --exit-code -- schemas fixtures` | Passed; zero schema or fixture drift |

Known runtime notices remain visible: Vite emits chunk size warnings for the lazy viewport bundle. Three.js CommonJS deprecation warnings are emitted during Node test runs. Browser WebGL error handling logs expected fallback messages during the unavailable-WebGL test. None of these messages is suppressed.

## New coverage

### Unit tests

Unit test coverage expands from 156 to 176 tests across 15 suites:
1. **Saved plan parsing and preflight**: Rejection of malformed JSON, unsupported schema versions, oversized JSON strings (>16 MiB), empty files, array limit overflows (>100 seams, >1,000 points/seam, >10,000 total points, >20,000 review warnings), duplicate point IDs, out-of-bounds coordinates, missing parameters, sequence inconsistencies, forged review warnings, and invalid source frame axes.
2. **Provenance and unit verification**: Rejection of mismatched STL SHA-256 digests, byte lengths, encodings, input triangles, degenerate triangles, source units, and physical bounding box dimensions.
3. **Prepared asset activation**: Verification of metadata matching on the worker-prepared `MeshAsset`, verification of bounds and frame equality, and shallow asset header replacement without cloning typed arrays or BVH acceleration structures.
4. **Atomic controller lifecycle**: Preservation of active workspace, history stacks, and saved revision marker on failure or cancellation at every phase: file selection, JSON parse error, SHA mismatch, unit confirmation mismatch, user cancellation during processing, and ready-asset validation failure.
5. **Engineering review finding grouping**: Ordering findings by workpiece and seam sequence order, computing finding identities, handling empty findings, and handling unidentified group targets safely.
6. **Frustum focus framing**: Verifying `focusCamera` view-space centering, minimum radius clamping for points, distance preservation along current view direction, and projection of all target points within the camera frustum without mutating point coordinates.

### Browser acceptance tests

Four comprehensive Playwright suites exercise real WebGL, real worker communication, and production UI interactions:
1. **End-to-end plan recovery and editing**: Export a 2-seam warned plan on a recovery plate, reload the browser, stage recovery via file inputs, confirm restoration with locked `cm` source units, verify statusbar provenance, download the plan and verify byte-identical match to original export, perform surface point replacement, verify unsaved changes badge, and verify deterministic re-export advancing revision by 1 with preserved seam IDs and point IDs.
2. **Rejection, provenance mismatch, and cancellation safety**: Assert rejection of invalid JSON, unsupported versions, forged warnings, unit mismatches, byte length changes, hash mismatches, and oversized plans with appropriate user alerts; verify active geometry revision, staged point candidates, and history stacks remain unchanged throughout; verify user cancellation keeps candidate and document intact.
3. **Repeated restores and resource release**: Restore the same plan three consecutive times while draft seams and point candidates are active; assert transient editor state is cleared, undo/redo stacks are empty, and GPU geometry count stabilizes at expected baseline (7 geometries) without resource leaks.
4. **Review categories, navigation, focus framing, and keyboard accessibility**: Assert error, warning, and not-assessed counts; click missing travel speed error to focus the input field; update parameter and verify review dialog reports resolved finding notice; click geometry warning to inspect turn point; click **Focus selection** and verify camera movement without frame change; verify keyboard navigation (Enter, Tab, Escape) through review and restore dialogs.

### Production smoke test

`scripts/check-production.ts` builds the production bundle, launches a strict-port preview server, launches Chrome, authors two surface seams on an analytic plate in inches, executes point replacement with undo/redo, validates parameters and sequence, downloads the JSON plan, executes **Restore Plan** with the original STL and downloaded JSON, confirms restoration, asserts statusbar text and empty undo history, and re-downloads the plan to verify byte-identical export.

## Measured limits and performance

- **Plan file parsing and validation**: Parsing and validating a maximal 100-seam, 10,000-point plan completes synchronously in under 150 ms in Node and browser runtimes.
- **Worker digest and geometry transfer**: Background worker computes SHA-256 during STL streaming; asset activation reuses transferable buffers with zero geometry cloning.
- **GPU geometry lifecycle**: Restoring a plan resets transient overlays, stabilizes scene geometry count, and avoids GPU buffer accumulation.
- **Memory footprint**: Plan history starts empty (0 retained bytes) after recovery, conserving the 16 MiB history quota for subsequent user edits.

## Issues resolved during verification

- **Stray file cleanup**: Removed temporary untracked file `tatus --short` created by terminal input.
- **Defensive finding grouping**: `groupFindings` was enhanced to handle arbitrary or orphaned finding targets gracefully without throwing, ensuring all validator findings are visible.
- **Production smoke test coverage**: `check-production.ts` was extended to include end-to-end project restoration and deterministic re-export validation against the production bundle.
- **Documentation**: Completed full architectural specifications and verification reporting for Milestone 5.

/**
 * Standalone Downstream Consumer Example
 *
 * Demonstrates how an external system or robotic pipeline reads, validates,
 * and interprets an Armatrix weld-job JSON export using the production schema
 * and semantic validation engine.
 *
 * Usage:
 *   node examples/inspect-weld-job.ts [path/to/exported.weld-job.v1.json]
 *   npm run inspect:fixture
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateWeldJob } from '../src/export/job.ts';
import type { WeldJob } from '../src/export/schema.ts';

function distance(p1: [number, number, number], p2: [number, number, number]): number {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
}

export interface InspectOptions {
  quiet?: boolean;
}

export function inspectWeldJob(jsonPath: string, options: InspectOptions = {}): WeldJob {
  const fullPath = resolve(jsonPath);
  const log = options.quiet ? () => {} : console.log;

  log(`\n===============================================================`);
  log(`ARMATRIX WELD JOB INSPECTOR — DOWNSTREAM CONSUMER VERIFICATION`);
  log(`===============================================================`);
  log(`File: ${fullPath}`);

  let rawText: string;
  try {
    rawText = readFileSync(fullPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read file "${fullPath}": ${err instanceof Error ? err.message : String(err)}`);
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Malformed JSON input in "${fullPath}": ${err instanceof Error ? err.message : String(err)}`);
  }

  // Authoritative production validation: verifies Zod structural schema,
  // coordinate bounds, unique seam IDs, sequence permutations, complete positive
  // parameters, and heuristic review warning derivations.
  const job: WeldJob = validateWeldJob(rawJson);

  // 1. Job Identification
  log(`\n[1] JOB IDENTIFICATION`);
  log(`    Job ID:       ${job.jobId}`);
  log(`    Revision:     ${job.revision}`);
  log(`    Schema:       v${job.schemaVersion}`);
  log(`    Kind:         ${job.kind}`);

  // 2. Workpiece provenance
  const wp = job.workpiece;
  log(`\n[2] WORKPIECE PROVENANCE & COORDINATE SYSTEM`);
  log(`    Original STL: ${wp.source.filename} (${wp.source.byteLength.toLocaleString()} bytes, ${wp.source.encoding})`);
  log(`    SHA-256:      ${wp.source.sha256}`);
  log(`                  (Recorded provenance digest; does not verify local STL bytes unless the file is hashed independently.)`);
  log(`    Source Unit:  ${wp.source.unit} (normalized to mm in export)`);
  log(`    Triangles:    ${wp.source.inputTriangles.toLocaleString()} (${wp.source.omittedDegenerateTriangles} degenerate omitted)`);
  log(`    Frame Axes:   ${wp.frame.axes} (authoritative millimetres, ${wp.frame.handedness}-handed)`);
  log(`    Bounds (mm):  X [${wp.boundsMm.min[0]}, ${wp.boundsMm.max[0]}]`);
  log(`                  Y [${wp.boundsMm.min[1]}, ${wp.boundsMm.max[1]}]`);
  log(`                  Z [${wp.boundsMm.min[2]}, ${wp.boundsMm.max[2]}]`);

  // 3. Process Profile
  log(`\n[3] PROCESS PROFILE`);
  log(`    Profile:      ${job.processProfile}`);

  // 4. Seam Execution Sequence
  log(`\n[4] EXECUTION SEQUENCE (${job.sequence.length} seam${job.sequence.length === 1 ? '' : 's'})`);
  const seamMap = new Map<string, (typeof job.seams)[number]>();
  for (const seam of job.seams) {
    seamMap.set(seam.id, seam);
  }

  let totalPlannedLengthMm = 0;
  let totalNominalArcTimeS = 0;

  job.sequence.forEach((seamId, index) => {
    const seam = seamMap.get(seamId);
    if (!seam) {
      throw new Error(`Seam ID "${seamId}" in sequence is not defined in seams list.`);
    }

    const points = seam.geometry.points;
    let seamLengthMm = 0;
    for (let i = 0; i < points.length - 1; i++) {
      seamLengthMm += distance(points[i]!.positionMm, points[i + 1]!.positionMm);
    }
    const speed = seam.parameters.travelSpeedMmPerS;
    const nominalArcTime = speed > 0 ? seamLengthMm / speed : 0;
    totalPlannedLengthMm += seamLengthMm;
    totalNominalArcTimeS += nominalArcTime;

    log(`\n    [${index + 1}] SEAM: "${seam.name}" (ID: ${seam.id})`);
    log(`        Parameters:  Speed: ${speed} mm/s | Current: ${seam.parameters.currentTargetA} A | Voltage: ${seam.parameters.voltageTargetV} V`);
    log(`        Geometry:    ${points.length} points | Path length: ${seamLengthMm.toFixed(3)} mm | Nominal Arc-On: ${nominalArcTime.toFixed(1)} s`);
    log(`        Point List (Workpiece mm; display rounded to 3 decimals, IDs abbreviated):`);
    points.forEach((pt, pIdx) => {
      const isStart = pIdx === 0;
      const isEnd = pIdx === points.length - 1;
      const tag = isStart ? ' [START]' : isEnd ? ' [END]' : '';
      log(`          P${pIdx + 1} (${pt.id.slice(0, 8)}…): [${pt.positionMm.map((n) => n.toFixed(3).padStart(8)).join(', ')}]${tag}`);
    });
  });

  log(`\n[5] TOTAL METRICS`);
  log(`    Total Planned Length:   ${totalPlannedLengthMm.toFixed(3)} mm`);
  log(`    Total Nominal Arc-On:   ${totalNominalArcTimeS.toFixed(1)} s`);
  log(`    (Note: Nominal arc time = length ÷ speed; excludes approach, transfer & delays.)`);

  // 5. Engineering Review Warnings
  const warnings = job.review.warnings;
  log(`\n[6] ENGINEERING HEURISTIC WARNINGS (${warnings.length})`);
  if (warnings.length === 0) {
    log(`    None reported.`);
  } else {
    warnings.forEach((w, wIdx) => {
      if (w.code === 'SHORT_SEGMENT') {
        log(`    ${wIdx + 1}. [SHORT_SEGMENT] Seam: ${w.seamId.slice(0, 8)}… Segment: ${w.startPointId.slice(0, 8)}… -> ${w.endPointId.slice(0, 8)}… (${w.valueMm.toFixed(3)} mm < 1 mm threshold)`);
      } else if (w.code === 'TURN_ANGLE_HIGH') {
        log(`    ${wIdx + 1}. [TURN_ANGLE_HIGH] Seam: ${w.seamId.slice(0, 8)}… Point: ${w.pointId.slice(0, 8)}… (${w.valueDeg.toFixed(1)}° > 45° threshold)`);
      } else if (w.code === 'DEGENERATE_TRIANGLES_OMITTED') {
        log(`    ${wIdx + 1}. [DEGENERATE_TRIANGLES_OMITTED] ${w.count} collapsed triangle(s) omitted during mesh parsing`);
      }
    });
  }

  // 6. Explicit Downstream Limitations
  const notAssessed = job.review.notAssessed;
  log(`\n[7] DOWNSTREAM INTEGRATION NOTICE`);
  log(`    This document defines a WELD PLAN, not an executable robot trajectory.`);
  log(`    The following constraints remain downstream responsibilities:`);
  notAssessed.forEach((item) => {
    log(`    - ${item}`);
  });
  log(`\n===============================================================\n`);

  return job;
}

// Allow direct CLI execution
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const targetFile = process.argv[2] || resolve('fixtures/weld-job.v1.json');
  inspectWeldJob(targetFile);
}

/**
 * Standalone Downstream Consumer Example
 *
 * Demonstrates how an external system or robotic pipeline reads, validates,
 * and interprets an Armatrix weld-job JSON export.
 *
 * Usage:
 *   node examples/inspect-weld-job.ts [path/to/exported.weld-job.v1.json]
 *   npm run inspect:fixture
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Vec3Mm {
  0: number;
  1: number;
  2: number;
}

interface PathPoint {
  id: string;
  positionMm: [number, number, number];
}

interface WeldSeam {
  id: string;
  name: string;
  geometry: {
    type: string;
    points: PathPoint[];
  };
  parameters: {
    travelSpeedMmPerS: number;
    currentTargetA: number;
    voltageTargetV: number;
  };
}

interface WeldJobExport {
  schemaVersion: string;
  kind?: string;
  jobId: string;
  revision: number;
  workpiece: {
    id: string;
    source: {
      filename: string;
      sha256: string;
      unit: string;
      byteLength: number;
      inputTriangles: number;
      encoding?: string;
      omittedDegenerateTriangles?: number;
    };
    boundsMm: {
      min: [number, number, number];
      max: [number, number, number];
    };
    frame: {
      id?: string;
      axes: string;
      lengthUnit?: string;
      origin?: string;
      handedness?: string;
    };
  };
  processProfile: string | {
    id: string;
    name?: string;
  };
  seams: WeldSeam[];
  sequence: string[];
  review: {
    rulesetVersion?: string;
    warnings: Array<{
      code: string;
      seamId?: string;
      pointId?: string;
      startPointId?: string;
      endPointId?: string;
      valueMm?: number;
      valueDeg?: number;
      message?: string;
      severity?: string;
    }>;
    notAssessed?: string[];
  };
  limitations?: {
    notAssessed?: string[];
  };
}

function distance(p1: [number, number, number], p2: [number, number, number]): number {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
}

export function inspectWeldJob(jsonPath: string): void {
  const fullPath = resolve(jsonPath);
  console.log(`\n===============================================================`);
  console.log(`ARMATRIX WELD JOB INSPECTOR — DOWNSTREAM CONSUMER VERIFICATION`);
  console.log(`===============================================================`);
  console.log(`File: ${fullPath}`);

  const rawText = readFileSync(fullPath, 'utf8');
  const job = JSON.parse(rawText) as WeldJobExport;

  // 1. Basic schema verification
  if (job.schemaVersion !== '1.0.0') {
    throw new Error(`Unsupported schema version "${job.schemaVersion}". Expected "1.0.0".`);
  }
  if (!job.jobId || typeof job.revision !== 'number') {
    throw new Error('Missing job identification or revision.');
  }

  console.log(`\n[1] JOB IDENTIFICATION`);
  console.log(`    Job ID:       ${job.jobId}`);
  console.log(`    Revision:     ${job.revision}`);
  console.log(`    Schema:       v${job.schemaVersion}`);

  // 2. Workpiece provenance
  const wp = job.workpiece;
  console.log(`\n[2] WORKPIECE PROVENANCE & COORDINATE SYSTEM`);
  console.log(`    Original STL: ${wp.source.filename} (${wp.source.byteLength.toLocaleString()} bytes)`);
  console.log(`    SHA-256:      ${wp.source.sha256}`);
  console.log(`    Source Unit:  ${wp.source.unit}`);
  console.log(`    Triangles:    ${wp.source.inputTriangles.toLocaleString()}`);
  console.log(`    Frame Axes:   ${wp.frame.axes} (authoritative millimetres)`);
  console.log(`    Bounds (mm):  X [${wp.boundsMm.min[0]}, ${wp.boundsMm.max[0]}]`);
  console.log(`                  Y [${wp.boundsMm.min[1]}, ${wp.boundsMm.max[1]}]`);
  console.log(`                  Z [${wp.boundsMm.min[2]}, ${wp.boundsMm.max[2]}]`);

  // 3. Process Profile
  console.log(`\n[3] PROCESS PROFILE`);
  const profileStr = typeof job.processProfile === 'string'
    ? job.processProfile
    : `${job.processProfile.name || 'Generic Profile'} (ID: ${job.processProfile.id})`;
  console.log(`    Profile:      ${profileStr}`);

  // 4. Seam Execution Sequence
  console.log(`\n[4] EXECUTION SEQUENCE (${job.sequence.length} seam${job.sequence.length === 1 ? '' : 's'})`);
  const seamMap = new Map<string, WeldSeam>();
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

    console.log(`\n    [${index + 1}] SEAM: "${seam.name}" (ID: ${seam.id})`);
    console.log(`        Parameters:  Speed: ${speed} mm/s | Current: ${seam.parameters.currentTargetA} A | Voltage: ${seam.parameters.voltageTargetV} V`);
    console.log(`        Geometry:    ${points.length} points | Path length: ${seamLengthMm.toFixed(3)} mm | Nominal Arc-On: ${nominalArcTime.toFixed(1)} s`);
    console.log(`        Point List (Workpiece mm):`);
    points.forEach((pt, pIdx) => {
      const isStart = pIdx === 0;
      const isEnd = pIdx === points.length - 1;
      const tag = isStart ? ' [START]' : isEnd ? ' [END]' : '';
      console.log(`          P${pIdx + 1} (${pt.id.slice(0, 8)}…): [${pt.positionMm.map((n) => n.toFixed(3).padStart(8)).join(', ')}]${tag}`);
    });
  });

  console.log(`\n[5] TOTAL METRICS`);
  console.log(`    Total Planned Length:   ${totalPlannedLengthMm.toFixed(3)} mm`);
  console.log(`    Total Nominal Arc-On:   ${totalNominalArcTimeS.toFixed(1)} s`);
  console.log(`    (Note: Nominal arc time = length ÷ speed; excludes approach, transfer & delays.)`);

  // 5. Engineering Review Warnings
  const warnings = job.review?.warnings ?? [];
  console.log(`\n[6] ENGINEERING HEURISTIC WARNINGS (${warnings.length})`);
  if (warnings.length === 0) {
    console.log(`    None reported.`);
  } else {
    warnings.forEach((w, wIdx) => {
      const val = w.valueMm != null ? ` (${w.valueMm} mm)` : w.valueDeg != null ? ` (${w.valueDeg}°)` : '';
      console.log(`    ${wIdx + 1}. [${w.code}]${val} ${w.message || ''}`);
    });
  }

  // 6. Explicit Downstream Limitations
  const notAssessed = job.review?.notAssessed ?? job.limitations?.notAssessed ?? [];
  console.log(`\n[7] DOWNSTREAM INTEGRATION NOTICE`);
  console.log(`    This document defines a WELD PLAN, not an executable robot trajectory.`);
  console.log(`    The following constraints remain downstream responsibilities:`);
  notAssessed.forEach((item) => {
    console.log(`    - ${item}`);
  });
  console.log(`\n===============================================================\n`);
}

// Allow direct execution
const targetFile = process.argv[2] || resolve('fixtures/weld-job.v1.json');
inspectWeldJob(targetFile);

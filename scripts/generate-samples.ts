import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Vec3 = [number, number, number];
interface Triangle {
  normal: Vec3;
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function makeTriangle(v0: Vec3, v1: Vec3, v2: Vec3): Triangle {
  const n = normalize(cross(sub(v1, v0), sub(v2, v0)));
  return { normal: n, v0, v1, v2 };
}

function makeQuad(v0: Vec3, v1: Vec3, v2: Vec3, v3: Vec3): Triangle[] {
  // v0, v1, v2, v3 in CCW order when viewed from outside
  return [
    makeTriangle(v0, v1, v2),
    makeTriangle(v0, v2, v3),
  ];
}

function makeBox(
  minX: number, maxX: number,
  minY: number, maxY: number,
  minZ: number, maxZ: number,
): Triangle[] {
  const p000: Vec3 = [minX, minY, minZ];
  const p100: Vec3 = [maxX, minY, minZ];
  const p110: Vec3 = [maxX, maxY, minZ];
  const p010: Vec3 = [minX, maxY, minZ];
  const p001: Vec3 = [minX, minY, maxZ];
  const p101: Vec3 = [maxX, minY, maxZ];
  const p111: Vec3 = [maxX, maxY, maxZ];
  const p011: Vec3 = [minX, maxY, maxZ];

  return [
    // Bottom (-Z)
    ...makeQuad(p000, p010, p110, p100),
    // Top (+Z)
    ...makeQuad(p001, p101, p111, p011),
    // Front (-Y)
    ...makeQuad(p000, p100, p101, p001),
    // Back (+Y)
    ...makeQuad(p010, p011, p111, p110),
    // Left (-X)
    ...makeQuad(p000, p001, p011, p010),
    // Right (+X)
    ...makeQuad(p100, p110, p111, p101),
  ];
}

function buildBinaryStl(header: string, triangles: Triangle[]): Buffer {
  const count = triangles.length;
  const buffer = Buffer.alloc(84 + 50 * count);
  buffer.write(header.slice(0, 80), 0, 'utf8');
  buffer.writeUInt32LE(count, 80);

  let offset = 84;
  for (const tri of triangles) {
    buffer.writeFloatLE(tri.normal[0], offset);
    buffer.writeFloatLE(tri.normal[1], offset + 4);
    buffer.writeFloatLE(tri.normal[2], offset + 8);

    buffer.writeFloatLE(tri.v0[0], offset + 12);
    buffer.writeFloatLE(tri.v0[1], offset + 16);
    buffer.writeFloatLE(tri.v0[2], offset + 20);

    buffer.writeFloatLE(tri.v1[0], offset + 24);
    buffer.writeFloatLE(tri.v1[1], offset + 28);
    buffer.writeFloatLE(tri.v1[2], offset + 32);

    buffer.writeFloatLE(tri.v2[0], offset + 36);
    buffer.writeFloatLE(tri.v2[1], offset + 40);
    buffer.writeFloatLE(tri.v2[2], offset + 44);

    buffer.writeUInt16LE(0, offset + 48);
    offset += 50;
  }

  return buffer;
}

// 1. T-joint Assembly (120 x 150 x 80 mm)
export function generateTJoint(): Buffer {
  const triangles: Triangle[] = [
    // Base plate: 120 x 150 x 10 mm
    ...makeBox(-60, 60, -75, 75, 0, 10),
    // Vertical web plate: 10 x 130 x 70 mm (Z from 10 to 80)
    ...makeBox(-5, 5, -65, 65, 10, 80),
  ];
  return buildBinaryStl('Armatrix Sample: T-Joint Assembly (mm)', triangles);
}

// 2. Gusset Bracket Assembly (100 x 120 x 120 mm)
export function generateGussetBracket(): Buffer {
  const triangles: Triangle[] = [
    // Vertical backplate: 100 x 15 x 120 mm (Y from -15 to 0, Z from 0 to 120)
    ...makeBox(-50, 50, -15, 0, 0, 120),
    // Horizontal base flange: 100 x 105 x 15 mm (Y from 0 to 105, Z from 0 to 15)
    ...makeBox(-50, 50, 0, 105, 0, 15),
  ];

  // Triangular gusset rib centered at X: [-5, 5]
  // In Y-Z plane, right triangle with vertices at:
  // pA: (Y=0, Z=15) - inside corner
  // pB: (Y=90, Z=15) - along bottom flange
  // pC: (Y=0, Z=105) - along back plate
  const x0 = -5;
  const x1 = 5;
  const A0: Vec3 = [x0, 0, 15];
  const B0: Vec3 = [x0, 90, 15];
  const C0: Vec3 = [x0, 0, 105];

  const A1: Vec3 = [x1, 0, 15];
  const B1: Vec3 = [x1, 90, 15];
  const C1: Vec3 = [x1, 0, 105];

  // Side face at x0 (normal points in -X)
  triangles.push(makeTriangle(A0, C0, B0));
  // Side face at x1 (normal points in +X)
  triangles.push(makeTriangle(A1, B1, C1));
  // Bottom face Z = 15 (normal points in -Z)
  triangles.push(...makeQuad(A0, B0, B1, A1));
  // Back face Y = 0 (normal points in -Y)
  triangles.push(...makeQuad(A0, A1, C1, C0));
  // Diagonal top face (hypotenuse from C to B)
  triangles.push(...makeQuad(B0, C0, C1, B1));

  return buildBinaryStl('Armatrix Sample: Gusset Bracket Assembly (mm)', triangles);
}

// 3. Pipe-on-Plate Assembly (150 x 150 x 90 mm)
export function generatePipeOnPlate(): Buffer {
  const triangles: Triangle[] = [
    // Base plate: 150 x 150 x 15 mm
    ...makeBox(-75, 75, -75, 75, 0, 15),
  ];

  // Hollow pipe standing from Z=15 to Z=90
  const z0 = 15;
  const z1 = 90;
  const rOut = 35;
  const rIn = 25;
  const segments = 36;

  for (let i = 0; i < segments; i++) {
    const th0 = (i / segments) * Math.PI * 2;
    const th1 = ((i + 1) / segments) * Math.PI * 2;

    const cos0 = Math.cos(th0), sin0 = Math.sin(th0);
    const cos1 = Math.cos(th1), sin1 = Math.sin(th1);

    // Outer wall points
    const out0_bot: Vec3 = [rOut * cos0, rOut * sin0, z0];
    const out1_bot: Vec3 = [rOut * cos1, rOut * sin1, z0];
    const out1_top: Vec3 = [rOut * cos1, rOut * sin1, z1];
    const out0_top: Vec3 = [rOut * cos0, rOut * sin0, z1];

    // Inner wall points
    const in0_bot: Vec3 = [rIn * cos0, rIn * sin0, z0];
    const in1_bot: Vec3 = [rIn * cos1, rIn * sin1, z0];
    const in1_top: Vec3 = [rIn * cos1, rIn * sin1, z1];
    const in0_top: Vec3 = [rIn * cos0, rIn * sin0, z1];

    // Outer cylindrical surface (normals face outwards)
    triangles.push(...makeQuad(out0_bot, out1_bot, out1_top, out0_top));

    // Inner cylindrical surface (normals face inwards)
    triangles.push(...makeQuad(in0_bot, in0_top, in1_top, in1_bot));

    // Top annular lip (Z = z1, normals face +Z)
    triangles.push(...makeQuad(out0_top, out1_top, in1_top, in0_top));

    // Bottom annular lip (Z = z0, normals face -Z)
    triangles.push(...makeQuad(out0_bot, in0_bot, in1_bot, out1_bot));
  }

  return buildBinaryStl('Armatrix Sample: Pipe-on-Plate Assembly (mm)', triangles);
}

async function main() {
  const outDir = resolve('public/samples');
  await mkdir(outDir, { recursive: true });

  const tJoint = generateTJoint();
  await writeFile(resolve(outDir, 't-joint.stl'), tJoint);
  console.log(`Generated t-joint.stl (${tJoint.byteLength} bytes)`);

  const gusset = generateGussetBracket();
  await writeFile(resolve(outDir, 'gusset-bracket.stl'), gusset);
  console.log(`Generated gusset-bracket.stl (${gusset.byteLength} bytes)`);

  const pipe = generatePipeOnPlate();
  await writeFile(resolve(outDir, 'pipe-on-plate.stl'), pipe);
  console.log(`Generated pipe-on-plate.stl (${pipe.byteLength} bytes)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/generate-samples.ts')) {
  await main();
}

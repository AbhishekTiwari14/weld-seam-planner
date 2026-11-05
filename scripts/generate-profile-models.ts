import { mkdir, writeFile } from 'node:fs/promises';
import { asciiStl } from '../tests/helpers/stl.ts';

await mkdir('.local/models', { recursive: true });
for (const columns of [500, 750]) {
  const rows = 500;
  const count = rows * columns * 2;
  const buffer = new ArrayBuffer(84 + 50 * count);
  new Uint8Array(buffer).set(new TextEncoder().encode('solid authored curved performance fixture'));
  const data = new DataView(buffer);
  data.setUint32(80, count, true);
  function point(x: number, y: number) {
    const theta = x / columns * Math.PI * 2;
    const phi = 0.1 + y / rows * (Math.PI - 0.2);
    return [100 * Math.sin(phi) * Math.cos(theta), 100 * Math.sin(phi) * Math.sin(theta), 100 * Math.cos(phi)];
  }
  let offset = 84;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = point(column, row), b = point(column + 1, row), c = point(column, row + 1), d = point(column + 1, row + 1);
    for (const triangle of [[a, b, c], [b, d, c]]) {
      triangle.flat().forEach((value, index) => data.setFloat32(offset + 12 + index * 4, value, true));
      offset += 50;
    }
  }
  await writeFile(`.local/models/curved-${count}.stl`, new Uint8Array(buffer));
  console.log({ count, bytes: buffer.byteLength });
}
// Exactly 50 MiB of valid ASCII with 250,000 triangles; trailing whitespace is legal.
const facets: string[] = [];
for (let i = 0; i < 250_000; i++) {
  const x = i % 500, y = Math.floor(i / 500);
  facets.push(asciiStl([[[x, y, 0], [x + 0.9, y, 0], [x, y + 0.9, 0]]]).split('\n').slice(1, -2).join('\n'));
}
const text = `solid envelope\n${facets.join('\n')}\nendsolid envelope\n`;
const ascii = Buffer.alloc(50 * 1024 ** 2, 32);
ascii.write(text);
await writeFile('.local/models/ascii-50mib.stl', ascii);
console.log({ asciiTriangles: 250_000, bytes: ascii.length });

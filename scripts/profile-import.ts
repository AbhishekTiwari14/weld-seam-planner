import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { parseStl } from '../src/import/parse-stl.ts';
import { prepareAsset } from '../src/import/prepare-asset.ts';

const results = [];
for (const name of (await readdir('.local/models')).filter((name) => /stl$/i.test(name))) {
  global.gc?.();
  const file = await readFile(`.local/models/${name}`);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const start = performance.now();
  try {
    const parsed = parseStl(buffer);
    const parseMs = performance.now() - start;
    const afterParse = process.memoryUsage();
    const asset = prepareAsset(parsed, { filename: name, byteLength: file.length, sha256: '0'.repeat(64),
      encoding: parsed.encoding, inputTriangles: parsed.inputTriangles, omittedDegenerateTriangles: parsed.omittedDegenerateTriangles,
      bounds: parsed.bounds, warnings: [], parseMs }, 'mm');
    const result = { name, bytes: file.length, triangles: parsed.inputTriangles, omitted: parsed.omittedDegenerateTriangles,
      timings: asset.timings, afterParse, afterPrepare: process.memoryUsage(), displayErrorMm: asset.maxDisplayErrorMm };
    results.push(result); console.log(JSON.stringify(result));
  } catch (error) { const result = { name, error: String(error) }; results.push(result); console.log(JSON.stringify(result)); }
}
await mkdir('.local/evidence', { recursive: true });
await writeFile('.local/evidence/import-profile.json', JSON.stringify(results, null, 2));

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Local holdouts, deliberately not redistributed with the application or repository.
const names = ['ascii/slotted_disk.stl', 'binary/pr2_head_pan.stl', 'binary/pr2_head_tilt.stl', 'binary/colored.stl'];
const sources = names.map((name) => `https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/models/stl/${name}`);
const revision = '6c158cce226500fc64b12acd265af0cf01d1c212';
for (const name of ['counter.unitsmm.STL', 'torus.STL', 'busted.STL', 'multibody.stl']) {
  sources.push(`https://raw.githubusercontent.com/mikedh/trimesh/${revision}/models/${name}`);
}
await mkdir('.local/models', { recursive: true });
const records = [];
for (const url of sources) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const filename = url.split('/').at(-1)!;
  await writeFile(`.local/models/${filename}`, bytes);
  records.push({ filename, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile('.local/models/provenance.json', JSON.stringify(records, null, 2) + '\n');
console.log(JSON.stringify(records, null, 2));

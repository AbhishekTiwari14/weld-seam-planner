import { createImportController, type ImportPort } from '../../src/import/store.ts';
import { parseStl } from '../../src/import/parse-stl.ts';
import { prepareAsset } from '../../src/import/prepare-asset.ts';
import type { WorkerResponse, ImportPreview } from '../../src/import/types.ts';
import { analyticTriangles, asciiStl } from './stl.ts';

export function controllerHarness() {
  const receivers: ((message: WorkerResponse) => void)[] = [];
  const controller = createImportController((): ImportPort => ({ send() {}, stop() {}, listen(receive) { receivers.push(receive); } }));
  const file = new File([asciiStl(analyticTriangles)], 'plate.stl');
  function importModel() {
    const buffer = new TextEncoder().encode(asciiStl(analyticTriangles)).buffer;
    const parsed = parseStl(buffer);
    const preview: ImportPreview = { filename: file.name, byteLength: buffer.byteLength, sha256: 'a'.repeat(64),
      encoding: 'ascii', inputTriangles: 2, omittedDegenerateTriangles: 0, warnings: [], bounds: parsed.bounds, parseMs: 0 };
    const asset = prepareAsset(parsed, preview, 'mm');
    controller.start(file); const receive = receivers.at(-1)!;
    receive({ type: 'preview', preview }); controller.confirm('mm'); receive({ type: 'ready', asset });
    return asset;
  }
  const asset = importModel();
  return { controller, asset, file, receivers, importModel,
    document: () => controller.store.getState().active!.document };
}

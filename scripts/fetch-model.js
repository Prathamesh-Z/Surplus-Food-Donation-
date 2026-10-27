// Downloads the MobileNet weights used by on-device food detection into
// client/public/models/mobilenet/ (they are binary, ~14 MB, and are kept
// out of the text snapshot of this repo). Run once:  npm run fetch-model
// Without it, the Detect feature falls back to loading the same weights
// from the TensorFlow.js CDN on first use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, '../client/public/models/mobilenet');
const BASE = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224';
const FILES = ['model.json', 'group1-shard1of4', 'group1-shard2of4', 'group1-shard3of4', 'group1-shard4of4'];

fs.mkdirSync(dest, { recursive: true });
for (const f of FILES) {
  const target = path.join(dest, f);
  if (fs.existsSync(target) && fs.statSync(target).size > 1000) {
    console.log('exists:', f);
    continue;
  }
  console.log('downloading:', f);
  const res = await fetch(`${BASE}/${f}`);
  if (!res.ok) throw new Error(`Failed ${f}: HTTP ${res.status}`);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}
console.log('Model weights ready in client/public/models/mobilenet/');

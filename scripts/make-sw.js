import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildServiceWorker } from './sw-template.js';

const root = new URL('../dist/', import.meta.url);
async function walk(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await walk(new URL(entry.name + '/', dir), path + '/'));
    else if (entry.name !== 'sw.js') files.push(path);
  }
  return files.sort();
}
const files = await walk(root);
const hash = createHash('sha256');
for (const path of files) hash.update(path).update(await readFile(new URL(path, root)));
const revision = hash.digest('hex').slice(0, 16);
await writeFile(new URL('sw.js', root), buildServiceWorker(files, revision));
console.log(`Offline cache: ${files.length} files, revision ${revision}`);

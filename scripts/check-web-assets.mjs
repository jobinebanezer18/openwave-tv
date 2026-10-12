import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.argv[2] || 'dist-web';
const maxBytes = 25 * 1024 * 1024;
const oversized = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      const { size } = await stat(path);
      if (size > maxBytes) oversized.push({ path: relative(root, path), size });
    }
  }
}
try {
  await walk(root);
} catch (error) {
  console.error(`Cannot inspect web output at ${root}: ${error.message}`);
  process.exit(1);
}
if (oversized.length) {
  for (const file of oversized) console.error(`${file.path}: ${(file.size / 1024 / 1024).toFixed(2)} MiB exceeds 25 MiB`);
  process.exit(1);
}
console.log(`All files in ${root} are at or below 25 MiB.`);

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { decodePackage } from './pack.mjs';

// Recover editable sources outside the public repository, using stdin for the password.
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node scripts/unpack.mjs <new-directory>');
const root = path.resolve(destination);
await fs.mkdir(root); // Refuse to overwrite an existing folder.
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  const files = await decodePackage(await fs.readFile(new URL('../public/content.bin', import.meta.url)), password);
  for (const [name, body] of Object.entries(files)) {
    const target = path.resolve(root, ...name.split('/'));
    if (!target.startsWith(root + path.sep)) throw new Error('Unsafe package path');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(body, 'base64'), { flag: 'wx' });
  }
  console.error('Editable sources recovered. Keep them outside the public repository.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

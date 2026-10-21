import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

test('deployment contains only the password gate and encrypted content', async () => {
  const folder = new URL('../public/', import.meta.url);
  const files = await readdir(folder, { withFileTypes: true });
  assert(files.every(file => file.isFile()), 'Plain content directories must stay out of the public repository');
  assert.deepEqual(files.map(file => file.name).sort(), ['.nojekyll', '404.html', 'content.bin', 'index.html', 'robots.txt', 'sw.js', 'unlock.css', 'unlock.js']);
  const encrypted = await readFile(new URL('content.bin', folder));
  assert.equal(encrypted.subarray(0, 8).toString(), 'DBGLRY01');
  assert(encrypted.length > 52);
});

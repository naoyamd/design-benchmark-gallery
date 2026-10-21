import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('entry pages and authentication messages are English-only', async () => {
  for (const name of ['index.html', '404.html', 'unlock.js', 'sw.js']) {
    const source = await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
    assert(!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(source), `${name} contains Japanese text`);
    if (name.endsWith('.html')) assert.match(source, /<html lang="en">/);
  }
});

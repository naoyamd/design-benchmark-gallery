import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadWorker(files) {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const self = {
    registration: { scope: 'https://gallery.example.test/' },
    addEventListener() {},
    skipWaiting() {},
    clients: { claim() {}, matchAll: async () => [] }
  };
  const context = {
    self,
    URL,
    TextEncoder,
    Response,
    Blob,
    DecompressionStream,
    atob,
    fetch: async () => { throw new Error('unexpected network request'); },
    crypto,
    console
  };
  const encoded = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes).toString('base64')]));
  vm.runInNewContext(`${source}\nconst __testFiles = ${JSON.stringify(encoded)}; restore = async () => __testFiles; globalThis.__serve = serve; globalThis.__setRestore = value => { restore = value; };`, context);
  return context;
}

test('serves nested .mjs files as JavaScript with exact binary content', async () => {
  const bytes = Buffer.from([0, 1, 2, 127, 128, 255]);
  const context = await loadWorker({ 'sites/RLG-003_Astra_Luna_r02/core.mjs': bytes });
  const request = { mode: 'same-origin', method: 'GET' };
  const url = new URL('https://gallery.example.test/sites/RLG-003_Astra_Luna_r02/core.mjs');
  const response = await context.__serve(request, url, 'sites/RLG-003_Astra_Luna_r02/core.mjs');

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/javascript; charset=utf-8');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...bytes]);
});

test('keeps unauthenticated nested navigation redirect and asset 401 behavior', async () => {
  const context = await loadWorker({});
  context.__setRestore(async () => null);
  const url = new URL('https://gallery.example.test/sites/RLG-003_Astra_Luna_r02/');
  const navigation = await context.__serve({ mode: 'navigate', method: 'GET' }, url, 'sites/RLG-003_Astra_Luna_r02/');
  assert.equal(navigation.status, 302);
  assert.equal(navigation.headers.get('location'), 'https://gallery.example.test/?next=%2Fsites%2FRLG-003_Astra_Luna_r02%2F');

  const asset = await context.__serve({ mode: 'same-origin', method: 'GET' }, new URL('https://gallery.example.test/sites/RLG-003_Astra_Luna_r02/core.mjs'), 'sites/RLG-003_Astra_Luna_r02/core.mjs');
  assert.equal(asset.status, 401);
  assert.equal(await asset.text(), 'Password required');
});

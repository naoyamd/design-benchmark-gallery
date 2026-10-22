'use strict';

const SCOPE = new URL(self.registration.scope);
const MAGIC = new TextEncoder().encode('DBGLRY01');
const PUBLIC_FILES = new Set(['unlock.js', 'unlock.css', 'sw.js', 'content.bin', 'robots.txt', '.nojekyll']);
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', csv: 'text/csv; charset=utf-8', md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', pdf: 'application/pdf' };
let content = null;
let restoring = null;
let expiresAt = 0;

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`benchmark-gallery:${SCOPE.pathname}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('auth');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function session(action, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('auth', action === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('auth');
      const request = action === 'get' ? store.get('session') : action === 'put' ? store.put(value, 'session') : store.delete('session');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Session unavailable'));
    });
  } finally { db.close(); }
}

async function bundle() {
  const response = await fetch(new URL('content.bin', SCOPE), { cache: 'no-cache' });
  if (!response.ok) throw new Error('NETWORK');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 52 || !MAGIC.every((byte, index) => bytes[index] === byte)) throw new Error('FORMAT');
  return { salt: bytes.slice(8, 24), iv: bytes.slice(24, 36), encrypted: bytes.slice(36) };
}

async function decrypt(data, key) {
  const compressed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.iv, additionalData: MAGIC }, key, data.encrypted);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const files = JSON.parse(await new Response(stream).text());
  if (!files['index.html']) throw new Error('FORMAT');
  return files;
}

async function clearSession() {
  content = null;
  expiresAt = 0;
  await session('delete');
}

async function restore(refresh = false) {
  if (!refresh && content && expiresAt > Date.now()) return content;
  if (restoring) return restoring;
  restoring = (async () => {
    const saved = await session('get');
    if (!saved || saved.expiresAt <= Date.now()) { await clearSession(); return null; }
    try {
      content = await decrypt(await bundle(), saved.key);
      expiresAt = saved.expiresAt;
      return content;
    } catch (error) {
      if (error.name !== 'OperationError') throw error;
      await clearSession();
      return null;
    }
  })();
  try { return await restoring; } finally { restoring = null; }
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('message', event => {
  if (!event.source?.url?.startsWith(SCOPE.href)) return;
  const reply = result => event.ports[0]?.postMessage(result);
  event.waitUntil((async () => {
    try {
      if (event.data?.type === 'lock') {
        await clearSession();
        reply({ ok: true });
        for (const client of await self.clients.matchAll({ type: 'window' })) {
          if (client.url.startsWith(SCOPE.href)) await client.navigate(SCOPE.href);
        }
      } else if (event.data?.type === 'unlock') {
        const data = await bundle();
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(event.data.password), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: data.salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const files = await decrypt(data, key);
        const expiry = Date.now() + 12 * 60 * 60 * 1000;
        await session('put', { key, expiresAt: expiry });
        content = files;
        expiresAt = expiry;
        reply({ ok: true });
      }
    } catch (error) {
      reply({ ok: false, message: error.name === 'OperationError' ? 'Incorrect password. Please try again.' : 'Unable to load the gallery. Check your connection and try a regular Chrome or Edge window.' });
    }
  })());
});

async function serve(request, url, relative) {
  const files = await restore(request.mode === 'navigate');
  if (!files) {
    if (relative === '' || relative === 'index.html') return fetch(new URL('index.html', SCOPE), { cache: 'no-store' });
    if (request.mode === 'navigate') {
      const target = new URL(SCOPE);
      target.searchParams.set('next', url.pathname + url.search);
      return Response.redirect(target.href, 302);
    }
    return new Response('Password required', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  let path;
  try { path = decodeURIComponent(relative); } catch { return new Response('Invalid path', { status: 400 }); }
  if (files[path + '/index.html']) {
    url.pathname += '/';
    return Response.redirect(url.href, 308);
  }
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const encoded = files[path];
  if (typeof encoded !== 'string') return new Response('Not found', { status: 404 });
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
    'Content-Type': path.endsWith('/LICENSE') ? 'text/plain; charset=utf-8' : TYPES[path.split('.').pop()] || 'application/octet-stream',
    'Content-Length': String(bytes.length),
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  } });
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname) || !['GET', 'HEAD'].includes(event.request.method)) return;
  const relative = url.pathname.slice(SCOPE.pathname.length);
  if (PUBLIC_FILES.has(relative)) return;
  event.respondWith(serve(event.request, url, relative).catch(() => new Response('Unable to load gallery. Please check your connection and reload.', { status: 503, headers: { 'Cache-Control': 'no-store' } })));
});

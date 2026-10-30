import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

test('deployment contains only the password gate, public share cover, and encrypted content', async () => {
  const folder = new URL('../public/', import.meta.url);
  const files = await readdir(folder, { withFileTypes: true });
  assert(files.every(file => file.isFile()), 'Plain content directories must stay out of the public repository');
  assert.deepEqual(files.map(file => file.name).sort(), ['.nojekyll', '404.html', 'content.bin', 'index.html', 'ogp-intake-camp-2026.png', 'robots.txt', 'sw.js', 'unlock.css', 'unlock.js']);
  const encrypted = await readFile(new URL('content.bin', folder));
  assert.equal(encrypted.subarray(0, 8).toString(), 'DBGLRY01');
  assert(encrypted.length > 52);
});

test('social preview metadata is present before login and matches the public PNG',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const property=name=>html.match(new RegExp(`<meta property="${name}" content="([^"]+)"`))?.[1];
  assert.equal(property('og:type'),'website');
  assert.equal(property('og:url'),'https://intake.nightly.dedyn.io/');
  assert.match(property('og:title'),/INTAKE Camp 2026/);
  assert.match(property('og:description'),/practical AI skills/);
  assert.equal(property('og:image'),'https://intake.nightly.dedyn.io/ogp-intake-camp-2026.png');
  assert(property('og:image:alt'));
  assert.match(html,/<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/);
  const png=await readFile(new URL('../public/ogp-intake-camp-2026.png',import.meta.url));
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(property('og:image:width'),String(png.readUInt32BE(16)));
  assert.equal(property('og:image:height'),String(png.readUInt32BE(20)));
  const robots=await readFile(new URL('../public/robots.txt',import.meta.url),'utf8');
  assert.match(robots,/Allow: \/\$/);
  assert.match(robots,/Allow: \/ogp-intake-camp-2026\.png\$/);
  assert.match(robots,/Disallow: \//);
});

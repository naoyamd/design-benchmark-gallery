import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('custom-domain deep links return to the root login and preserve the requested page', async () => {
  const html = await readFile(new URL('../public/404.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let redirect;
  const location = {
    origin: 'https://intake.nightly.dedyn.io',
    pathname: '/sites/FLG-002_r01/',
    search: '?view=section',
    replace: value => { redirect = new URL(value); }
  };
  vm.runInNewContext(script, { URL, location });
  assert.equal(redirect.origin, location.origin);
  assert.equal(redirect.pathname, '/');
  assert.equal(redirect.searchParams.get('next'), '/sites/FLG-002_r01/?view=section');
});

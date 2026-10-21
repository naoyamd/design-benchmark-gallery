import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { decodePackage, encodePackage, MAGIC, validateRelativePath, writePackage } from '../scripts/pack.mjs';

const PASSWORD = 'correct horse battery staple';

async function withFixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-gallery-pack-'));
  const source = path.join(root, 'source');
  await fs.mkdir(path.join(source, 'nested'), { recursive: true });
  await fs.writeFile(path.join(source, 'readme.txt'), 'こんにちは 🌈\n', 'utf8');
  await fs.writeFile(path.join(source, 'nested', 'data.bin'), Buffer.from([0, 1, 2, 127, 128, 255]));
  try {
    await run(source);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('round-trips binary and Japanese files', async () => {
  await withFixture(async (source) => {
    const packed = await encodePackage(source, PASSWORD);
    assert.equal(packed.subarray(0, MAGIC.length).toString('ascii'), 'DBGLRY01');
    const entries = await decodePackage(packed, PASSWORD);
    assert.deepEqual(Object.keys(entries), ['nested/data.bin', 'readme.txt']);
    assert.equal(Buffer.from(entries['readme.txt'], 'base64').toString('utf8'), 'こんにちは 🌈\n');
    assert.deepEqual([...Buffer.from(entries['nested/data.bin'], 'base64')], [0, 1, 2, 127, 128, 255]);
  });
});

test('rejects a bad password and tampered ciphertext', async () => {
  await withFixture(async (source) => {
    const packed = await encodePackage(source, PASSWORD);
    await assert.rejects(() => decodePackage(packed, 'wrong password still long'), /decrypt/i);
    const tampered = Buffer.from(packed);
    tampered[tampered.length - 1] ^= 1;
    await assert.rejects(() => decodePackage(tampered, PASSWORD), /decrypt/i);
  });
});

test('round-trips multi-megabyte model files', async () => {
  await withFixture(async (source) => {
    const model = Buffer.alloc(4 * 1024 * 1024, 0xa5);
    await fs.writeFile(path.join(source, 'model.bin'), model);
    const entries = await decodePackage(await encodePackage(source, PASSWORD), PASSWORD);
    assert(Buffer.from(entries['model.bin'], 'base64').equals(model));
  });
});

test('replaces the output only after a complete package is written', async () => {
  await withFixture(async (source) => {
    const outputRoot = await fs.mkdtemp(path.join(process.cwd(), '.package-output-test-'));
    try {
      const output = path.join(outputRoot, 'content.bin');
      await writePackage(source, PASSWORD, output);
      await writePackage(source, PASSWORD, output);
      const entries = await decodePackage(await fs.readFile(output), PASSWORD);
      assert.equal(Buffer.from(entries['readme.txt'], 'base64').toString('utf8'), 'こんにちは 🌈\n');
      assert.equal((await fs.readdir(outputRoot)).some((name) => name.includes('.content.bin.') && name.endsWith('.tmp')), false);
    } finally {
      await fs.rm(outputRoot, { recursive: true, force: true });
    }
  });
});

test('enforces password length and safe relative paths', async () => {
  assert.throws(() => validateRelativePath('../escape'), /unsafe/i);
  assert.throws(() => validateRelativePath('nested\\escape'), /unsafe/i);
  assert.throws(() => validateRelativePath('/absolute'), /unsafe/i);
  await withFixture(async (source) => {
    await assert.rejects(() => encodePackage(source, 'too short'), /12/);
  });
});

test('rejects symlinks when the platform permits creating one', async (t) => {
  await withFixture(async (source) => {
    const link = path.join(source, 'link.txt');
    try {
      await fs.symlink(path.join(source, 'readme.txt'), link);
    } catch (error) {
      if (['EACCES', 'EPERM', 'ENOTSUP'].includes(error.code)) {
        t.skip('symlink creation is unavailable on this platform');
        return;
      }
      throw error;
    }
    await assert.rejects(() => encodePackage(source, PASSWORD), /symlink/i);
  });
});

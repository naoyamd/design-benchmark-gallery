import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, webcrypto } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const { subtle } = webcrypto;
const encoder = new TextEncoder();

// DBGLRY01 | 16-byte salt | 12-byte IV | AES-GCM ciphertext + 16-byte tag.
export const MAGIC = Buffer.from('DBGLRY01', 'ascii');
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSWORD_CHARS = 12;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u;

function checkPassword(password) {
  if (typeof password !== 'string' || Array.from(password).length < MIN_PASSWORD_CHARS) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_CHARS} characters.`);
  }
}

export function validateRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\0') || relativePath.includes('\\') ||
      path.posix.isAbsolute(relativePath) || /^[A-Za-z]:/u.test(relativePath)) {
    throw new Error(`Unsafe relative path: ${String(relativePath)}`);
  }
  const parts = relativePath.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..') || path.posix.normalize(relativePath) !== relativePath) {
    throw new Error(`Unsafe relative path: ${relativePath}`);
  }
  return relativePath;
}

async function collectEntries(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  let rootStat;
  try {
    rootStat = await fs.lstat(root);
  } catch {
    throw new Error('Source directory could not be read.');
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Source must be a directory and not a symlink.');
  }

  const entries = Object.create(null);
  async function visit(directory, prefix) {
    let children;
    try {
      children = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      throw new Error('Source directory could not be read.');
    }
    children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const child of children) {
      const relativePath = validateRelativePath(prefix ? `${prefix}/${child.name}` : child.name);
      const fullPath = path.join(directory, child.name);
      let stat;
      try {
        stat = await fs.lstat(fullPath);
      } catch {
        throw new Error(`Unable to read source entry: ${relativePath}`);
      }
      if (child.isSymbolicLink() || stat.isSymbolicLink()) {
        throw new Error(`Symlinks are not allowed: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        await visit(fullPath, relativePath);
      } else if (stat.isFile()) {
        try {
          entries[relativePath] = (await fs.readFile(fullPath)).toString('base64');
        } catch {
          throw new Error(`Unable to read source entry: ${relativePath}`);
        }
      } else {
        throw new Error(`Only regular files are supported: ${relativePath}`);
      }
    }
  }

  await visit(root, '');
  return entries;
}

async function deriveKey(password, salt, usages) {
  const baseKey = await subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export async function encodePackage(sourceDirectory, password) {
  checkPassword(password);
  const entries = await collectEntries(sourceDirectory);
  const compressed = gzipSync(Buffer.from(JSON.stringify(entries), 'utf8'), { mtime: 0 });
  const salt = new Uint8Array(SALT_BYTES);
  const iv = new Uint8Array(IV_BYTES);
  webcrypto.getRandomValues(salt);
  webcrypto.getRandomValues(iv);
  const key = await deriveKey(password, salt, ['encrypt']);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: MAGIC, tagLength: TAG_BYTES * 8 },
    key,
    compressed,
  );
  return Buffer.concat([MAGIC, Buffer.from(salt), Buffer.from(iv), Buffer.from(ciphertext)]);
}

function validateEntries(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new Error('Package payload is invalid.');
  }
  for (const [relativePath, value] of Object.entries(entries)) {
    validateRelativePath(relativePath);
    if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64.test(value)) {
      throw new Error('Package payload is invalid.');
    }
  }
  return entries;
}

export async function decodePackage(packageBytes, password) {
  checkPassword(password);
  const bytes = Buffer.from(packageBytes);
  const headerBytes = MAGIC.length + SALT_BYTES + IV_BYTES;
  if (bytes.length < headerBytes + TAG_BYTES || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Package header is invalid.');
  }

  const salt = bytes.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = bytes.subarray(MAGIC.length + SALT_BYTES, headerBytes);
  const ciphertext = bytes.subarray(headerBytes);
  try {
    const key = await deriveKey(password, salt, ['decrypt']);
    const compressed = await subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: MAGIC, tagLength: TAG_BYTES * 8 },
      key,
      ciphertext,
    );
    const payload = JSON.parse(gunzipSync(Buffer.from(compressed)).toString('utf8'));
    return validateEntries(payload);
  } catch {
    throw new Error('Unable to decrypt package.');
  }
}

async function writeAtomic(outputPath, bytes) {
  const destination = path.resolve(outputPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, bytes, { mode: 0o644 });
    try {
      await fs.rename(temporary, destination);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      // Windows cannot replace an existing file with rename; the temp file is already complete.
      await fs.rm(destination, { force: true });
      await fs.rename(temporary, destination);
    }
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export async function writePackage(sourceDirectory, password, outputPath = path.resolve('public', 'content.bin')) {
  const bytes = await encodePackage(sourceDirectory, password);
  await writeAtomic(outputPath, bytes);
  return bytes.length;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  let password = Buffer.concat(chunks).toString('utf8');
  if (password.endsWith('\n')) password = password.slice(0, -1);
  if (password.endsWith('\r')) password = password.slice(0, -1);
  return password;
}

function parseArgs(argv) {
  let source;
  let output = path.resolve('public', 'content.bin');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source') source = argv[++i];
    else if (argv[i] === '--output') output = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!source) throw new Error('Usage: node scripts/pack.mjs --source <directory> [--output <file>]');
  return { source, output };
}

async function main() {
  const { source, output } = parseArgs(process.argv.slice(2));
  const password = await readStdin();
  await writePackage(source, password, output);
  console.error('Encrypted content package written.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

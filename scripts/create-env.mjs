import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = path.join(root, '.env.example');
const targetPath = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(root, '.env');
const adminPassword = process.env.ADMIN_PASSWORD?.trim() || randomBytes(24).toString('base64url');

if (adminPassword.length < 12) {
  throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
}

const example = await readFile(examplePath, 'utf8');
const environment = example
  .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${adminPassword}`)
  .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(48).toString('base64url')}`)
  .replace(/^SESSION_ENCRYPTION_KEY=.*$/m, `SESSION_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);

try {
  await writeFile(targetPath, environment, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
    throw new Error(`${targetPath} already exists. It was not changed.`);
  }
  throw error;
}

console.log(`Created ${targetPath}`);
console.log('Local administrator email: admin@example.com');
console.log(`Local administrator password: ${adminPassword}`);
console.log('Keep this password private. The session and encryption secrets were not printed.');

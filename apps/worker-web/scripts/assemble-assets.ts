#!/usr/bin/env node
/**
 * Copies the built SPA (@cryptnote/web) and this package's _headers into dist/, the assets
 * directory wrangler.jsonc serves. `--allow-missing` lets `wrangler dev` start before the SPA
 * is built.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.resolve(packageDir, '../web/dist');
const out = path.join(packageDir, 'dist');
const isMissingAllowed = process.argv.includes('--allow-missing');

if (!existsSync(path.join(webDir, 'index.html'))) {
  const message = `@cryptnote/web is not built (missing ${path.relative(packageDir, webDir)}/index.html). Run \`pnpm -F @cryptnote/web build\`.`;
  if (!isMissingAllowed) throw new Error(message);
  console.warn(`Warning: ${message}`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
if (existsSync(webDir)) cpSync(webDir, out, { recursive: true });
copyFileSync(path.join(packageDir, '_headers'), path.join(out, '_headers'));
console.log('Assembled @cryptnote/web and _headers into dist/.');

// Full checkouts regenerate from source; standalone site packages verify prepared inputs.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = resolve(site, '..');
const prepared = join(site, 'public', 'effects');
const full = existsSync(join(root, 'src', 'fx', 'index.ts'));
const check = process.argv.includes('--check');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = args => {
  const result = spawnSync(npm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`Engine preparation failed (${result.status})`);
};
const toolAvailable = name => {
  const executable = join(root, 'node_modules', '.bin', `${name}${process.platform === 'win32' ? '.cmd' : ''}`);
  if (!existsSync(executable)) return false;
  const result = spawnSync(executable, ['--version'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
  return !result.error && result.status === 0;
};
if (full && !check) {
  if (!['tsc', 'esbuild'].every(toolAvailable)) run(['ci', '--include=dev', '--include=optional', '--no-audit', '--no-fund']);
  run(['run', 'sync:site']);
}
const manifestPath = join(prepared, 'build-manifest.json');
if (!existsSync(manifestPath)) throw new Error('Missing prepared engine manifest. Run npm run sync:site from the full repository.');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const name of ['fonts/SUIT-Variable.woff2', 'fonts/OFL-SUIT.txt', 'fonts/NOTICE.md']) {
  if (typeof manifest.files?.[name] !== 'string') throw new Error(`Missing prepared Studio font/license: ${name}. Run npm run sync:site.`);
}
for (const [name, expected] of Object.entries(manifest.files)) {
  const actual = createHash('sha256').update(readFileSync(join(prepared, name))).digest('hex');
  if (actual !== expected) throw new Error(`Stale engine asset: ${name}. Run npm run sync:site.`);
}
if (full) {
  const { sourceFingerprint } = await import('../../tools/site-source.mjs');
  if (sourceFingerprint(root) !== manifest.sourceHash) throw new Error('Prepared engine source hash does not match this checkout. Run npm run sync:site.');
  const copies = [
    ['build-gallery/app.js', 'app.js'],
    ['build-gallery/3d.js', '3d.js'],
    ['build-gallery/studio.js', 'studio.js'],
    ['build-gallery/studio-worker.js', 'studio-worker.js'],
    ['gallery/3d.html', '3d.html'],
    ['gallery/studio.html', 'studio.html'],
    ['gallery/studio.css', 'studio.css'],
    ['gallery/style.css', 'style.css'],
  ];
  for (const name of Object.keys(manifest.files).filter(name => name.startsWith('chunks/'))) copies.push([`build-gallery/${name}`, name]);
  for (const name of Object.keys(manifest.files).filter(name => name.startsWith('fonts/'))) copies.push([`gallery/${name}`, name]);
  for (const [source, destination] of copies) {
    const sourcePath = join(root, source);
    // CI builds first; source-only checkouts can still validate the prepared
    // manifest before generating their local bundles.
    if (source.startsWith('build-gallery/') && !existsSync(sourcePath)) continue;
    const actual = createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
    if (actual !== manifest.files[destination]) throw new Error(`Prepared engine asset does not match ${source}: ${destination}. Run npm run sync:site.`);
  }
}
console.log(`Verified engine assets (${manifest.catalogCount} effects, ${manifest.sourceHash.slice(0, 12)}).`);

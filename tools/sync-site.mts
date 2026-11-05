#!/usr/bin/env node
// Refresh the sharing site's built-in gallery from this checkout.
import { copyFileSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './lib/fxlib.mjs';

const publicDir = join(ROOT, 'site', 'public', 'effects');
mkdirSync(publicDir, { recursive: true });
const result = spawnSync(process.execPath, [join(ROOT, 'build-tools', 'tools', 'export-catalog.mjs'), '--output', join(publicDir, 'catalog.json'), '--exclude-shared'], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw result.error ?? new Error(`Catalog generation failed (${result.status})`);
copyFileSync(join(ROOT, 'build-gallery', 'app.js'), join(publicDir, 'app.js'));
copyFileSync(join(ROOT, 'build-gallery', '3d.js'), join(publicDir, '3d.js'));
for (const name of ['studio.js', 'studio-worker.js', 'gpu-lab.js', 'gpu-lab-worker.js']) copyFileSync(join(ROOT, 'build-gallery', name), join(publicDir, name));
for (const name of ['studio.html', 'studio.css', 'gpu-lab.html']) copyFileSync(join(ROOT, 'gallery', name), join(publicDir, name));
rmSync(join(publicDir, 'chunks'), { recursive: true, force: true });
if (existsSync(join(ROOT, 'build-gallery', 'chunks'))) cpSync(join(ROOT, 'build-gallery', 'chunks'), join(publicDir, 'chunks'), { recursive: true });
copyFileSync(join(ROOT, 'gallery', '3d.html'), join(publicDir, '3d.html'));
copyFileSync(join(ROOT, 'gallery', 'style.css'), join(publicDir, 'style.css'));
const fontDir = join(ROOT, 'gallery', 'fonts');
const fontNames = readdirSync(fontDir, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).sort();
mkdirSync(join(publicDir, 'fonts'), { recursive: true });
for (const name of fontNames) copyFileSync(join(fontDir, name), join(publicDir, 'fonts', name));
const { sourceFingerprint } = await import(new URL('../../tools/site-source.mjs', import.meta.url).href);
// The hosted entry point has community controls; preserve it and verify its
// integrity alongside the generated engine assets instead of replacing it.
const names = ['index.html', 'app.js', '3d.js', '3d.html', 'studio.js', 'studio-worker.js', 'studio.html', 'studio.css', 'gpu-lab.js', 'gpu-lab-worker.js', 'gpu-lab.html', 'style.css', 'community.css', 'catalog.json'];
names.push(...fontNames.map(name => `fonts/${name}`));
if (existsSync(join(publicDir, 'chunks'))) names.push(...readdirSync(join(publicDir, 'chunks')).filter(name => name.endsWith('.js')).map(name => `chunks/${name}`));
const files = Object.fromEntries(names.map(name => [name, createHash('sha256').update(readFileSync(join(publicDir, name))).digest('hex')]));
writeFileSync(join(publicDir, 'build-manifest.json'), JSON.stringify({
  schemaVersion: 1, source: 'poku-pixel-fx', sourceHash: sourceFingerprint(ROOT), files,
  catalogCount: JSON.parse(readFileSync(join(publicDir, 'catalog.json'), 'utf8')).count,
}, null, 2) + '\n');
console.log('공유 사이트의 기본 이펙트 갤러리를 갱신했습니다. 공유 게시물은 별도 저장소에 남습니다.');

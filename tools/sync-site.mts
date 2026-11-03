#!/usr/bin/env node
// Refresh the sharing site's built-in gallery from this checkout.
import { copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './lib/fxlib.mjs';

const publicDir = join(ROOT, 'site', 'public', 'effects');
const result = spawnSync(process.execPath, [join(ROOT, 'build-tools', 'tools', 'export-catalog.mjs'), '--output', join(publicDir, 'catalog.json'), '--exclude-shared'], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw result.error ?? new Error(`Catalog generation failed (${result.status})`);
copyFileSync(join(ROOT, 'build-gallery', 'app.js'), join(publicDir, 'app.js'));
console.log('공유 사이트의 기본 이펙트 갤러리를 갱신했습니다. 공유 게시물은 별도 저장소에 남습니다.');

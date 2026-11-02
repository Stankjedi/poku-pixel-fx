#!/usr/bin/env node
// Export only the canonical registry, not unregistered files from the working tree.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const { effects, categories } = await import(new URL('../../build/fx/index.js', import.meta.url).href);
const { effectsKo, tagsKo } = await import(new URL('../../build/i18n/ko/index.js', import.meta.url).href);

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output' || !args[1]) {
  console.error('사용법: npm run catalog -- --output <파일.json>');
  process.exit(1);
}
const path = resolve(args[1]);
const list = (Object.entries(effects) as [string, { meta: unknown }][]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, mod]) => {
  const meta = mod.meta as { name: string; desc: string; tags: string[]; duration: number; fps: number; loop: boolean; size: number[]; origin: number[]; addedAt?: string };
  const ko = effectsKo[id];
  return {
    id, category: id.split('/')[0],
    ...(meta.addedAt ? { addedAt: meta.addedAt } : {}),
    name: { ko: ko?.name ?? meta.name, en: meta.name },
    description: { ko: ko?.desc ?? meta.desc, en: meta.desc },
    tags: meta.tags.map(tag => ({ id: tag, ko: tagsKo[tag] ?? tag })),
    animation: { durationSeconds: meta.duration, fps: meta.fps, loop: meta.loop },
    frameSize: meta.size, origin: meta.origin,
  };
});
const catalog = { schemaVersion: 1, source: 'poku-pixel-fx', count: list.length, categories, effects: list };
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`이펙트 ${list.length}개 카탈로그: ${path}`);

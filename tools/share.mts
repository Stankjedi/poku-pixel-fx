#!/usr/bin/env node
// Prepare an uploadable PNG and matching JSON without uploading or accepting terms.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEffect, renderFrames, spriteSheet } from './lib/fxlib.mjs';
import { requireVisualReview, reviewIdentity, serializeSharedJSON } from './lib/visual-review.mjs';
const { requireIntentReview } = await import(new URL('../../tools/lib/effect-intent.mjs', import.meta.url).href);

const id = process.argv[2];
if (!id || process.argv.length !== 3 || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) {
  console.error('사용법: npm run share -- <분류>/<이펙트>'); process.exit(1);
}
try {
  const fx = await loadEffect(id), m = fx.meta;
  const [w, h] = m.size as number[], fps = Number(m.fps);
  const n = Math.max(1, Math.round(Number(m.duration) * fps) + (m.loop ? 0 : 1));
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * h / w))));
  const rows = Math.ceil(n / cols);
  if (![w, h, fps, n].every(Number.isInteger) || w < 1 || h < 1 || fps < 1 || fps > 60 || n < 2 || n > 4096 || cols*w > 2048 || rows*h > 2048) {
    throw new Error('공유 사이트의 프레임 또는 2048×2048 크기 제한을 초과합니다.');
  }
  const result = renderFrames(fx, { diagnostics: true }), name = id.split('/')[1];
  const sheet = spriteSheet(fx, result, name);
  if (sheet.png.byteLength > 5 * 1024 * 1024) throw new Error('공유 PNG가 5 MiB 제한을 초과합니다.');
  const identity = reviewIdentity(fx, result, sheet, readFileSync(fx.file, 'utf8'));
  const review = requireVisualReview(join(ROOT, 'records', 'review', id), identity);
  const intent = requireIntentReview(ROOT, id, identity);
  const parent = join(ROOT, 'records', 'share'); mkdirSync(parent, {recursive:true});
  const dir = mkdtempSync(join(parent, `${name}-`));
  const png = join(dir, `${name}.png`), json = join(dir, `${name}.json`);
  writeFileSync(png, sheet.png); writeFileSync(json, serializeSharedJSON(sheet.json));
  const record = join(dir, 'visual-review.json');
  writeFileSync(record, JSON.stringify({ identity, review }, null, 2));
  const intentRecord = join(dir, 'intent-review.json');
  writeFileSync(intentRecord, JSON.stringify(intent, null, 2));
  console.log(JSON.stringify({site:'https://poku-pixel-fx.stankjedi.chatgpt.site/shared', id, png, json, frames:n, fps, loop:!!m.loop, review:record, intentReview:intentRecord}, null, 2));
} catch (e) { console.error(`공유 준비 실패: ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }

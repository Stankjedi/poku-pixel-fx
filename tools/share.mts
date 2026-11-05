#!/usr/bin/env node
// Prepare local upload files. Does not publish or accept rights on anyone's behalf.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, WORKSPACE, loadEffect, renderSequence, spriteSheet, type RenderResult } from './lib/fxlib.mjs';
import { readProjectFile, readProjectIntent, resolveProjectIntentFile, renderProject } from './lib/project-render.mjs';
import { requireVisualReview, reviewIdentity, serializeSharedJSON } from './lib/visual-review.mjs';
const { requireIntentReview, reviewDirectory } = await import(new URL('../../tools/lib/effect-intent.mjs', import.meta.url).href);

try {
  const args = process.argv.slice(2);
  const projectFile = args[0] === '--project' && args.length === 2 ? args[1] : undefined;
  const project = projectFile ? readProjectFile(projectFile) : undefined;
  const id = project?.id ?? (args.length === 1 ? args[0] : undefined);
  if (!id || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) throw new Error('Usage: share category/effect | share --project FILE');
  const run = project ? await renderProject(project, { diagnostics: true }) : undefined;
  const fx = run?.fx ?? await loadEffect(id), m = fx.meta;
  const sequence = run?.sequence ?? renderSequence(fx, { diagnostics: true });
  const { w, h, fps, n } = sequence;
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * h / w)))), rows = Math.ceil(n / cols);
  if (![w, h, fps, n].every(Number.isInteger) || w < 1 || h < 1 || fps < 1 || fps > 240 || n < 1 || n > 4096 || cols * w > 2048 || rows * h > 2048)
    throw new Error('The public PNG gallery supports one atlas up to 2048×2048. Use render --bundle for a larger multi-page game asset.');
  const result: RenderResult = { ...sequence, frames: Array.from(sequence.frames) }, name = id.split('/')[1];
  const sheet = spriteSheet(fx, result, name);
  if (sheet.png.byteLength > 5 * 1024 * 1024) throw new Error('공유 PNG가 5 MiB 제한을 초과합니다.');
  const sharedJSON = serializeSharedJSON(sheet.json);
  if (Buffer.byteLength(sharedJSON) > 1024 * 1024) throw new Error('공유 JSON이 1 MiB 제한을 초과합니다. render --bundle로 전체 프로젝트를 보존하세요.');
  const identity = reviewIdentity(fx, result, sheet, run?.source ?? readFileSync(fx.file, 'utf8'));
  const dirReview = reviewDirectory(ROOT, id, run?.variant);
  const review = requireVisualReview(dirReview, identity);
  const brief = project ? readProjectIntent(project, projectFile!) : undefined;
  const intent = requireIntentReview(ROOT, id, identity, run?.variant, brief);
  const parent = join(WORKSPACE, 'records', 'share'); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, `${name}-`));
  const png = join(dir, `${name}.png`), json = join(dir, `${name}.json`);
  writeFileSync(png, sheet.png); writeFileSync(json, sharedJSON);
  const record = join(dir, 'visual-review.json'); writeFileSync(record, JSON.stringify({ identity, review }, null, 2));
  const intentRecord = join(dir, 'intent-review.json'); writeFileSync(intentRecord, JSON.stringify(intent, null, 2));
  if (run) writeFileSync(join(dir, 'project.json'), run.projectJSON);
  console.log(JSON.stringify({ site: 'https://poku-pixel-fx.stankjedi.chatgpt.site/shared', id, variant: run?.variant,
    intentSource: project ? resolveProjectIntentFile(project, projectFile!) : undefined,
    png, json, frames: n, fps, loop: !!m.loop, review: record, intentReview: intentRecord }, null, 2));
} catch (error) { console.error(`공유 준비 실패: ${error instanceof Error ? error.message : error}`); process.exitCode = 1; }

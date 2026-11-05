#!/usr/bin/env node
// Prepare concrete visual evidence, then record a human/agent's explicit, asset-bound judgement.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEffect, renderFrames, spriteSheet } from './lib/fxlib.mjs';
import { readReviewManifest, reviewIdentity, validateReviewRecord, writeReviewEvidence } from './lib/visual-review.mjs';

const [id, flag, file, ...rest] = process.argv.slice(2);
if (!id || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id) || rest.length
  || (flag !== undefined && (flag !== '--record' || !file))) {
  console.error('Usage: npm run review -- <category>/<effect> [--record <completed-review.json>]');
  process.exit(1);
}
try {
  const fx = await loadEffect(id), [w, h] = fx.meta.size, fps = fx.meta.fps;
  const n = Math.max(1, Math.round(fx.meta.duration * fps) + (fx.meta.loop ? 0 : 1));
  if (![w, h, fps, n].every(Number.isSafeInteger) || w < 1 || h < 1 || w > 480 || h > 480
    || fps < 1 || fps > 120 || n > 4096 || w * h * n > 16_777_216)
    throw new RangeError('Review supports 1..480 px, 1..120 fps and at most 4096 frames / 16M native pixels');
  const result = renderFrames(fx), sheet = spriteSheet(fx, result, id.split('/')[1]);
  const identity = reviewIdentity(fx, result, sheet, readFileSync(fx.file, 'utf8'));
  const dir = join(ROOT, 'records', 'review', id);
  if (flag === '--record') {
    const manifest = readReviewManifest(dir, identity);
    const record = validateReviewRecord(JSON.parse(readFileSync(file, 'utf8')), manifest);
    writeFileSync(join(dir, 'review.json'), JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ id, decision: record.decision, reviewer: record.reviewer,
      record: join(dir, 'review.json'), notice: 'Explicit reviewer judgement recorded. No automatic aesthetic certification.' }, null, 2));
  } else {
    mkdirSync(dir, { recursive: true });
    const manifest = writeReviewEvidence(dir, fx, result, sheet, identity);
    console.log(JSON.stringify({ id, evidence: join(dir, 'playback.html'), template: join(dir, 'review-template.json'),
      fingerprint: identity.fingerprint, samples: manifest.samples.length,
      next: 'Inspect the images and full-speed playback. Write your own intent, observations and limitations, then submit with --record. No review is granted automatically.' }, null, 2));
  }
} catch (e) {
  console.error(`Visual review: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}

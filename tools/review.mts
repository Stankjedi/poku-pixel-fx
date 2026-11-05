#!/usr/bin/env node
// Prepare concrete visual evidence, then record a human/agent's explicit, asset-bound judgement.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEffect, renderFrames, spriteSheet } from './lib/fxlib.mjs';
import { readReviewManifest, reviewIdentity, validateReviewRecord, writeReviewEvidence } from './lib/visual-review.mjs';
const { readIntentBrief, prepareIntentReview } = await import(new URL('../../tools/lib/effect-intent.mjs', import.meta.url).href);

const [id, flag, file, ...rest] = process.argv.slice(2);
if (!id || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id) || rest.length
  || (flag !== undefined && (flag !== '--record' || !file))) {
  console.error('Usage: npm run review -- <category>/<effect> [--record <completed-review.json>]');
  process.exit(1);
}
try {
  const brief = readIntentBrief(ROOT, id);
  const fx = await loadEffect(id), [w, h] = fx.meta.size, fps = fx.meta.fps;
  if (brief.timeline.durationSeconds !== fx.meta.duration || brief.timeline.loop !== !!fx.meta.loop)
    throw new Error('Intent duration/loop must match the current effect meta.duration/meta.loop');
  const n = Math.max(1, Math.round(fx.meta.duration * fps) + (fx.meta.loop ? 0 : 1));
  if (![w, h, fps, n].every(Number.isSafeInteger) || w < 1 || h < 1 || w > 480 || h > 480
    || fps < 1 || fps > 120 || n > 4096 || w * h * n > 16_777_216)
    throw new RangeError('Review supports 1..480 px, 1..120 fps and at most 4096 frames / 16M native pixels');
  const result = renderFrames(fx, { diagnostics: true }), sheet = spriteSheet(fx, result, id.split('/')[1]);
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
    const intent = prepareIntentReview(ROOT, id);
    console.log(JSON.stringify({ id, evidence: join(dir, 'playback.html'), template: join(dir, 'review-template.json'),
      fingerprint: identity.fingerprint, samples: manifest.samples.length, intentTemplate: intent.path,
      next: 'Inspect images and full-speed playback. Record visual observations with --record, then record the intent review using node tools/effect-intent.mjs record <id> <file>. Record the observed first impression separately from intended meaning. Human or agent self-assessment is not user approval; neither review is generated automatically.' }, null, 2));
  }
} catch (e) {
  console.error(`Visual review: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}

#!/usr/bin/env node
// Prepare actual output evidence; never invent viewing or user approval.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEffect, renderSequence, spriteSheet, type RenderResult } from './lib/fxlib.mjs';
import { readProjectFile, readProjectIntent, resolveProjectIntentFile, renderProject } from './lib/project-render.mjs';
import { readReviewManifest, reviewIdentity, validateReviewRecord, writeReviewEvidence } from './lib/visual-review.mjs';
const { readIntentBrief, prepareIntentReview, reviewDirectory } = await import(new URL('../../tools/lib/effect-intent.mjs', import.meta.url).href);

try {
  const args = process.argv.slice(2); let id: string | undefined, projectFile: string | undefined, recordFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' || args[i] === '--record') {
      const flag = args[i], value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a file`);
      if (flag === '--project') { if (projectFile) throw new Error('Repeated --project'); projectFile = value; }
      else { if (recordFile) throw new Error('Repeated --record'); recordFile = value; }
    } else if (!args[i].startsWith('--') && !id) id = args[i];
    else throw new Error('Usage: review <category/effect> [--record FILE] | review --project FILE [--record FILE]');
  }
  const project = projectFile ? readProjectFile(projectFile) : undefined;
  if (project && id && id !== project.id) throw new Error('Project and effect id differ');
  id = project?.id ?? id;
  if (!id || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) throw new Error('Specify an effect id or --project FILE');
  const run = project ? await renderProject(project, { diagnostics: true }) : undefined;
  const brief = project ? readProjectIntent(project, projectFile!) : readIntentBrief(ROOT, id);
  const fx = run?.fx ?? await loadEffect(id), sequence = run?.sequence ?? renderSequence(fx, { diagnostics: true });
  if (brief.timeline.durationSeconds !== fx.meta.duration || brief.timeline.loop !== !!fx.meta.loop)
    throw new Error('Intent duration/loop must match the current effect duration/loop');
  const { w, h, fps, n } = sequence;
  if (![w, h, n].every(Number.isSafeInteger) || w < 1 || h < 1 || w > 1024 || h > 1024
    || fps < 1 || fps > 240 || n > 4096 || w * h * n > 64_000_000)
    throw new RangeError('Review supports 1..1024 px, 1..240 fps and at most 4096 frames / 64M native pixels');
  const result: RenderResult = { ...sequence, frames: Array.from(sequence.frames) };
  const sheet = spriteSheet(fx, result, id.split('/')[1]);
  const identity = reviewIdentity(fx, result, sheet, run?.source ?? readFileSync(fx.file, 'utf8'));
  const dir = reviewDirectory(ROOT, id, run?.variant);
  if (recordFile) {
    const manifest = readReviewManifest(dir, identity);
    const record = validateReviewRecord(JSON.parse(readFileSync(recordFile, 'utf8')), manifest);
    writeFileSync(join(dir, 'review.json'), JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ id, variant: run?.variant, decision: record.decision, reviewer: record.reviewer,
      record: join(dir, 'review.json'), notice: 'Explicit reviewer judgement recorded. No automatic aesthetic certification.' }, null, 2));
  } else {
    mkdirSync(dir, { recursive: true });
    if (run) {
      writeFileSync(join(dir, 'project.json'), run.projectJSON);
      writeFileSync(join(dir, 'intent.json'), JSON.stringify(brief, null, 2));
    }
    const manifest = writeReviewEvidence(dir, fx, result, sheet, identity, run?.context);
    const intent = prepareIntentReview(ROOT, id, run?.variant);
    console.log(JSON.stringify({ id, variant: run?.variant, intentSource: project ? resolveProjectIntentFile(project, projectFile!) : undefined, evidence: join(dir, 'playback.html'),
      template: join(dir, 'review-template.json'), fingerprint: identity.fingerprint,
      samples: manifest.samples.length, intentTemplate: intent.path,
      intentRecordCommand: `${process.env.POKU_WORKSPACE ? 'poku-fx intent' : 'node tools/effect-intent.mjs'} record ${id} COMPLETED_FILE${run ? ` --variant ${run.variant}` : ''}`,
      next: 'Inspect actual native pixels and full-speed playback, then record explicit visual and intent observations. Self-assessment is not user approval. Neither record is generated automatically.' }, null, 2));
  }
} catch (error) {
  console.error(`Visual review: ${error instanceof Error ? error.message : error}`); process.exitCode = 1;
}

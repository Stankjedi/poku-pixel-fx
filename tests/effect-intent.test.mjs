import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hash, PHASES, TOPICS, intentTemplate, createIntentBrief, validateIntentBrief,
  readIntentContext, intentReviewTemplate, validateIntentReview, prepareIntentReview,
  recordIntentReview, requireIntentReview } from '../tools/lib/effect-intent.mjs';

const id = 'test/recall-fixture';
const json = value => JSON.stringify(value);
function brief() {
  const b = intentTemplate(id);
  b.intent = { oneSentence: 'The caster pulls a dropped sword back into their hand.', firstRead: 'A sword is being recalled toward its owner.',
    mustNotReadAs: 'An upward rocket launch.', useContext: 'Native battle view with caster and sword visible.' };
  b.readability = { primaryShape: 'A readable blade and hilt.', focalPoint: 'The returning blade.', depthAndOverlap: 'It passes behind the forearm before the grip.',
    contrast: 'Bright thin edge on a dark floor.', intendedBackgrounds: ['dark stone floor'], secondaryDetailBudget: 'One fading trajectory trail; no exhaust plume.' };
  b.mechanics = { model: 'magic-with-rules', source: 'The caster hand.', driver: 'An explicitly authored attraction toward the hand.',
    direction: 'From the dropped sword to the fixed receiving hand.', weightAndMaterial: 'A rigid steel blade; no flexible bending.',
    causalChain: 'Hand cue, lifted sword, travel, deceleration, grip.', endingRule: 'The blade reaches the hand and settles.',
    exaggerationAndLimits: 'Fast recall is magical, but its source and destination remain visible.' };
  b.timeline = { durationSeconds: 1, loop: false,
    phases: PHASES.map((name, i) => ({ name, from: i / 4, to: (i + 1) / 4,
      action: `Synthetic ${name} action.`, cause: 'Synthetic cause for validator tests.', visibleCue: 'Synthetic cue, not inspected art.' })), omittedPhases: {} };
  return b;
}
function environment() {
  const root = mkdtempSync(join(tmpdir(), 'poku-intent-test-'));
  const source = 'Synthetic source, never executed.';
  mkdirSync(join(root, 'src/fx/test'), { recursive: true }); writeFileSync(join(root, 'src/fx', `${id}.ts`), source);
  const p = createIntentBrief(root, id).path; writeFileSync(p, json(brief()));
  const dir = join(root, 'records/review', id); mkdirSync(dir, { recursive: true });
  const identity = { id, sourceSha256: hash(source), pngSha256: hash('synthetic PNG'), jsonSha256: hash('synthetic JSON'), sceneSha256: hash('synthetic scene') };
  identity.fingerprint = hash(json(identity));
  const manifest = { schema: 'poku-visual-review/v1', identity, size: [3, 2], fps: 4, frames: 5, loop: false, samples: [], evidence: {} };
  for (const file of ['scene-native.png', 'scene-3x.png', 'export-dark.png', 'export-light.png', 'export-checker.png', 'values.png', 'silhouette.png', 'playback.html']) {
    const contents = `Synthetic fixture bytes for ${file}. Not an artwork.`;
    writeFileSync(join(dir, file), contents); manifest.evidence[file] = hash(contents);
  }
  writeFileSync(join(dir, 'manifest.json'), json(manifest));
  return { root, dir, p, context: readIntentContext(root, id), dispose: () => rmSync(root, { recursive: true, force: true }) };
}
// These records exercise validation only. No fixture image was reviewed or approved as artwork.
function mockReview(context, kind = 'agent') {
  const r = intentReviewTemplate(context);
  r.reviewer = { name: 'SYNTHETIC TEST ONLY; not an artwork reviewer', kind, relationship: 'author' };
  r.reviewedAt = '2026-11-05T00:00:00Z';
  for (const key of Object.keys(r.viewed)) r.viewed[key] = true;
  r.firstRead = { method: 'informed-self-review', description: 'Synthetic expected read.', matchesIntent: true, confusions: 'Synthetic test; no genuine first impression was measured.' };
  for (const topic of TOPICS) r.observations[topic] = { result: 'pass', note: 'Synthetic validator observation, not a visual judgement.', frameRanges: [{ from: 0, to: 4 }] };
  r.knownLimitations = 'No artwork, physics, human inspection or user approval was established.';
  r.decision = 'ready'; return r;
}

test('brief creation is non-destructive, blank drafts are invalid and IDs cannot escape the project', () => {
  const e = environment(); try {
    const before = readFileSync(e.p); assert.equal(createIntentBrief(e.root, id).created, false);
    assert.deepEqual(readFileSync(e.p), before);
    assert.throws(() => validateIntentBrief(intentTemplate(id)), /concrete/);
    assert.throws(() => createIntentBrief(e.root, '../outside'), /kebab-case/);
    assert.throws(() => validateIntentBrief({ ...brief(), id: 'wrong/id' }, id), /mismatch/);
  } finally { e.dispose(); }
});
test('physical, stylized, magical and symbolic briefs need explicit causal descriptions, not a universal motif', () => {
  for (const model of ['physical', 'stylized-physical', 'magic-with-rules', 'symbolic-ui']) {
    const b = brief(); b.mechanics.model = model; assert.equal(validateIntentBrief(b), b);
  }
  const b = brief(); b.mechanics.driver = 'TODO'; assert.throws(() => validateIntentBrief(b), /driver/);
});
test('phases permit overlap and explained omissions, but reject missing, duplicated and out-of-range entries', () => {
  const b = brief(); b.timeline.phases[1].from = 0.1; validateIntentBrief(b);
  const noPrep = brief(); noPrep.timeline.phases.shift(); noPrep.timeline.omittedPhases.preparation = 'A reactive status appears immediately; no wind-up is appropriate.';
  validateIntentBrief(noPrep); delete noPrep.timeline.omittedPhases.preparation; assert.throws(() => validateIntentBrief(noPrep), /not applicable/);
  const bad = brief(); bad.timeline.phases[3].to = 2; assert.throws(() => validateIntentBrief(bad), /times/);
  const dup = brief(); dup.timeline.phases.push(dup.timeline.phases[0]); assert.throws(() => validateIntentBrief(dup), /duplicate/);
});
test('prepare writes an unapproved evidence-bound template, never a review; authored template edits are not overwritten', () => {
  const e = environment(); try {
    const output = prepareIntentReview(e.root, id), r = JSON.parse(readFileSync(output.path));
    assert.equal(r.decision, 'needs-work'); assert.equal(r.viewed.playback, false); assert.equal(r.userApproval.status, 'not-recorded');
    assert.throws(() => requireIntentReview(e.root, id), /ENOENT/);
    assert.equal(prepareIntentReview(e.root, id).path, output.path);
    writeFileSync(output.path, json({ ...r, knownLimitations: 'An authored note.' }));
    assert.throws(() => prepareIntentReview(e.root, id), /authored edits/);
  } finally { e.dispose(); }
});
test('human or agent observations can be ready without inventing user approval', () => {
  const e = environment(); try {
    for (const kind of ['agent', 'human']) {
      const r = mockReview(e.context, kind); assert.equal(validateIntentReview(r, e.context), r);
      assert.equal(r.userApproval.status, 'not-recorded');
    }
    const r = mockReview(e.context); r.userApproval.status = 'approved';
    assert.throws(() => validateIntentReview(r, e.context), /user decision/);
    r.userApproval = { status: 'changes-requested', evidence: 'Synthetic user decision for this test version.' };
    assert.throws(() => validateIntentReview(r, e.context), /changes/);
  } finally { e.dispose(); }
});
test('ready rejects unviewed playback, incompatible first impression, known failures, pending changes and invented independence', () => {
  const e = environment(); try {
    for (const mutate of [r => r.viewed.playback = false, r => r.firstRead.matchesIntent = false,
      r => r.observations.causality.result = 'needs-work', r => r.nextChanges.push('Fix the rocket-like trail.'),
      r => r.firstRead.method = 'unlabelled-independent']) {
      const r = mockReview(e.context); mutate(r); assert.throws(() => validateIntentReview(r, e.context));
    }
    const r = mockReview(e.context); r.observations.meaning.frameRanges[0].to = 5;
    assert.throws(() => validateIntentReview(r, e.context), /bounds/);
  } finally { e.dispose(); }
});
test('needs-work can be recorded without clearing ready; corrected explicit review can clear the record gate', () => {
  const e = environment(); try {
    const r = mockReview(e.context), input = join(e.root, 'completed.json');
    r.decision = 'needs-work'; r.firstRead.matchesIntent = false; r.nextChanges = ['Replace the exhaust reading with a visible attraction cue.'];
    writeFileSync(input, json(r)); assert.equal(recordIntentReview(e.root, id, input).decision, 'needs-work');
    assert.throws(() => requireIntentReview(e.root, id), /not ready/);
    writeFileSync(input, json(mockReview(e.context))); recordIntentReview(e.root, id, input);
    assert.equal(requireIntentReview(e.root, id, e.context.manifest.identity).review.decision, 'ready');
  } finally { e.dispose(); }
});
test('a provisional record can truthfully retain unviewed evidence and cannot clear ready', () => {
  const e = environment(); try {
    const r = mockReview(e.context);
    r.decision = 'provisional'; r.viewed.playback = false;
    r.observations.lifecycle = { result: 'needs-work', note: 'Playback has not been inspected; this is pending, not a visual finding.', frameRanges: [] };
    r.nextChanges = ['Inspect the full-speed playback before judging lifecycle.'];
    assert.equal(validateIntentReview(r, e.context), r);
    r.decision = 'ready'; assert.throws(() => validateIntentReview(r, e.context));
  } finally { e.dispose(); }
});
test('an intent timeline must match the rendered loop and frame count', () => {
  const e = environment(); try {
    for (const mutate of [b => b.timeline.durationSeconds = 2, b => b.timeline.loop = true]) {
      const b = brief(); mutate(b); writeFileSync(e.p, json(b));
      assert.throws(() => readIntentContext(e.root, id), /duration\/loop/);
    }
  } finally { e.dispose(); }
});
test('changed brief, source, evidence or current render cannot reuse an old record', () => {
  for (const what of ['brief', 'source', 'evidence', 'output']) {
    const e = environment(); try {
      const input = join(e.root, 'completed.json'); writeFileSync(input, json(mockReview(e.context))); recordIntentReview(e.root, id, input);
      if (what === 'brief') { const b = brief(); b.intent.firstRead = 'A launched blade.'; writeFileSync(e.p, json(b)); }
      if (what === 'source') writeFileSync(join(e.root, 'src/fx', `${id}.ts`), 'Changed source.');
      if (what === 'evidence') writeFileSync(join(e.dir, 'playback.html'), 'Changed playback.');
      const expected = what === 'output' ? { fingerprint: 'different' } : undefined;
      assert.throws(() => requireIntentReview(e.root, id, expected));
    } finally { e.dispose(); }
  }
});
test('standalone CLI validates briefs, reports non-approval and rejects an empty review', () => {
  const e = environment(); try {
    const run = (...args) => spawnSync(process.execPath, [resolve('tools/effect-intent.mjs'), ...args, '--root', e.root], { encoding: 'utf8' });
    const valid = run('validate', id); assert.equal(valid.status, 0, valid.stderr); assert.match(valid.stdout, /brief-structure-valid/);
    const prepared = run('prepare', id); assert.equal(prepared.status, 0, prepared.stderr);
    const recorded = run('record', id, JSON.parse(prepared.stdout).path); assert.equal(recorded.status, 1);
    assert.equal(run('check', id).status, 1); assert.equal(run('unknown', id).status, 1);
  } finally { e.dispose(); }
});

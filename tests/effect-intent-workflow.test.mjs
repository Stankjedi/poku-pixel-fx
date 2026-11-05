// Isolated CLI wiring exercise. Mock records below are NEVER artwork or user approvals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { PHASES, TOPICS, intentTemplate, readIntentContext, intentReviewTemplate } from '../tools/lib/effect-intent.mjs';
test('new/review/share use matching explicit intent records without inventing artwork or user approval', () => {
const project = fileURLToPath(new URL('../', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'poku-intent-workflow-'));
try {
for (const directory of ['build', 'build-tools']) cpSync(join(project, directory), join(root, directory), { recursive: true });
for (const file of ['package.json', 'tools/effect-intent.mjs', 'tools/lib/effect-intent.mjs', 'src/fx/index.ts', 'src/fx/categories.ts']) {
  const target = join(root, file); mkdirSync(join(target, '..'), { recursive: true }); cpSync(join(project, file), target);
}
const id = 'arcane/intent-wiring-fixture';
const steps = [];
function run(expected, ...args) {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  steps.push({ command: [process.execPath, ...args].join(' '), expectedExit: expected, actualExit: r.status, stdout: r.stdout, stderr: r.stderr });
  assert.equal(r.status, expected, r.stderr + r.stdout); return r;
}
const json = path => JSON.parse(readFileSync(path));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));

run(0, 'build-tools/tools/new.mjs', id);
const briefPath = join(root, 'authoring', `${id}.intent.json`);
assert.ok(existsSync(briefPath));
run(1, 'tools/effect-intent.mjs', 'validate', id);
run(1, 'build-tools/tools/review.mjs', id);
const b = intentTemplate(id);
for (const key of Object.keys(b.intent)) b.intent[key] = 'Synthetic CLI wiring fixture; not an artwork claim.';
for (const key of Object.keys(b.readability)) b.readability[key] = key === 'intendedBackgrounds' ? ['Synthetic dark backdrop'] : 'Synthetic field for wiring only.';
for (const key of Object.keys(b.mechanics)) if (key !== 'model') b.mechanics[key] = 'Synthetic field for wiring only; physics was not evaluated.';
b.mechanics.model = 'symbolic-ui';
b.timeline = { durationSeconds: 1, loop: false, phases: PHASES.map((name, i) => ({ name, from: i / 4, to: (i + 1) / 4,
  action: 'Synthetic state.', cause: 'Synthetic validator fixture.', visibleCue: 'Unreviewed synthetic marker.' })), omittedPhases: {} };
save(briefPath, b);
// The synthetic runtime/source pair avoids compiling or executing arbitrary copied source.
const fixture = `// Synthetic 8x8 fixture, not an authored artwork.\nexport const meta = {name:'SYNTHETIC WIRING TEST',size:[8,8],origin:[0,0],duration:1,fps:4,loop:false,bg:'dark',options:{}};\nexport function draw(p,t){ if(t<1)p.rect(1,1,2,2,0xff804020); }\n`;
writeFileSync(join(root, 'src/fx', `${id}.ts`), fixture);
writeFileSync(join(root, 'build/fx', `${id}.js`), fixture);
run(0, 'tools/effect-intent.mjs', 'validate', id);
const prepared = JSON.parse(run(0, 'build-tools/tools/review.mjs', id).stdout);
assert.ok(existsSync(prepared.intentTemplate));
const context = readIntentContext(root, id);
assert.equal(json(prepared.intentTemplate).userApproval.status, 'not-recorded');
assert.equal(existsSync(join(context.dir, 'intent-review.json')), false);
run(1, 'build-tools/tools/share.mjs', id);
assert.equal(existsSync(join(root, 'records/share')), false);
const visual = json(join(context.dir, 'review-template.json'));
Object.assign(visual, { reviewer: 'SYNTHETIC WIRING TEST ONLY', reviewedAt: '2026-11-05T12:00:00Z', evidenceViewed: true, decision: 'ready',
  intent: 'Exercise the isolated CLI, not approve an artwork.', knownLimitations: 'Mock test fields; no visual inspection or user approval.' });
for (const key of Object.keys(visual.observations)) visual.observations[key] = 'Synthetic validator field, not an observed artistic finding.';
const vf = join(root, 'synthetic-visual-input.json'); save(vf, visual);
run(0, 'build-tools/tools/review.mjs', id, '--record', vf);
run(1, 'build-tools/tools/share.mjs', id);
assert.equal(existsSync(join(root, 'records/share')), false);
const r = intentReviewTemplate(context);
r.reviewer = { name: 'SYNTHETIC WIRING TEST ONLY', kind: 'agent', relationship: 'author' };
r.reviewedAt = '2026-11-05T12:00:00Z';
for (const key of Object.keys(r.viewed)) r.viewed[key] = true;
r.firstRead = { method: 'informed-self-review', description: 'Synthetic test fields, no real first impression measured.', matchesIntent: true, confusions: 'No artwork was evaluated.' };
for (const topic of TOPICS) r.observations[topic] = { result: 'pass', note: 'Synthetic record used solely to exercise CLI gates.', frameRanges: [{ from: 0, to: 4 }] };
r.knownLimitations = 'No artwork, physical meaning, viewing or user approval established.';
r.decision = 'needs-work'; r.nextChanges = ['Synthetic pending correction to test the share gate.'];
const rf = join(root, 'synthetic-intent-input.json'); save(rf, r);
run(0, 'tools/effect-intent.mjs', 'record', id, rf);
run(1, 'build-tools/tools/share.mjs', id);
r.decision = 'ready'; r.nextChanges = []; save(rf, r);
run(0, 'tools/effect-intent.mjs', 'record', id, rf);
const shared = JSON.parse(run(0, 'build-tools/tools/share.mjs', id).stdout);
for (const key of ['png', 'json', 'review', 'intentReview']) assert.ok(existsSync(shared[key]));
assert.equal(json(shared.intentReview).review.reviewer.kind, 'agent');
assert.equal(json(shared.intentReview).review.userApproval.status, 'not-recorded');
b.intent.firstRead = 'A changed synthetic intent invalidates the old record.'; save(briefPath, b);
run(1, 'build-tools/tools/share.mjs', id);
b.intent.firstRead = 'Synthetic CLI wiring fixture; not an artwork claim.'; save(briefPath, b);
// Change runtime output, but not the source: the share rerender must invalidate old reviews.
const compiled = join(root, 'build/fx', `${id}.js`), original = readFileSync(compiled, 'utf8');
assert.match(original, /0xff804020/); writeFileSync(compiled, original.replace('0xff804020', '0xff204080'));
run(1, 'build-tools/tools/share.mjs', id);
run(1, 'build-tools/tools/new.mjs', id);
assert.deepEqual(json(briefPath), b);
assert.equal(steps.length, 15);
} finally { rmSync(root, { recursive: true, force: true }); }
});

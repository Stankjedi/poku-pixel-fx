// New/preview/save fidelity only, not aesthetic acceptance or normal-speed viewing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { parseGenerationStyle2D, generationRenderOptions2D, generationStyleFlags } from '../build-tools/tools/lib/generation-style.mjs';
import { parseGenerationPreviewArgs, prepareGenerationPreview } from '../build-tools/tools/lib/generation-preview.mjs';
import { meaningTemplate } from '../build-tools/tools/lib/meaning-template.mjs';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';
import { createProjectRuntime } from '../build/authoring/runtime.js';
import { serializeProject, parseProject } from '../build/authoring/project.js';
import { renderProject } from '../build-tools/tools/lib/project-render.mjs';
import { renderSequence } from '../build-tools/tools/lib/fxlib.mjs';
import { createFrame, enableHDRLight, Painter } from '../build/core/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const choice = { fireSparks: 'short-exposure' }, flags = ['--fire-sparks', 'short-exposure'];
const intent = { material: 'fire', action: 'dash', distance: 160, travel: 1.1 };
const previewBase = ['--material', 'fire', '--action', 'dash', '--seeds', '61', '--distance', '160', '--travel', '1.1'];
const malformed = ['', ' ', 'NaN', 'Infinity', '-Infinity', '1e999', '0x10', '3junk', ' 1', '1 ', '-1'];
const styleFlags = (count, light) => ({ '--fire-sparks': 'short-exposure', '--fire-spark-count': count, '--fire-spark-light': light });
const render = (e, t) => {
  const f = enableHDRLight(createFrame(...e.meta.size)), p = new Painter(f).place(...e.meta.origin), i = e.create({ ...e.meta.options });
  i.drawBack(p, t); i.draw(p, t); return f;
};
function fixture() {
  const temp = mkdtempSync(join(tmpdir(), 'poku-spark-controls-new-'));
  for (const directory of ['src', 'build', 'build-tools']) cpSync(join(root, directory), join(temp, directory), { recursive: true });
  for (const file of ['package.json', 'tools/lib/effect-intent.mjs']) {
    mkdirSync(join(temp, file, '..'), { recursive: true }); cpSync(join(root, file), join(temp, file));
  }
  return temp;
}
const newCLI = (cwd, id, args) => spawnSync(process.execPath, ['build-tools/tools/new.mjs', id, ...args],
  { cwd, encoding: 'utf8', timeout: 30000, env: { ...process.env, POKU_WORKSPACE: cwd } });
const previewCLI = args => spawnSync(process.execPath, ['build-tools/tools/preview-generation.mjs', ...args],
  { cwd: root, encoding: 'utf8', timeout: 120000 });

// Count uses finite decimal parsing plus integer validation; scientific notation is allowed.
test('style parser preserves zero, accepts finite decimal bounds and never inserts implicit controls', () => {
  assert(Object.isFrozen(generationStyleFlags));
  assert.throws(() => generationStyleFlags.push('--bogus'), TypeError);
  assert.throws(() => { generationStyleFlags[0] = '--bogus'; }, TypeError);
  assert.throws(() => parseGenerationStyle2D({ '--fire-sparks': 'short-exposure', '--bogus': 'ignored' }), RangeError);
  const inherited = Object.create({ '--fire-sparks': 'short-exposure' }); inherited['--fire-spark-count'] = '0';
  assert.throws(() => parseGenerationStyle2D(inherited), RangeError);
  assert.deepEqual(parseGenerationStyle2D({}), {});
  assert.deepEqual(parseGenerationStyle2D({ '--fire-sparks': 'short-exposure' }), choice);
  assert.deepEqual(parseGenerationStyle2D({ '--fire-sparks': 'short-exposure', '--fire-spark-count': '0' }), { ...choice, fireSparkCount: 0 });
  assert.deepEqual(parseGenerationStyle2D({ '--fire-sparks': 'short-exposure', '--fire-spark-light': '.5' }), { ...choice, fireSparkLight: .5 });
  assert.deepEqual(parseGenerationStyle2D(styleFlags('0', '0')), { ...choice, fireSparkCount: 0, fireSparkLight: 0 });
  assert.deepEqual(parseGenerationStyle2D(styleFlags('7.2e2', '2')), { ...choice, fireSparkCount: 720, fireSparkLight: 2 });
  assert.deepEqual(parseGenerationStyle2D(styleFlags('120', '.25')), { ...choice, fireSparkCount: 120, fireSparkLight: .25 });
  for (const flag of ['--fire-spark-count', '--fire-spark-light']) {
    for (const value of [...malformed, null, undefined, true])
      assert.throws(() => parseGenerationStyle2D({ '--fire-sparks': 'short-exposure', [flag]: value }));
    assert.throws(() => parseGenerationStyle2D({ [flag]: '0' }));
  }
  for (const value of ['1.5', '720.1', '721']) assert.throws(() => parseGenerationStyle2D(styleFlags(value, '1')));
  for (const value of ['2.001', '3']) assert.throws(() => parseGenerationStyle2D(styleFlags('240', value)));
  const plan = createGenerationPlan2D(intent), selection = { ...choice, fireSparkCount: 0, fireSparkLight: .5 };
  const options = generationRenderOptions2D(plan, selection); selection.fireSparkCount = 720; selection.fireSparkLight = 2;
  assert.deepEqual(options, { composition: 'material-volumes', ...choice, fireSparkCount: 0, fireSparkLight: .5 });
  assert(Object.isFrozen(options));
  assert.deepEqual(generationRenderOptions2D(plan), { composition: 'material-volumes' });
  assert.deepEqual(generationRenderOptions2D(plan, choice), { composition: 'material-volumes', ...choice });
});

test('actual new CLI saves numeric choices in source, leaves the causal plan alone and handles zero', () => {
  const temp = fixture();
  try {
    for (const [suffix, count, light] of [['zero', 0, 0], ['tuned', 720, .25]]) {
      const id = 'fire/control-' + suffix, r = newCLI(temp, id, [...flags, '--fire-spark-count', String(count), '--fire-spark-light', String(light)]);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      const source = readFileSync(join(temp, 'src/fx', id + '.ts'), 'utf8');
      assert.match(source, new RegExp(`fireSparkCount: ${count}, fireSparkLight: ${light}`));
      const plan = JSON.parse(readFileSync(join(temp, 'authoring', id + '.generation.json')));
      assert.deepEqual(plan, createGenerationPlan2D({ material: 'fire', action: 'plume' }));
      assert(!Object.hasOwn(plan.intent, 'fireSparkCount')); assert(!Object.hasOwn(plan.intent, 'fireSparkLight'));
      assert.equal(newCLI(temp, id, flags).status, 1); assert.equal(readFileSync(join(temp, 'src/fx', id + '.ts'), 'utf8'), source);
    }
    const r = newCLI(temp, 'fire/control-old', flags); assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(readFileSync(join(temp, 'src/fx/fire/control-old.ts'), 'utf8'), /fireSparkCount|fireSparkLight/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('new and preview reject malformed, duplicate, missing and inapplicable controls before writes', { timeout: 60000 }, () => {
  const temp = fixture(), output = join(temp, 'must-not-exist');
  try {
    const registry = readFileSync(join(temp, 'src/fx/index.ts'), 'utf8');
    const cases = [];
    for (const flag of ['--fire-spark-count', '--fire-spark-light']) {
      cases.push([flag, '0'], [...flags, flag], [...flags, flag, '1', flag, '1']);
      for (const value of malformed) cases.push([...flags, flag, value]);
    }
    cases.push([...flags, '--fire-spark-count', '1.5'], [...flags, '--fire-spark-count', '721'], [...flags, '--fire-spark-light', '2.1']);
    for (const args of cases) {
      const n = newCLI(temp, 'fire/invalid-controls', args); assert.equal(n.status, 1, JSON.stringify(args) + n.stdout + n.stderr);
      assert.equal(readFileSync(join(temp, 'src/fx/index.ts'), 'utf8'), registry);
      for (const [dir, ext] of [['src/fx', '.ts'], ['authoring', '.intent.json'], ['authoring', '.generation.json']])
        assert(!existsSync(join(temp, dir, 'fire/invalid-controls' + ext)));
      const p = [...previewBase, ...args, '--out', output]; assert.throws(() => parseGenerationPreviewArgs(p));
      const r = previewCLI(p); assert.equal(r.status, 1, JSON.stringify(args) + r.stdout + r.stderr); assert(!existsSync(output));
    }
    const controls = [...flags, '--fire-spark-count', '0', '--fire-spark-light', '0'];
    for (const [material, action, response] of [['ice', 'shatter'], ['energy', 'dash'], ['water', 'pour']]) {
      const args = ['--material', material, '--action', action, ...(response ? ['--response', response] : []), ...controls];
      assert.equal(newCLI(temp, 'fire/invalid-controls', args).status, 1);
      const r = previewCLI([...args, '--seeds', '0', '--out', output]); assert.equal(r.status, 1, r.stdout + r.stderr); assert(!existsSync(output));
    }
    for (const mode of ['--minimal', '--cinematic', '--timing', '--loop'])
      assert.equal(newCLI(temp, 'fire/invalid-controls', [...controls, mode]).status, 1);
    assert.equal(newCLI(temp, 'arcane/invalid-controls', controls).status, 1);
    assert.equal(readFileSync(join(temp, 'src/fx/index.ts'), 'utf8'), registry);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('compiled numeric templates use exactly the public factory settings', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-spark-controls-template-'));
  try {
    for (const action of ['plume', 'dash']) for (const [fireSparkCount, fireSparkLight] of [[0, 0], [120, .5], [720, 2]]) {
      const plan = createGenerationPlan2D({ material: 'fire', action, seed: 61 });
      const selection = { ...choice, fireSparkCount, fireSparkLight };
      const source = meaningTemplate('Controls', 'fire', plan, '2026-11-08T00:00:00Z', selection)
        .replaceAll('../../authoring/', pathToFileURL(join(root, 'build/authoring/')).href);
      const compiled = transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022' }); assert.deepEqual(compiled.warnings, []);
      const file = join(temp, `${action}-${fireSparkCount}.mjs`); writeFileSync(file, compiled.code);
      const mod = await import(pathToFileURL(file).href), direct = createGeneratedEffect2D(plan, generationRenderOptions2D(plan, selection));
      for (const t of [.35, .65, 1.2, mod.meta.duration]) assert.deepEqual(render(mod, t), render(direct, t));
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('numeric settings survive immutable preview, JSON, runtime reverse seeks and normal project rendering', async () => {
  for (const [fireSparkCount, fireSparkLight] of [[0, 0], [120, .5]]) {
    const selected = { ...choice, fireSparkCount, fireSparkLight };
    const [candidate] = prepareGenerationPreview(intent, [61], selected);
    selected.fireSparkCount = 720; selected.fireSparkLight = 2;
    assert.deepEqual(candidate.renderOptions, { composition: 'material-volumes', ...choice, fireSparkCount, fireSparkLight });
    assert.deepEqual(candidate.project.sequence.cues[0].source.renderOptions, candidate.renderOptions);
    assert(Object.isFrozen(candidate.renderOptions)); assert(Object.isFrozen(candidate.project.sequence.cues[0].source.renderOptions));
    const serialized = serializeProject(candidate.project), restored = parseProject(serialized);
    assert.equal(serializeProject(restored), serialized);
    const runtime = await createProjectRuntime(restored), run = await renderProject(restored);
    const mod = createGeneratedEffect2D(candidate.plan, candidate.renderOptions);
    const direct = renderSequence({ id: candidate.project.id, file: '', mod, meta: mod.meta }, { fps: 40, seed: 61, bg: 'none', hdr: true, edgeFade: 0 });
    const a = run.sequence.frames[Symbol.iterator](), b = direct.frames[Symbol.iterator]();
    for (let index = 0; ; index++) {
      const x = a.next(), y = b.next(); assert.equal(x.done, y.done); if (x.done) break;
      assert.equal(x.value.t, y.value.t); assert.deepEqual(x.value.clear, y.value.clear);
      if (index % 13 === 0) assert.deepEqual(runtime.render(x.value.t, index, false).rgba, x.value.clear);
    }
    const first = runtime.render(.65, 26, false).rgba.slice(); runtime.render(1.8, 72, false);
    assert.deepEqual(runtime.render(.65, 26, false).rgba, first); runtime.dispose();
  }
  const [old] = prepareGenerationPreview(intent, [61]), [oldSelected] = prepareGenerationPreview(intent, [61], choice);
  for (const candidate of [old, oldSelected]) {
    assert(!Object.hasOwn(candidate.renderOptions, 'fireSparkCount')); assert(!Object.hasOwn(candidate.renderOptions, 'fireSparkLight'));
    assert.doesNotMatch(serializeProject(candidate.project), /fireSparkCount|fireSparkLight/);
    assert.doesNotMatch(meaningTemplate('Old', 'fire', candidate.plan, '2026-11-08T00:00:00Z', candidate === old ? {} : choice), /fireSparkCount|fireSparkLight/);
  }
});

test('real preview export stores explicit zero controls in manifest and project, without art approval', { timeout: 120000 }, () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-spark-controls-preview-'));
  try {
    const output = join(temp, 'selected'), args = [...previewBase, ...flags, '--fire-spark-count', '0', '--fire-spark-light', '0', '--out', output];
    const request = parseGenerationPreviewArgs(args); assert.deepEqual(request.style, { ...choice, fireSparkCount: 0, fireSparkLight: 0 });
    const r = previewCLI(args); assert.equal(r.status, 0, r.stdout + r.stderr);
    const text = readFileSync(join(output, 'manifest.json'), 'utf8'), manifest = JSON.parse(text), c = manifest.candidates[0];
    const project = JSON.parse(readFileSync(join(output, c.directory, 'project.json')));
    assert.deepEqual(c.renderOptions, { composition: 'material-volumes', ...choice, fireSparkCount: 0, fireSparkLight: 0 });
    assert.deepEqual(project.sequence.cues[0].source.renderOptions, c.renderOptions);
    assert.equal(manifest.policy.review, 'not-reviewed'); assert.equal(manifest.policy.userApproval, 'not-recorded');
    assert.equal(manifest.policy.registered, false); assert(existsSync(join(output, c.directory, 'sheet.png')));
    assert.equal(previewCLI(args).status, 1); assert.equal(readFileSync(join(output, 'manifest.json'), 'utf8'), text);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

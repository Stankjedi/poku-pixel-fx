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
const choice = { fireSparks: 'short-exposure', fireSparkFinish: 'scintillation' }, flags = ['--fire-sparks', 'short-exposure', '--fire-spark-finish', 'scintillation'];
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

test('finish flag is explicit, exact and frozen in factory style copies', () => {
  assert(generationStyleFlags.includes('--fire-spark-finish'));
  assert.deepEqual(parseGenerationStyle2D({'--fire-sparks':'short-exposure','--fire-spark-finish':'scintillation'}), choice);
  for (const value of ['', ' ', 'Scintillation', 'sparkle', null, true, 1]) {
    assert.throws(() => parseGenerationStyle2D({'--fire-sparks':'short-exposure','--fire-spark-finish':value}));
    assert.throws(() => generationRenderOptions2D(createGenerationPlan2D(intent), {...choice, fireSparkFinish:value}));
  }
  assert.throws(() => parseGenerationStyle2D({'--fire-spark-finish':'scintillation'}));
  assert.throws(() => generationRenderOptions2D(createGenerationPlan2D(intent), {fireSparkFinish:'scintillation'}));
  const selection = {...choice}, plan = createGenerationPlan2D(intent), opts = generationRenderOptions2D(plan, selection);
  const mod = createGeneratedEffect2D(plan, opts), before = render(mod,.65);
  selection.fireSparkFinish = 'invalid';
  assert(Object.isFrozen(opts)); assert.deepEqual(render(mod,.65), before);
});

test('actual new source emits finish, compiles and matches preview and factory pixels', async () => {
  const temp = fixture();
  try {
    for (const action of ['plume','dash']) {
      const id = `fire/finish-${action}`;
      const r = newCLI(temp,id,['--material','fire','--action',action,'--seed','61',...flags]);
      assert.equal(r.status,0,r.stdout+r.stderr);
      const source = readFileSync(join(temp,'src/fx',id+'.ts'),'utf8');
      assert.match(source,/fireSparkFinish: "scintillation"/);
      const plan = JSON.parse(readFileSync(join(temp,'authoring',id+'.generation.json')));
      assert(!Object.hasOwn(plan.intent,'fireSparkFinish'));
      const file = join(temp,action+'.mjs');
      writeFileSync(file,transformSync(source.replaceAll('../../authoring/',pathToFileURL(join(root,'build/authoring/')).href),{loader:'ts',format:'esm',target:'es2022'}).code);
      const mod = await import(pathToFileURL(file).href);
      const [preview] = prepareGenerationPreview({material:'fire',action},[61],choice);
      const direct = createGeneratedEffect2D(preview.plan,preview.renderOptions);
      for(const t of [.25,.65,1,mod.meta.duration]) assert.deepEqual(render(mod,t),render(direct,t));
    }
  } finally {rmSync(temp,{recursive:true,force:true});}
});

test('finish rejection paths fail before new source, registry or preview writes', {timeout:120000}, () => {
 const temp=fixture(),output=join(temp,'missing-output'),id='fire/invalid-finish';
 try {
  const registry=readFileSync(join(temp,'src/fx/index.ts'),'utf8');
  const cases=[['--fire-spark-finish','scintillation'],['--fire-sparks','short-exposure','--fire-spark-finish'],[...flags,'--fire-spark-finish','scintillation']];
  for(const value of ['', ' ', 'Scintillation','sparkle','0','NaN','--unknown']) cases.push(['--fire-sparks','short-exposure','--fire-spark-finish',value]);
  for(const args of cases) {
   const n=newCLI(temp,id,args);assert.equal(n.status,1,JSON.stringify(args)+n.stderr);
   assert.throws(()=>parseGenerationPreviewArgs([...previewBase,...args,'--out',output]));
   const p=previewCLI([...previewBase,...args,'--out',output]);assert.equal(p.status,1,p.stderr);
   assert(!existsSync(output));
  }
  for(const [material,action,response] of [['energy','plume'],['ice','shatter'],['water','pour'],['lightning','strike']]) {
   const args=['--material',material,'--action',action,...(response?['--response',response]:[]),...flags];
   assert.equal(newCLI(temp,id,args).status,1);
   assert.equal(previewCLI([...args,'--seeds','61','--out',output]).status,1);assert(!existsSync(output));
  }
  for(const mode of ['--minimal','--cinematic','--timing','--loop']) assert.equal(newCLI(temp,id,[...flags,mode]).status,1);
  assert.equal(newCLI(temp,'arcane/invalid-finish',flags).status,1);
  assert.equal(readFileSync(join(temp,'src/fx/index.ts'),'utf8'),registry);
  for(const [dir,ext] of [['src/fx','.ts'],['authoring','.intent.json'],['authoring','.generation.json']]) assert(!existsSync(join(temp,dir,id+ext)));
 } finally {rmSync(temp,{recursive:true,force:true});}
});

test('omitting finish retains byte-exact frozen baseline source and saved project artifacts', async () => {
 const {createHash}=await import('node:crypto');
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const golden=JSON.parse(readFileSync(new URL('./fixtures/spark-finish-route-baseline.json',import.meta.url),'utf8'));
 for(const {action,seed,selection,source,project} of golden.records){
  const [c]=prepareGenerationPreview({material:'fire',action},[seed],selection);
  assert.equal(hash(meaningTemplate('Baseline','fire',c.plan,'2026-11-08T00:00:00Z',selection)),source);
  assert.equal(hash(serializeProject(c.project)),project);
 }
});

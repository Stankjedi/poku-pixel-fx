// Generated source fixtures test contracts only. They are not artistic or user approvals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { createFrame, createFx, Painter } from '../build/core/index.js';
import { cinematicTemplate } from '../build-tools/tools/lib/cinematic-template.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function compiledTemplate(directory, name, loop) {
  const source = cinematicTemplate(name, 'fire', loop).replaceAll('../../core/', pathToFileURL(join(root, 'build/core/')).href);
  const result = transformSync(source, { loader: 'ts', target: 'es2022', format: 'esm' });
  assert.deepEqual(result.warnings, []);
  const file = join(directory, `${name}.mjs`); writeFileSync(file, result.code);
  return import(pathToFileURL(file).href);
}
function draw(module, time, options = {}) {
  const impl = module.create({ ...module.meta.options, ...options });
  const frame = createFrame(...module.meta.size), painter = new Painter(frame).place(...module.meta.origin);
  impl.drawBack?.(painter, time); impl.draw(painter, time); return frame;
}

test('first-generation templates provide all distinct layers, seeded seeking, bounds and empty endings', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-generation-render-'));
  try {
    const module = await compiledTemplate(temp, 'one-shot', false);
    for (const seed of [1, 17, 98]) {
      let visible = 0;
      for (let i = 0; i <= 96; i++) {
        const t = i / 40, frame = draw(module, t, { seed });
        visible += frame.color.some(Boolean) ? 1 : 0;
        for (let x = 0; x < frame.w; x++) for (const y of [0, frame.h - 1]) {
          assert.equal(frame.color[y * frame.w + x], 0, `top/bottom clip at ${t}, seed ${seed}`);
          assert.equal(frame.light[y * frame.w + x], 0);
        }
        for (let y = 0; y < frame.h; y++) for (const x of [0, frame.w - 1]) {
          assert.equal(frame.color[y * frame.w + x], 0, `left/right clip at ${t}, seed ${seed}`);
          assert.equal(frame.light[y * frame.w + x], 0);
        }
      }
      assert.ok(visible > 65, 'most of the authored timeline has visible motion');
      for (const t of [0, module.meta.duration, module.meta.duration + 1]) {
        const frame = draw(module, t, { seed });
        assert.ok(frame.color.every(v => v === 0)); assert.ok(frame.light.every(v => v === 0));
      }
    }
    const target = draw(module, 0.8), impl = module.create(module.meta.options);
    for (const t of [1.8, 0.1, 0.8]) {
      const frame = createFrame(...module.meta.size), painter = new Painter(frame).place(...module.meta.origin);
      impl.drawBack(painter, t); impl.draw(painter, t);
      if (t === 0.8) assert.deepEqual(frame, target);
    }
    const live = createFx(module, { x: module.meta.origin[0], y: module.meta.origin[1] });
    live.update(0.8); const frame = createFrame(...module.meta.size); live.draw(frame);
    assert.deepEqual(frame, target, 'runtime and direct generated module agree');
    assert.notDeepEqual(draw(module, 0.8, { seed: 2 }).color, target.color);
    assert.notDeepEqual(draw(module, 0.8, { palette: ['#123', '#359', '#9ef'] }).color, target.color);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('generated loops retain previous-period particles and match the exact boundary', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-generation-loop-'));
  try {
    const module = await compiledTemplate(temp, 'loop', true), zero = draw(module, 0);
    assert.deepEqual(draw(module, module.meta.duration), zero);
    assert.deepEqual(draw(module, module.meta.duration * 2), zero);
    assert.ok(zero.color.filter(Boolean).length > 30, 'the loop is already populated at its initial frame');
    for (const t of [0.02, 0.7, 1.6, 3.18]) {
      assert.deepEqual(draw(module, t), draw(module, t + module.meta.duration));
      assert.ok(draw(module, t).light.some(Boolean));
    }
    const before = draw(module, module.meta.duration - 0.001), after = draw(module, 0.001);
    const energy = f => f.light.reduce((sum, c) => sum + (c & 255) + (c >>> 8 & 255) + (c >>> 16 & 255), 0);
    assert.ok(Math.abs(energy(before) - energy(after)) / Math.max(energy(before), energy(after)) < 0.08);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('new CLI defaults to layered generation, keeps minimal/timing options, and generated TS typechecks', { timeout: 60000 }, () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-generation-cli-'));
  try {
    for (const directory of ['src', 'build', 'build-tools']) cpSync(join(root, directory), join(temp, directory), { recursive: true });
    for (const file of ['package.json', 'tools/lib/effect-intent.mjs']) {
      const dest = join(temp, file); mkdirSync(join(dest, '..'), { recursive: true }); cpSync(join(root, file), dest);
    }
    const run = (...args) => spawnSync(process.execPath, ['build-tools/tools/new.mjs', ...args], { cwd: temp, encoding: 'utf8' });
    const cases = [['fire/generated-default', []], ['arcane/generated-loop', ['--loop']],
      ['fire/generated-minimal', ['--minimal']], ['fire/generated-timing', ['--timing']],
      ['fire/generated-meaning', ['--material', '화염', '--action', '돌진', '--response', '폭발']],
      ['ice/generated-shatter', ['--material', '얼음', '--action', '파쇄']]];
    const files = [];
    for (const [id, flags] of cases) {
      const result = run(id, ...flags); assert.equal(result.status, 0, result.stderr + result.stdout);
      const file = join(temp, 'src/fx', `${id}.ts`); files.push(file);
      const source = readFileSync(file, 'utf8');
      if (flags.includes('--action') || id === 'fire/generated-default') {
        assert.match(source, /createGeneratedEffect2D/);
        const plan = JSON.parse(readFileSync(join(temp, 'authoring', `${id}.generation.json`)));
        if (id === 'fire/generated-default') {
          assert.equal(plan.intent.material, 'fire'); assert.equal(plan.intent.action, 'plume');
          assert.equal(plan.intent.response, 'dissipate'); assert.match(result.stdout, /카테고리 시작 예제/);
        } else if (id.startsWith('ice/')) {
          assert.equal(plan.intent.material, 'ice'); assert.equal(plan.intent.action, 'shatter');
          assert.equal(plan.events.find(e => e.kind === 'shatter').at, plan.timing.release);
        } else {
          assert.equal(plan.intent.material, 'fire'); assert.equal(plan.intent.action, 'dash'); assert.equal(plan.intent.response, 'burst');
          assert.equal(plan.events.find(e => e.kind === 'burst').at, plan.timing.arrival);
        }
      } else if (!flags.includes('--minimal') && !flags.includes('--timing')) {
        assert.match(source, /createCinematicParticles2D/);
        assert.match(source, /addedAt: "\d{4}-\d{2}-\d{2}T[^\"]+"/);
      }
      assert.ok(existsSync(join(temp, 'authoring', `${id}.intent.json`)));
      const intent = JSON.parse(readFileSync(join(temp, 'authoring', `${id}.intent.json`)));
      assert.equal(intent.intent.oneSentence, '', 'generator must not invent review evidence or intent');
      assert.equal(run(id, ...flags).status, 1, 'existing effects are not overwritten');
    }
    for (const flags of [['--bogus'], ['--minimal', '--timing'], ['--loop', '--timing'], ['--minimal', '--cinematic'], ['--timing', '--cinematic'],
      ['--action', 'dash'], ['--material', 'ice', '--action', 'dash'], ['--material', 'fire', '--action', 'shatter'], ['--material', 'fire', '--action', '폭발 없이'], ['--material', 'fire', '--action', 'dash', '--loop'],
      ['--material', 'fire', '--action', 'dash', '--response'], ['--material', 'fire', '--action', 'dash', '--action', 'burst']])
      assert.equal(run('fire/invalid-generation', ...flags).status, 1);
    assert.equal(existsSync(join(temp, 'src/fx/fire/invalid-generation.ts')), false);
    assert.equal(existsSync(join(temp, 'authoring/fire/invalid-generation.intent.json')), false);
    assert.equal(existsSync(join(temp, 'authoring/fire/invalid-generation.generation.json')), false);
    const protectedPlan = join(temp, 'authoring/fire/protected-generation.generation.json');
    writeFileSync(protectedPlan, '{"existing":"preserve"}\n');
    const registryBefore = readFileSync(join(temp, 'src/fx/index.ts'), 'utf8');
    assert.equal(run('fire/protected-generation', '--material', 'fire', '--action', 'dash').status, 1);
    assert.equal(readFileSync(protectedPlan, 'utf8'), '{"existing":"preserve"}\n');
    assert.equal(readFileSync(join(temp, 'src/fx/index.ts'), 'utf8'), registryBefore);
    assert.equal(existsSync(join(temp, 'src/fx/fire/protected-generation.ts')), false);
    const checked = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext', ...files], { cwd: temp, encoding: 'utf8', timeout: 30000 });
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('default starter primary follows the path tangent, even at a resting endpoint', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-generation-primary-'));
  try {
    const loop = await compiledTemplate(temp, 'direction-loop', true), one = await compiledTemplate(temp, 'direction-one', false);
    const primary = (module,t) => {
      const f=createFrame(...module.meta.size),p=new Painter(f).place(...module.meta.origin);
      // Only the direct shade call is the new primary body. Other decoration calls are inert.
      const isolated = new Proxy(p,{get(target,key){const value=Reflect.get(target,key);return typeof value==='function' ? key==='shade'?value.bind(target):()=>undefined : value;}});
      module.create(module.meta.options).draw(isolated,t);return f;
    };
    const bounds = f => {let minX=f.w,minY=f.h,maxX=-1,maxY=-1;for(let i=0;i<f.color.length;i++)if(f.color[i]>>>24){const x=i%f.w,y=Math.floor(i/f.w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}return {w:maxX-minX+1,h:maxY-minY+1}};
    const down=bounds(primary(loop,0)),left=bounds(primary(loop,.8));
    assert.ok(down.h>down.w*1.5,'loop starts with a downward-facing primary, not a right-facing sticker');
    assert.ok(left.w>left.h*1.5,'quarter-turn primary follows the leftward tangent');
    assert.ok(primary(one,1.4).color.some(Boolean),'resting endpoint still has a defined primary pose');
  } finally {rmSync(temp,{recursive:true,force:true})}
});

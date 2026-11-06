import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const flags = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs, []));
if (!flags.baseline) throw new Error('Usage: node tools/verify-pixel-art-preservation.mjs --baseline /path/to/built/baseline [--report path.json]');
const baseline = resolve(flags.baseline), candidate = resolve('.');
const load = file => import(pathToFileURL(file).href);
const [oldCore, newCore, oldTools, newTools] = await Promise.all([
  load(`${baseline}/build/core/index.js`), load(`${candidate}/build/core/index.js`),
  load(`${baseline}/build-tools/tools/lib/fxlib.mjs`), load(`${candidate}/build-tools/tools/lib/fxlib.mjs`),
]);
const ids = oldTools.allIds();
assert.deepEqual(newTools.allIds(), ids);
const chunkDir = `${candidate}/site/public/effects/chunks`;
let bundleRegistry;
for (const name of await readdir(chunkDir)) {
  if (!name.startsWith('chunk-') || !name.endsWith('.js')) continue;
  const source = await readFile(resolve(chunkDir, name), 'utf8');
  if (source.includes('var effectLoaders = {')) {
    bundleRegistry = Object.fromEntries([...source.matchAll(/"([a-z0-9-]+\/[a-z0-9-]+)": \(\) => import\("([^"]+)"\)/g)].map(m => [m[1], resolve(chunkDir, m[2])]));
    break;
  }
}
assert.ok(bundleRegistry, 'Prepared gallery must include its dynamic effect registry');
assert.deepEqual(Object.keys(bundleRegistry).sort(), [...ids].sort());

const totals = { effects: ids.length, frames: 0, comparedChannels: ['native color', 'packed light', 'HDR light', 'composited RGBA'], variants: ['baseline library', 'candidate library', 'candidate prepared public bundle'], mismatches: [], errors: [], effectsChecked: [] };
const digest = createHash('sha256');
const bytes = typed => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
const began = performance.now();
for (const id of ids) {
  try {
    const [oldFx, newFx, bundled] = await Promise.all([oldTools.loadEffect(id), newTools.loadEffect(id), load(bundleRegistry[id])]);
    assert.deepEqual(newFx.meta, oldFx.meta, `${id}: source metadata`);
    assert.deepEqual({ fps: 30, bg: 'dark', loop: false, duration: 1, tags: [], options: {}, ...bundled.meta }, newFx.meta, `${id}: bundled metadata`);
    const meta = oldFx.meta, options = { x: meta.origin[0], y: meta.origin[1] };
    const runs = [[oldCore, oldFx.mod], [newCore, newFx.mod], [newCore, bundled]].map(([core, mod]) => {
      const frame = core.createFrame(...meta.size);
      core.enableHDRLight(frame);
      return { core, instance: core.createFx(mod, options), frame };
    });
    const times = [0, meta.duration * .17, meta.duration * .5, meta.duration * .83, Math.max(0, meta.duration - 1 / 60)].sort((a, b) => a - b);
    let priorTime = 0;
    const effectHash = createHash('sha256');
    for (const time of times) {
      for (const run of runs) {
        run.instance.update(time - priorTime);
        run.core.clearFrame(run.frame);
        run.instance.draw(run.frame);
        run.rgba = run.core.composite(run.frame, new Uint8ClampedArray(run.frame.w * run.frame.h * 4), null);
      }
      for (const key of ['color', 'light', 'hdrLight']) {
        const expected = bytes(runs[0].frame[key]);
        for (let variant = 1; variant < runs.length; variant++) {
          if (!expected.equals(bytes(runs[variant].frame[key]))) totals.mismatches.push({ id, time, channel: key, variant: totals.variants[variant] });
        }
        effectHash.update(expected);
      }
      const expectedRGBA = bytes(runs[0].rgba);
      for (let variant = 1; variant < runs.length; variant++) {
        if (!expectedRGBA.equals(bytes(runs[variant].rgba))) totals.mismatches.push({ id, time, channel: 'composited RGBA', variant: totals.variants[variant] });
      }
      effectHash.update(expectedRGBA);
      totals.frames++;
      priorTime = time;
    }
    const hash = effectHash.digest('hex');
    digest.update(id); digest.update(hash);
    totals.effectsChecked.push({ id, times, hash });
    if (totals.effectsChecked.length % 50 === 0) console.log(`Compared ${totals.effectsChecked.length}/${ids.length} effects`);
  } catch (error) {
    totals.errors.push({ id, error: String(error.stack || error) });
    console.error(`${id}: ${String(error)}`);
  }
}
totals.aggregateSHA256 = digest.digest('hex');
totals.elapsedSeconds = (performance.now() - began) / 1000;
totals.baselineCommit = execFileSync('git', ['-C', baseline, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
totals.scope = 'Five deterministic sample times per effect at default settings, with opt-in HDR enabled; samples compare native color, packed light, HDR light and composite RGBA. This is preservation evidence, not aesthetic certification or exhaustive all-frame/all-option proof.';
await writeFile(resolve(flags.report ?? 'docs/validation/pixel-art-pro-preservation-2026-11-06.json'), JSON.stringify(totals, null, 2) + '\n');
console.log(JSON.stringify({ ...totals, effectsChecked: totals.effectsChecked.length }, null, 2));
if (totals.mismatches.length || totals.errors.length) process.exitCode = 1;

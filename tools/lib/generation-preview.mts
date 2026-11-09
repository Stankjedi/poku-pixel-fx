/** Bounded CLI orchestration of the existing generation -> sequence -> export path.
 * No new renderer, artwork defaults, seed search, review decision or catalog mutation. */
import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { GenerationIntent2D } from '../../src/authoring/generation.js';
import { parseGenerationStyle2D, generationRenderOptions2D, generationStyleFlags, type GenerationStyleSelection2D } from './generation-style.mjs';
import { parseGenerationControls2D } from './generation-controls.mjs';
import { parseGIFBackground, flattenGIFPreviewRGBA } from './gif-background.mjs';
import { renderProject } from './project-render.mjs';
import { createContactSheet, createSpriteSheet, writeVideos, pickFrames } from './fxlib.mjs';
const { createGenerationPlan2D, createGeneratedEffect2D, parseGenerationMeaning2D } = await import(new URL('../../../build/authoring/generation.js', import.meta.url).href);
const { createSequenceSpec } = await import(new URL('../../../build/authoring/sequence.js', import.meta.url).href);
const { createProject, serializeProject } = await import(new URL('../../../build/authoring/project.js', import.meta.url).href);

export const previewGenerationHelp = `Preview supported generation before creating a catalog effect:
  poku-fx preview-generation --material fire --action plume --seeds 0,17 --out NEW_DIRECTORY [--gif]
  node build-tools/tools/preview-generation.mjs --material ice --action shatter --seeds 0,17 --out NEW_DIRECTORY
Required: --material, --action, --seeds (1–4 distinct uint32 decimals), --out (must not exist; parent must exist).
Optional: --response burst|dissipate; dash only: --distance 24..160 --travel .25..3; --gif (requires ffmpeg).
With --gif: --gif-background '#15131d' composites only the GIF over an explicit #RRGGBB backing before palette encoding. PNGs, contact sheet and saved project remain unchanged.
Opt-in: --fire-sparks short-exposure, only fire burst, plume, or dash (either response). Omission keeps previous artwork.
With that selection: --fire-spark-count 0..720 (integer births), --fire-spark-light 0..2 (spark glow only), --fire-spark-finish scintillation (seeded short glints).
Dash+burst default: 410 total (240 flight + 170 arrival); explicit total N splits round(N*240/410) / remainder. Count 1 has no arrival spark. Shared light-ID ceiling: 24.
Exact supported aliases and artwork choices match new.mjs. No free-text interpretation or automatic selection.
Native dimensions, source fps, uncropped source-duration sampling, transparent PNG, no crop/scale/edge fade. GIF is a lossy palette/alpha preview that repeats indefinitely.
The saved projects can use render/review/share; create and complete an intent brief separately before review. No intent/review record is written. Nothing is approved or registered.`;

export function parseGenerationPreviewArgs(args: readonly string[]) {
  const flags: Record<string, string> = {}; let gif = false;
  const names = ['--material', '--action', '--response', '--seeds', '--out', '--distance', '--travel', '--gif-background', ...generationStyleFlags];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--gif' && !gif) { gif = true; continue; }
    if (!names.includes(flag) || Object.hasOwn(flags, flag)) throw new RangeError(`Unknown or repeated preview option: ${flag}`);
    const value = args[++i];
    if (value === undefined || value.startsWith('--') || !value.trim()) throw new TypeError(`${flag} requires a value`);
    flags[flag] = value;
  }
  for (const flag of ['--material', '--action', '--seeds', '--out']) if (!Object.hasOwn(flags, flag)) throw new TypeError(`${flag} is required`);
  const words = flags['--seeds'].split(',');
  if (words.length < 1 || words.length > 4 || words.some(s => !/^(0|[1-9]\d*)$/.test(s))) throw new RangeError('--seeds requires 1–4 comma-separated uint32 decimals');
  const seeds = words.map(Number);
  if (seeds.some(s => !Number.isSafeInteger(s) || s > 0xffffffff) || new Set(seeds).size !== seeds.length) throw new RangeError('--seeds must be distinct uint32 values');
  if (Object.hasOwn(flags, '--gif-background') && !gif) throw new RangeError('--gif-background requires --gif');
  const gifBackground = Object.hasOwn(flags, '--gif-background') ? parseGIFBackground(flags['--gif-background']).color : undefined;
  const controls = Object.fromEntries(['--distance', '--travel'].filter(k => Object.hasOwn(flags, k)).map(k => [k, flags[k]]));
  const intent = { ...parseGenerationMeaning2D(flags['--material'], flags['--action'], flags['--response']), ...parseGenerationControls2D(controls) };
  // Validate action/control conflicts before touching any directory or starting a renderer.
  const plan = createGenerationPlan2D(intent);
  const style = parseGenerationStyle2D(Object.fromEntries(generationStyleFlags.filter(k => Object.hasOwn(flags, k)).map(k => [k, flags[k]])));
  generationRenderOptions2D(plan, style);
  return { intent, seeds, output: resolve(flags['--out']), gif, ...(gifBackground ? { gifBackground } : {}), ...(style.fireSparks ? { style } : {}) };
}

function freeze<T>(input: T): T {
  if (input && typeof input === 'object') { for (const value of Object.values(input)) freeze(value); Object.freeze(input); }
  return input;
}

/** Detach and freeze the explicit request. Exact cue seeds avoid parent/cue-id seed derivation. */
export function prepareGenerationPreview(intent: Omit<GenerationIntent2D, 'seed'>, seeds: readonly number[], style: GenerationStyleSelection2D = {}) {
  if (!intent || typeof intent !== 'object' || Object.hasOwn(intent, 'seed')) throw new TypeError('Supply seeds only in the explicit seed list');
  if (!Array.isArray(seeds) || !seeds.length || seeds.length > 4 || new Set(seeds).size !== seeds.length
    || seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)) throw new RangeError('Use 1–4 distinct seeds');
  return freeze(seeds.map(seed => {
    const plan = createGenerationPlan2D({ ...intent, seed });
    // Same creation policy as meaningTemplate, not the legacy API's implicit body artwork.
    const renderOptions = generationRenderOptions2D(plan, style);
    const mod = createGeneratedEffect2D(plan, renderOptions), { seed: _seed, ...meaning } = plan.intent;
    const id = `preview/${plan.intent.material}-${plan.intent.action}-seed-${seed}`;
    const project = createProject({ id, kind: 'sequence', seed, fps: mod.meta.fps, bg: 'none', actor: false, target: false,
      pixelStyle: { edgeFade: 0 },
      sequence: createSequenceSpec({ size: [...plan.size], origin: [...plan.origin],
        cues: [{ id: 'main', seed, source: { kind: 'generation', intent: meaning, renderOptions } }] }) });
    return { seed, plan, renderOptions, project };
  }));
}

/** A single frame traversal per seed feeds all requested sinks. Manifest is written last. */
export async function writeGenerationPreview(request: ReturnType<typeof parseGenerationPreviewArgs>) {
  if (request.gifBackground !== undefined && !request.gif) throw new RangeError('--gif-background requires --gif');
  const gifBackground = request.gifBackground === undefined ? undefined : parseGIFBackground(request.gifBackground);
  const started = performance.now(), candidates = prepareGenerationPreview(request.intent, request.seeds, request.style), planningMs = performance.now() - started;
  const output = resolve(request.output), gif = request.gif;
  if (lstatSync(output, { throwIfNoEntry: false })) throw new Error(`EEXIST: output already exists: ${output}`);
  const prepared = [];
  for (const candidate of candidates) {
    const begin = performance.now(), run = await renderProject(candidate.project);
    prepared.push({ candidate, run, setupMs: performance.now() - begin });
  }
  // Exclusive mkdir also rejects files, symlinks (including dangling ones), and empty directories.
  // A failed export leaves a visibly incomplete directory without a success manifest; never overwrite it.
  mkdirSync(output);
  try {
    const manifest: Record<string, any> = {
      schema: 'poku.generation-preview/v1', planningMs, intent: { ...candidates[0].plan.intent, seed: undefined }, seeds: candidates.map(candidate => candidate.seed),
      policy: { artwork: 'new.mjs supported semantic creation', nativeSize: true, nativeFps: true, fullDeclaredDuration: true, samplePolicy: 'round(sourceDuration * nativeFps) + 1',
        edgeFade: 0, scale: 1, cropped: false, transparentPNG: true, registered: false, ranked: false,
        review: 'not-reviewed', userApproval: 'not-recorded',
        ...(gifBackground ? { gifBackground: gifBackground.color, gifComposition: 'straight encoded-RGB source-over before GIF palette encoding; opaque preview only' } : {}), gif: gif ? 'repeats indefinitely; palette/alpha-limited preview, not exact PNG pixels' : 'not-requested' },
      candidates: [],
    };
    for (const { candidate, run, setupMs } of prepared) {
      const { seed, plan, project, renderOptions } = candidate, { fx, sequence } = run;
      const dir = join(output, `seed-${seed}`); mkdirSync(dir);
      const files: Record<string, { bytes: number; sha256: string }> = {};
      let writeMs = 0;
      const write = (name: string, bytes: string | Uint8Array) => {
        const start = performance.now(); writeFileSync(join(dir, name), bytes, { flag: 'wx' }); writeMs += performance.now() - start;
        files[name] = { bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
      };
      const contact = createContactSheet(fx, sequence, { max: 8, zoom: 1 });
      const sheet = createSpriteSheet(fx, sequence, 'sheet');
      let renderMs = 0, sinkMs = 0, count = 0;
      function* frames() {
        const iterator = sequence.frames[Symbol.iterator]();
        while (true) {
          const begin = performance.now(), item = iterator.next(); renderMs += performance.now() - begin;
          if (item.done) break;
          const sink = performance.now(); contact.push(item.value, count); sheet.push(item.value, count++); sinkMs += performance.now() - sink;
          yield gifBackground ? { ...item.value, color: flattenGIFPreviewRGBA(item.value.color, gifBackground.rgb) } : item.value;
        }
      }
      const runStart = performance.now();
      if (gif) {
        if (!writeVideos([{ file: join(dir, 'anim.gif'), scale: 1, loops: 1 }], { ...sequence, frames: frames() })) throw new Error('GIF requires ffmpeg on PATH; incomplete output has no manifest.json');
      } else for (const _ of frames()) { /* existing sinks own encoding */ }
      const traversalMs = performance.now() - runStart;
      const encode = performance.now(), atlas = sheet.result(), contactPNG = contact.png(), encodeMs = performance.now() - encode;
      write('sheet.png', atlas.png); write('sheet.json', JSON.stringify(atlas.json, null, 2) + '\n'); write('contact.png', contactPNG);
      write('project.json', serializeProject(project)); write('generation.json', JSON.stringify(plan, null, 2) + '\n');
      if (gif) {
        const { readFileSync } = await import('node:fs'); const bytes = readFileSync(join(dir, 'anim.gif'));
        files['anim.gif'] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      }
      manifest.candidates.push({ seed, directory: `seed-${seed}`, projectSha256: run.variant, renderOptions,
        size: [sequence.w, sequence.h], pivot: sequence.pivot, fps: sequence.fps, frames: sequence.n,
        sourceDuration: fx.meta.duration, lastSampleTime: (sequence.n - 1) / sequence.fps, outputDuration: sequence.n / sequence.fps, contactFrames: pickFrames(sequence.n, 8), files,
        costMs: { setup: setupMs, renderAndComposite: renderMs, contactAndSheetCopy: sinkMs, pngEncode: encodeMs,
          writes: writeMs, videoAndTraversalOverhead: Math.max(0, traversalMs - renderMs - sinkMs) } });
    }
    manifest.elapsedMs = performance.now() - started;
    writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return { output, manifest };
  } catch (error) {
    throw new Error(`Incomplete preview at ${output}; no complete manifest.json. ${error instanceof Error ? error.message : String(error)}`);
  }
}

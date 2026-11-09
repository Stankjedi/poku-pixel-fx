// Workflow fidelity only. These assertions cannot judge artistic quality or authorize sharing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { parseGenerationPreviewArgs, prepareGenerationPreview } from '../build-tools/tools/lib/generation-preview.mjs';
import { createGeneratedEffect2D, resolveGenerationPlan2D } from '../build/authoring/generation.js';
import { createProjectRuntime } from '../build/authoring/runtime.js';
import { renderProject } from '../build-tools/tools/lib/project-render.mjs';
import { renderSequence } from '../build-tools/tools/lib/fxlib.mjs';
import { meaningTemplate } from '../build-tools/tools/lib/meaning-template.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const cli = (args, env = {}) => spawnSync(process.execPath, ['tools/poku.mjs', 'preview-generation', ...args], { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, ...env } });
const base = ['--material', 'lightning', '--action', 'strike', '--seeds', '0'];
function inventory() {
  const files = {};
  for (const dir of ['src/fx', 'authoring']) {
    const walk = path => { for (const ent of readdirSync(path, { withFileTypes: true })) { const file = join(path, ent.name); if (ent.isDirectory()) walk(file); else files[file] = sha(readFileSync(file)); } };
    walk(join(root, dir));
  }
  return files;
}
function decode(png) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), blocks = [];
  for (let offset = 8; offset < png.length;) { const n = png.readUInt32BE(offset); if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') blocks.push(png.subarray(offset + 8, offset + 8 + n)); offset += n + 12; }
  const raw = inflateSync(Buffer.concat(blocks)), rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) { assert.equal(raw[y * (w * 4 + 1)], 1); for (let x = 0; x < w * 4; x++) rgba[y * w * 4 + x] = (raw[y * (w * 4 + 1) + 1 + x] + (x < 4 ? 0 : rgba[y * w * 4 + x - 4])) & 255; }
  return { w, h, rgba };
}
function cell(image, rect) {
  const result = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) result.set(image.rgba.subarray(((rect.y + y) * image.w + rect.x) * 4, ((rect.y + y) * image.w + rect.x + rect.w) * 4), y * rect.w * 4);
  return result;
}

test('strict bounded parser and prepared canonical projects preserve exact explicit seed ownership', () => {
  const args = parseGenerationPreviewArgs(['--material', '에너지', '--action', '돌진', '--seeds', '0,4294967295', '--distance', '64', '--travel', '.45', '--out', '/tmp/example']);
  const frozen = prepareGenerationPreview(args.intent, args.seeds);
  args.intent.distance = 160; args.seeds[0] = 99;
  assert.deepEqual(frozen.map(c => c.seed), [0, 0xffffffff]);
  assert.equal(frozen[0].project.sequence.cues[0].source.intent.distance, 64);
  assert(Object.isFrozen(frozen)); assert(Object.isFrozen(frozen[0].project.sequence.cues[0].source.intent));
  for (const candidate of frozen) {
    assert.equal(candidate.project.sequence.cues[0].seed, candidate.seed);
    assert(!Object.hasOwn(candidate.project.sequence.cues[0].source.intent, 'seed'));
    assert.equal(candidate.project.fps, 40);
    assert.deepEqual(candidate.project.sequence.size, candidate.plan.size);
    assert.deepEqual(candidate.project.sequence.origin, candidate.plan.origin);
    assert.equal(candidate.project.pixelStyle.edgeFade, 0);
    assert.match(meaningTemplate('Preview', 'scifi', candidate.plan), /composition: "material-volumes"/);
  }
  assert.throws(() => prepareGenerationPreview({ material: 'fire', action: 'plume', seed: 4 }, [0]));
  for (const seeds of [[], [1, 1], [1, 2, 3, 4, 5], [-1], [0x100000000], [NaN], [1.5], [undefined], [null]]) assert.throws(() => prepareGenerationPreview({ material: 'fire', action: 'plume' }, seeds));
});

test('actual public checkout launcher rejects malformed/conflicting requests before output and never overwrites paths', { timeout: 60000 }, () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-preview-invalid-')), before = inventory();
  try {
    const out = join(temp, 'new');
    const invalid = [[], base.slice(0, -1), [...base, '--seed', '2'], [...base, '--fps', '12'], [...base, '--loop'], [...base, '--gif', '--gif'],
      [...base, '--seeds', '17'], [...base, '--out', 'other'], [...base, '--material', 'fire'], [...base, '--action', 'strike'],
      ...['', ' ', '1,1', '0,00', '1,2,3,4,5', '1,', ',1', 'NaN', '-1', '0x10', '1e2', '4294967296', '1.5', '0, 1'].map(value => [...base.slice(0, -1), value]),
      ['--material', 'water', '--action', 'dash', '--seeds', '0'], ['--material', 'phoenix', '--action', 'plume', '--seeds', '0'],
      [...base, '--distance', '64'], [...base, '--response', 'burst'], [...base, '--travel', 'NaN'], [...base, 'extra']];
    for (const args of invalid) { const r = cli([...args, '--out', out]); assert.equal(r.status, 1, JSON.stringify(args) + r.stdout + r.stderr); assert.equal(r.signal, null); assert(!existsSync(out)); }
    for (const kind of ['file', 'directory', 'symlink', 'dangling']) {
      const target = join(temp, kind);
      if (kind === 'file') writeFileSync(target, 'preserve');
      else if (kind === 'directory') { mkdirSync(target); writeFileSync(join(target, 'sentinel'), 'preserve'); }
      else symlinkSync(join(temp, kind === 'symlink' ? 'file' : 'absent'), target);
      const r = cli([...base, '--out', target]); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, /EEXIST/);
    }
    assert.equal(readFileSync(join(temp, 'file'), 'utf8'), 'preserve'); assert.equal(readFileSync(join(temp, 'directory/sentinel'), 'utf8'), 'preserve');
    const r = cli([...base, '--out', join(temp, 'missing/child')]); assert.equal(r.status, 1); assert(!existsSync(join(temp, 'missing')));
    assert.deepEqual(inventory(), before);
    const help = cli(['--help']); assert.equal(help.status, 0); assert.match(help.stdout, /1–4/);
    const existing = spawnSync(process.execPath, ['tools/poku.mjs', '--help'], { cwd: root, encoding: 'utf8' }); assert.equal(existing.status, 0); assert.match(existing.stdout, /poku-fx render category/);
    const version = spawnSync(process.execPath, ['tools/poku.mjs', '--version'], { cwd: root, encoding: 'utf8' }); assert.equal(version.status, 0); assert.equal(version.stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'))).version);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('two material CLI batches produce exact reusable native exports and deterministic reverse seeks', { timeout: 120000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-preview-output-')), before = inventory();
  try {
    for (const [material, action, seeds] of [['energy', 'dash', '0,4294967295'], ['ice', 'shatter', '0,17']]) {
      const out = join(temp, material), r = cli(['--material', material, '--action', action, '--seeds', seeds, '--out', out]);
      assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(r.signal, null);
      const manifest = JSON.parse(readFileSync(join(out, 'manifest.json')));
      assert.equal(manifest.policy.ranked, false); assert.equal(manifest.policy.review, 'not-reviewed');
      let comparison;
      for (const item of manifest.candidates) {
        const dir = join(out, item.directory), project = JSON.parse(readFileSync(join(dir, 'project.json'))), plan = resolveGenerationPlan2D(JSON.parse(readFileSync(join(dir, 'generation.json'))));
        assert(!existsSync(join(dir, 'intent.json'))); assert(!Object.hasOwn(project, 'intentRef'));
        for (const [file, meta] of Object.entries(item.files)) { const bytes = readFileSync(join(dir, file)); assert.equal(bytes.length, meta.bytes); assert.equal(sha(bytes), meta.sha256); }
        assert.equal(sha(readFileSync(join(dir, 'project.json'))), item.projectSha256);
        const shared = [item.size, item.pivot, item.frames, item.fps, item.contactFrames, item.sourceDuration, item.lastSampleTime];
        if (comparison) assert.deepEqual(shared, comparison); else comparison = shared;
        const image = decode(readFileSync(join(dir, 'sheet.png'))), atlas = JSON.parse(readFileSync(join(dir, 'sheet.json')));
        const run = await renderProject(project), directMod = createGeneratedEffect2D(plan, item.renderOptions);
        const direct = renderSequence({ id: project.id, file: '', mod: directMod, meta: directMod.meta }, { fps: directMod.meta.fps, seed: item.seed, bg: 'none', hdr: true, edgeFade: 0 });
        assert.deepEqual([run.sequence.w, run.sequence.h, run.sequence.fps, run.sequence.n], [direct.w, direct.h, direct.fps, direct.n]);
        const a = run.sequence.frames[Symbol.iterator](), b = direct.frames[Symbol.iterator](); let i = 0, partial = false;
        while (true) {
          const x = a.next(), y = b.next(); assert.equal(x.done, y.done); if (x.done) break;
          assert.equal(x.value.t, y.value.t); assert.deepEqual(x.value.clear, y.value.clear, `${material}/${item.seed} direct ${i}`);
          assert.deepEqual(cell(image, atlas.frames[i].frame), x.value.clear, `${material}/${item.seed} PNG ${i}`);
          for (let p = 3; p < x.value.clear.length; p += 4) if (x.value.clear[p] > 0 && x.value.clear[p] < 255) partial = true;
          i++;
        }
        assert.equal(i, item.frames); assert(partial, 'exact PNG retains partial alpha');
        const runtime = await createProjectRuntime(project);
        for (const time of [.8, .2, 1.1, .6, plan.timing.end]) {
          const actual = runtime.render(time, undefined, false), fresh = await createProjectRuntime(project), expected = fresh.render(time, undefined, false);
          assert.deepEqual(actual.rgba, expected.rgba); assert.deepEqual(actual.frame.color, expected.frame.color); assert.deepEqual(actual.frame.light, expected.frame.light); assert.deepEqual(actual.frame.hdrLight, expected.frame.hdrLight); fresh.dispose();
        }
        runtime.dispose();
      }
      const prior = sha(readFileSync(join(out, 'manifest.json'))); assert.equal(cli(['--material', material, '--action', action, '--seeds', seeds, '--out', out]).status, 1); assert.equal(sha(readFileSync(join(out, 'manifest.json'))), prior);
    }
    assert.deepEqual(inventory(), before);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('late optional GIF failure is nonzero and leaves only owned incomplete output without success manifest', () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-preview-gif-'));
  try {
    const out = join(temp, 'incomplete'), r = cli([...base, '--out', out, '--gif'], { PATH: temp });
    assert.equal(r.status, 1); assert.match(r.stderr, /GIF requires ffmpeg/); assert(existsSync(out)); assert(!existsSync(join(out, 'manifest.json')));
    assert.equal(cli([...base, '--out', out]).status, 1);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

/** Evidence and an explicit review record, never an automatic aesthetic score. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canvas, upscale, spriteSheet, type EffectData, type RenderResult } from './fxlib.mjs';

export const REVIEW_SCHEMA = 'poku-visual-review/v1';
export const REVIEW_FILES = ['scene-native.png', 'scene-3x.png', 'export-dark.png', 'export-light.png',
  'export-checker.png', 'values.png', 'silhouette.png', 'playback.html'] as const;
export const REVIEW_TOPICS = ['nativeAndZoom', 'silhouetteAndValues', 'timing', 'backgrounds'] as const;
export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
/** The exact bytes written beside a shared PNG, used for both hashing and delivery. */
export const serializeSharedJSON = (value: unknown) => JSON.stringify(value, null, 1);

export interface ReviewIdentity {
  id: string;
  sourceSha256: string;
  pngSha256: string;
  jsonSha256: string;
  sceneSha256: string;
  fingerprint: string;
}
export interface ReviewManifest {
  schema: string;
  identity: ReviewIdentity;
  size: [number, number]; fps: number; frames: number; loop: boolean;
  samples: Array<{ frame: number; time: number; reasons: string[] }>;
  evidence: Record<string, string>;
}
export interface ReviewRecord {
  schema: string; fingerprint: string; manifestSha256: string;
  reviewer: string; reviewedAt: string; evidenceViewed: boolean;
  decision: 'ready' | 'needs-work'; intent: string;
  observations: Record<typeof REVIEW_TOPICS[number], string>;
  knownLimitations: string;
}

/** Bind to the actual exported PNG/JSON and the preview, including timing and pivot. */
export function reviewIdentity(fx: EffectData, result: RenderResult, sheet: ReturnType<typeof spriteSheet>, source: string): ReviewIdentity {
  const scene = createHash('sha256');
  scene.update(JSON.stringify([result.w, result.h, result.fps, result.frames.map(f => f.t)]));
  for (const f of result.frames) scene.update(f.color);
  const data = { id: fx.id, sourceSha256: sha256(source), pngSha256: sha256(sheet.png),
    jsonSha256: sha256(serializeSharedJSON(sheet.json)), sceneSha256: scene.digest('hex') };
  return { ...data, fingerprint: sha256(JSON.stringify(data)) };
}

/** Sparse, explainable time samples. These are cues for inspection, not quality measurements. */
export function reviewSamples(result: RenderResult): ReviewManifest['samples'] {
  const frames = result.frames, n = frames.length;
  if (!n) throw new RangeError('Review needs at least one frame');
  const picks = new Map<number, string[]>();
  const add = (i: number, why: string) => {
    const frame = Math.max(0, Math.min(n - 1, i));
    picks.set(frame, [...(picks.get(frame) ?? []), why]);
  };
  add(0, 'first'); add(n - 1, 'last');
  for (const fraction of [0.25, 0.5, 0.75]) add(Math.round((n - 1) * fraction), 'timeline');
  let peak = 0, energy = -1;
  frames.forEach((f, i) => {
    let sum = 0;
    for (let j = 0; j < f.clear.length; j += 4)
      sum += (f.clear[j] + f.clear[j + 1] + f.clear[j + 2]) * f.clear[j + 3];
    if (sum > energy) { energy = sum; peak = i; }
  });
  // Include a one-frame flash and its neighbours even when uniform samples miss it.
  add(peak - 1, 'before-brightest'); add(peak, 'brightest'); add(peak + 1, 'after-brightest');
  // The complete timeline remains available even for effects with many contacts.
  for (const contact of (result.contacts ?? []).slice(0, 4)) {
    const at = (contact as { at?: number }).at;
    if (typeof at === 'number' && Number.isFinite(at)) {
      const closest = frames.reduce((best, f, i) => Math.abs(f.t - at) < Math.abs(frames[best].t - at) ? i : best, 0);
      add(closest, 'authored-contact');
    }
  }
  return [...picks].sort(([a], [b]) => a - b).map(([frame, reasons]) => ({ frame, time: frames[frame].t, reasons }));
}

/** Match the current sprite-sheet writer exactly, including its transparent-canvas compositing. */
export function exportedFrame(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const frame = canvas(w, h, [0, 0, 0, 0]);
  frame.paste(rgba, w, h, 0, 0);
  return frame.data;
}

export function reviewView(rgba: Uint8ClampedArray, w: number, mode: 'dark' | 'light' | 'checker' | 'values' | 'silhouette', raw?: Uint32Array) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const pixel = i / 4, a = rgba[i + 3] / 255;
    if (mode === 'silhouette') {
      // Color-buffer occupancy, without bloom. For custom raster inputs use exported alpha.
      const occupied = raw ? (raw[pixel] >>> 24) > 0 : a > 0;
      out.set(occupied ? [245, 245, 245, 255] : [28, 28, 28, 255], i);
      continue;
    }
    const background = mode === 'light' ? 238 : mode === 'checker'
      ? (((pixel % w) >> 3) + ((Math.floor(pixel / w)) >> 3)) % 2 ? 190 : 224
      : mode === 'values' ? 96 : 20;
    const rgb = [0, 1, 2].map(c => rgba[i + c] * a + background * (1 - a));
    if (mode === 'values') {
      // Rec.709-weighted encoded RGB, a viewing aid rather than a contrast/accessibility score.
      const value = Math.round(rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722);
      out.set([value, value, value, 255], i);
    } else out.set([...rgb, 255], i);
  }
  return out;
}

const htmlEscape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function playbackPage(fx: EffectData, r: RenderResult, sheet: ReturnType<typeof spriteSheet>, scenePNG: Buffer, samples: ReviewManifest['samples']) {
  const settings = JSON.stringify({ w: r.w, h: r.h, n: r.frames.length, fps: r.fps,
    cols: sheet.json.meta.pokuFx.columns, loop: !!fx.meta.loop });
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${htmlEscape(fx.id)} visual review</title>
<style>body{font:16px system-ui;background:#24242a;color:#eee;margin:24px}button,select,input{margin:8px}img{display:block;max-width:none;image-rendering:pixelated}canvas{image-rendering:pixelated}section{overflow:auto;margin-bottom:24px}a{color:#9df}</style>
<h1>${htmlEscape(fx.id)}: evidence, not an aesthetic pass</h1>
<p>Review the native and enlarged pixels, silhouette, values, timing and backgrounds against your own art direction. Record actual observations in review-template.json. No style, palette size or motif is graded.</p>
<p>Playback starts paused. Scene shows the intended backdrop/stand-in actor; export shows the exact transparent PNG prepared for sharing. Silhouette sheets show color-buffer occupancy without glow. Browser zoom/DPR can affect physical display size; PNG 1× and 3× dimensions are exact.</p>
<label>View <select id="view"><option value="scene">Scene</option><option value="dark">Export / dark</option><option value="light">Export / light</option><option value="checker">Export / checker</option></select></label>
<label>Scale <select id="scale"><option value="1">1×</option><option value="3" selected>3× nearest</option></select></label>
<button id="play" disabled>Play</button><label><input id="repeat" type="checkbox" ${fx.meta.loop ? 'checked' : ''}>Repeat</label>
<input id="frame" aria-label="Frame" type="range" min="0" max="${r.frames.length - 1}" value="0"><output id="time"></output>
<section><canvas id="screen"></canvas></section><p>All ${r.frames.length} frames at ${r.fps} fps. Sample cues: ${htmlEscape(samples.map(s => `${s.frame} (${s.reasons.join(', ')})`).join('; '))}.</p>
${REVIEW_FILES.filter(f => f.endsWith('.png')).map(f => `<section><h2>${f}</h2><img src="${f}" alt="${f}"></section>`).join('')}
<p>Prepared frames are not a substitute for target-game playback, real scene integration, alternate seeds or artistic judgement.</p>
<script>
const cfg=${settings}, scene=new Image(), asset=new Image();
scene.src='data:image/png;base64,${scenePNG.toString('base64')}';asset.src='data:image/png;base64,${sheet.png.toString('base64')}';
const screen=document.getElementById('screen'),ctx=screen.getContext('2d'),slider=document.getElementById('frame'),view=document.getElementById('view'),scale=document.getElementById('scale'),play=document.getElementById('play'),repeat=document.getElementById('repeat');
let running=false,start=0,startFrame=0,raf=0;
function draw(){const i=Number(slider.value),k=Number(scale.value),mode=view.value;screen.width=cfg.w*k;screen.height=cfg.h*k;ctx.imageSmoothingEnabled=false;
if(mode==='checker'){for(let y=0;y<screen.height;y+=8*k)for(let x=0;x<screen.width;x+=8*k){ctx.fillStyle=((x+y)/(8*k))%2?'#bebebe':'#e0e0e0';ctx.fillRect(x,y,8*k,8*k);}}
else{ctx.fillStyle=mode==='light'?'#eeeeee':'#141414';ctx.fillRect(0,0,screen.width,screen.height);}
ctx.drawImage(mode==='scene'?scene:asset,(i%cfg.cols)*cfg.w,Math.floor(i/cfg.cols)*cfg.h,cfg.w,cfg.h,0,0,screen.width,screen.height);
document.getElementById('time').textContent=i+' / '+(cfg.n-1)+' · '+(i/cfg.fps).toFixed(3)+' s';}
function stop(){running=false;cancelAnimationFrame(raf);raf=0;play.textContent='Play';}
function tick(now){if(!running)return;let i=startFrame+Math.floor((now-start)*cfg.fps/1000);if(i>=cfg.n){if(repeat.checked)i%=cfg.n;else{slider.value=cfg.n-1;draw();stop();return;}}slider.value=i;draw();raf=requestAnimationFrame(tick);}
play.onclick=()=>{if(running){stop();return;}if(Number(slider.value)===cfg.n-1)slider.value=0;startFrame=Number(slider.value);start=performance.now();running=true;play.textContent='Pause';raf=requestAnimationFrame(tick);};
slider.oninput=()=>{stop();draw();};view.onchange=draw;scale.onchange=draw;
Promise.all([scene.decode(),asset.decode()]).then(()=>{draw();play.disabled=false;}).catch(()=>document.getElementById('time').textContent='Image decode failed; open the PNG evidence directly.');
</script></html>`;
}

/** One render, a bounded set of inspection sheets, and all-frame playback. No repeated render loop. */
export function makeReviewEvidence(fx: EffectData, r: RenderResult, sheet: ReturnType<typeof spriteSheet>) {
  const samples = reviewSamples(r), files: Record<string, Buffer | string> = {};
  const sampled = { ...r, frames: samples.map(s => r.frames[s.frame]) };
  const makeSheet = (suffix: string, frames: RenderResult['frames'], zoom: number) => {
    const pad = 8, label = 16, head = 30, cw = r.w * zoom, ch = r.h * zoom;
    const cols = Math.max(1, Math.min(frames.length, Math.floor((1600 - pad) / (cw + pad))));
    const img = canvas(pad + cols * (cw + pad), head + Math.ceil(frames.length / cols) * (ch + label + pad) + pad);
    img.text(`${fx.id} ${suffix}`, pad, 8, 2);
    frames.forEach((frame, i) => {
      const x = pad + i % cols * (cw + pad), y = head + Math.floor(i / cols) * (ch + label + pad);
      img.text(`${samples[i].frame}  ${frame.t.toFixed(3)}S`, x, y, 2, [170, 170, 185]);
      img.paste(upscale(frame.color, r.w, r.h, zoom), cw, ch, x, y + label);
    });
    return img.png();
  };
  files['scene-native.png'] = makeSheet('SCENE 1X', sampled.frames, 1);
  files['scene-3x.png'] = makeSheet('SCENE 3X', sampled.frames, 3);
  for (const mode of ['dark', 'light', 'checker', 'values', 'silhouette'] as const) {
    const frames = sampled.frames.map(f => ({ ...f, color: reviewView(exportedFrame(f.clear, r.w, r.h), r.w, mode, f.raw) }));
    files[mode === 'values' || mode === 'silhouette' ? `${mode}.png` : `export-${mode}.png`] = makeSheet(mode.toUpperCase() + ' 3X', frames, 3);
  }
  const columns = sheet.json.meta.pokuFx.columns, scene = canvas(columns * r.w, Math.ceil(r.frames.length / columns) * r.h, [0, 0, 0, 0]);
  r.frames.forEach((f, i) => scene.paste(f.color, r.w, r.h, i % columns * r.w, Math.floor(i / columns) * r.h));
  files['playback.html'] = playbackPage(fx, r, sheet, scene.png(), samples);
  return { files, samples };
}

export function reviewTemplate(manifest: ReviewManifest): ReviewRecord {
  return { schema: REVIEW_SCHEMA, fingerprint: manifest.identity.fingerprint, manifestSha256: sha256(JSON.stringify(manifest)),
    reviewer: '', reviewedAt: '', evidenceViewed: false, decision: 'needs-work', intent: '',
    observations: { nativeAndZoom: '', silhouetteAndValues: '', timing: '', backgrounds: '' }, knownLimitations: '' };
}

/** Shape/asset checks only. The record is an accountable assertion, not proof someone looked. */
export function validateReviewRecord(input: unknown, manifest: ReviewManifest): ReviewRecord {
  if (!input || typeof input !== 'object') throw new Error('Review record must be an object');
  const record = input as ReviewRecord;
  if (record.schema !== REVIEW_SCHEMA || record.fingerprint !== manifest.identity.fingerprint
    || record.manifestSha256 !== sha256(JSON.stringify(manifest))) throw new Error('Review record belongs to different or changed evidence; prepare and inspect again');
  if (record.evidenceViewed !== true) throw new Error('A reviewer must explicitly confirm viewing the evidence');
  const nonempty = (s: unknown) => typeof s === 'string' && s.trim().length > 0;
  if (!nonempty(record.reviewer) || !nonempty(record.intent) || !nonempty(record.knownLimitations)
    || !REVIEW_TOPICS.every(topic => nonempty(record.observations?.[topic])))
    throw new Error('Reviewer, intent, all four observations and known limitations must be written explicitly');
  if (!nonempty(record.reviewedAt) || !Number.isFinite(Date.parse(record.reviewedAt))) throw new Error('reviewedAt must be a date/time');
  if (record.decision !== 'ready' && record.decision !== 'needs-work') throw new Error('decision must be ready or needs-work');
  return record;
}

export function readReviewManifest(dir: string, identity: ReviewIdentity): ReviewManifest {
  const path = join(dir, 'manifest.json');
  if (!existsSync(path)) throw new Error(`No visual evidence prepared. Run npm run review -- ${identity.id}`);
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as ReviewManifest;
  if (manifest.schema !== REVIEW_SCHEMA || manifest.identity?.fingerprint !== identity.fingerprint)
    throw new Error('Source, export or preview changed since the evidence was prepared. Rebuild and prepare a new review');
  for (const file of REVIEW_FILES) {
    const path = join(dir, file);
    if (!manifest.evidence?.[file] || !existsSync(path) || sha256(readFileSync(path)) !== manifest.evidence[file])
      throw new Error(`Missing or changed visual evidence: ${file}`);
  }
  return manifest;
}

/** Gate only the publication-preparation route, never the runtime or ordinary draft rendering. */
export function requireVisualReview(dir: string, identity: ReviewIdentity): ReviewRecord {
  const manifest = readReviewManifest(dir, identity), file = join(dir, 'review.json');
  if (!existsSync(file)) throw new Error(`Explicit visual review missing. Inspect ${dir}/playback.html and submit a completed review-template.json with npm run review -- ${identity.id} --record <file>`);
  const record = validateReviewRecord(JSON.parse(readFileSync(file, 'utf8')), manifest);
  if (record.decision !== 'ready') throw new Error('Reviewer recorded needs-work; address the observations before sharing');
  return record;
}

export function writeReviewEvidence(dir: string, fx: EffectData, result: RenderResult, sheet: ReturnType<typeof spriteSheet>, identity: ReviewIdentity) {
  const { files, samples } = makeReviewEvidence(fx, result, sheet);
  const manifest: ReviewManifest = { schema: REVIEW_SCHEMA, identity, size: [result.w, result.h], fps: result.fps,
    frames: result.frames.length, loop: !!fx.meta.loop, samples, evidence: {} };
  for (const [file, data] of Object.entries(files)) {
    writeFileSync(join(dir, file), data);
    manifest.evidence[file] = sha256(data);
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, 'review-template.json'), JSON.stringify(reviewTemplate(manifest), null, 2));
  return manifest;
}

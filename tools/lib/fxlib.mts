// Shared by the tools: find effects, render their frames, lay frames out, write PNG, GIF and MP4.

import { readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AtlasMetadata } from "../../src/render/export.js";
const { createFrame, clearFrame, createFx, createAct, actBounds, actTiming, composite, painterFor, drawActor, stockActor, backdrop, actorAlphaOf, sceneCameraOffset, transformImpactContact2D, defineRestorationTiming2D, enableHDRLight } = await import(new URL("../../../build/core/index.js", import.meta.url).href);
const { rasterText, textWidth } = await import(new URL("../../../build/core/font.js", import.meta.url).href);
import { encodePNG } from "./png.mjs";
const { resolveEffectExport, exportLayout2D, frameDurationMs, edgeFade, separateFrameLayers, atlasMetadata } = await import(new URL("../../../build/render/export.js", import.meta.url).href);
export { frameDurationMs, edgeFade };


export interface EffectData { id: string; file: string; mod: Record<string, any>; meta: Record<string, any> }
export interface RenderOptions {
  fps?: number; seed?: number; bg?: string; margin?: number; pad?: number;
  options?: Record<string, any>; cameraMotion?: number; actor?: boolean; target?: boolean; seconds?: number; hold?: number;
  /** Raw diagnostic buffers are opt-in; ordinary exports need only RGBA. */
  diagnostics?: boolean;
  /** Capture straight color/coverage and unclamped linear RGB emission for game assets. */
  layers?: boolean;
  edgeFade?: number | false;
}
export interface FrameData {
  t: number; color: Uint8ClampedArray; clear: Uint8ClampedArray; frozen?: boolean;
  raw?: Uint32Array; light?: Uint32Array;
  layers?: { color: Uint8ClampedArray; emission: Float32Array };
  camera?: Record<string, unknown>; pivot?: number[];
}
export interface RenderInfo {
  w: number; h: number; fps: number; n: number; margin?: number; pivot?: number[];
  contacts?: readonly unknown[]; settings?: Record<string, any>; columns?: number;
}
/** Every iteration starts from the seed; consumers may discard each frame immediately. */
export interface RenderSequence extends RenderInfo { frames: Iterable<FrameData> }
export interface RenderResult extends RenderInfo { frames: FrameData[] }

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const FX_DIR = join(ROOT, "src", "fx");
export const BUILT_FX_DIR = join(ROOT, "build", "fx");

/** An injective identifier suitable for imports, even if names contain dashes. */
export const effectSymbol = (id: string) => "effect_" + Buffer.from(id, "utf8").toString("hex");

/** Every effect id ("fire/torch"), sorted. Files starting with _ are helpers, not effects. */
export function allIds(dir = FX_DIR) {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const cat of readdirSync(dir).sort()) {
    const d = join(dir, cat);
    if (cat.startsWith("_") || !statSync(d).isDirectory()) continue;
    for (const f of readdirSync(d).sort()) if (f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.startsWith("_")) out.push(`${cat}/${f.slice(0, -3)}`);
  }
  return out;
}

/** Ids matching patterns: "fire/torch", "fire" (a category), "fire/*", "*torch*", or a file path. */
export function resolveIds(patterns: string[], dir = FX_DIR, { strict = false } = {}) {
  const all = allIds(dir), out = new Set<string>();
  for (let p of patterns) {
    if (/\.(?:ts|js)$/.test(p)) p = relative(dir, isAbsolute(p) ? p : join(process.cwd(), p)).split(sep).join("/").replace(/\.(?:ts|js)$/, "");
    const re = new RegExp("^" + p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
    const hits = all.filter((id) => id === p || id.startsWith(p + "/") || re.test(id));
    if (!hits.length) {
      const message = `${p}에 일치하는 이펙트가 없습니다`;
      if (strict) throw new Error(message);
      console.error(message);
    }
    hits.forEach((h) => out.add(h));
  }
  return [...out];
}

/** Import an effect module fresh. */
export async function loadEffect(id: string, dir = FX_DIR): Promise<EffectData> {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) throw new Error(`잘못된 이펙트 ID: ${id}`);
  const file = join(dir, id + ".ts");
  const runtimeFile = join(BUILT_FX_DIR, relative(FX_DIR, dir), id + ".js");
  if (!existsSync(file)) throw new Error(`이펙트 소스 파일을 찾을 수 없습니다: ${file}`);
  if (!existsSync(runtimeFile)) throw new Error(`컴파일된 이펙트를 찾을 수 없습니다: ${runtimeFile}; npm run build를 실행하세요`);
  const mod = await import(pathToFileURL(runtimeFile).href + `?v=${statSync(runtimeFile).mtimeMs}`);
  const meta = { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, ...mod.meta };
  if (!mod.meta) throw new Error(`${id}: meta 내보내기가 없습니다`);
  if (!mod.draw && !mod.create) throw new Error(`${id}: draw 또는 create 내보내기가 없습니다`);
  return { id, file, mod: { ...mod, meta }, meta };
}

/** A deterministic effect stream. Only the current frame and reusable render surfaces are live. */
export function renderSequence(fx: EffectData, opts: RenderOptions = {}): RenderSequence {
  const { meta } = fx, plan = resolveEffectExport(meta as any, opts);
  const { w, h, x, y, ox, oy, pivot } = plan.layout, { fps, n } = plan;
  const options: Record<string, any> = { ...plan.options, ...(opts.cameraMotion !== undefined ? { cameraMotion: opts.cameraMotion } : {}) };
  const facts = createFx(fx.mod, options);
  return {
    w, h, fps, n, margin: opts.margin ?? 0, pivot, settings: plan.settings,
    contacts: facts.contacts.map((c: any) => transformImpactContact2D(c, { flip: options.flip, angle: options.angle })),
    frames: {
      *[Symbol.iterator](): Generator<FrameData> {
        const inst = createFx(fx.mod, options);
        const actor = meta.actor && opts.actor !== false ? inst.options.actor ?? stockActor() : null;
        const bare = createFrame(w, h, ox, oy), shown = actor ? createFrame(w, h, ox, oy) : bare;
        if (opts.layers) { enableHDRLight(bare); if (shown !== bare) enableHDRLight(shown); }
        const bgKind = opts.bg ?? meta.bg, bg = bgKind === "none" ? null : backdrop(bgKind, w, h, y - oy);
        for (let i = 0; i < n; i++) {
          if (i > 0) inst.update(1 / fps);
          clearFrame(bare); inst.draw(bare);
          if (shown !== bare) {
            clearFrame(shown); inst.draw(shown, "back");
            drawActor(painterFor(shown).place(x, y, !!options.flip, options.angle ?? 0), actor,
              actorAlphaOf(fx.mod, meta.loop ? inst.t % meta.duration : Math.min(inst.t, meta.duration), inst.options));
            inst.draw(shown, "front");
          }
          edgeFade(bare, plan.settings.edgeFade);
          if (shown !== bare) edgeFade(shown, plan.settings.edgeFade);
          const visible = composite(shown, new Uint8ClampedArray(w * h * 4), bg);
          const [sx, sy] = sceneCameraOffset(inst.shake, false, bg === null);
          const clear = shown === bare && bg === null ? visible : composite(bare, new Uint8ClampedArray(w * h * 4), null);
          yield {
            t: i / fps, color: sx || sy ? shifted(visible, w, h, sx, sy) : visible, clear,
            ...(opts.diagnostics ? { raw: bare.color.slice(), light: bare.light.slice() } : {}),
            ...(opts.layers ? { layers: separateFrameLayers(bare) } : {}),
          };
        }
      },
    },
  };
}

/** Convenience collector. Use renderSequence for videos, contact sheets and large batches. */
export function renderFrames(fx: EffectData, opts: RenderOptions = {}): RenderResult {
  const sequence = renderSequence(fx, opts);
  return { ...sequence, frames: Array.from(sequence.frames) };
}

/** An acted scene stream, including its timeline, freezes and the selected native actor. */
export function renderActSequence(fx: EffectData, opts: RenderOptions = {}): RenderSequence {
  const { meta } = fx, fps = opts.fps ?? 60, b = actBounds(fx.mod, opts.options), pad = opts.pad ?? 6;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 1000) throw new RangeError("Export fps must be in (0, 1000]");
  const source = opts.options ?? {}, layout = exportLayout2D([b.x1 - b.x0, b.y1 - b.y0], [-b.x0, -b.y0],
    { flip: !!source.flip, margin: pad, x: source.x, y: source.y });
  const { w, h, ox, oy, x: X, y: Y } = layout;
  const options: Record<string, any> = { ...source, x: X, y: Y, ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    ...(opts.cameraMotion !== undefined ? { cameraMotion: opts.cameraMotion } : {}) };
  const counter = createAct(fx.mod, options);
  const seconds = opts.seconds ?? (meta.loop ? meta.duration * 2 - counter.t : 8), hold = meta.loop ? 0 : opts.hold ?? 0.3;
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(hold) || hold < 0)
    throw new RangeError("Scene duration and end hold must be finite and non-negative");
  const max = Math.round(seconds * fps), held = Math.ceil(fps * hold);
  // Count simulation updates without rasterizing. Atlas layout needs an exact frame count,
  // including hit-stop frames; this does not retain any RGBA sequence.
  let steps = 0;
  for (; steps < max && !counter.done(); steps++) counter.update(1 / fps);
  const n = 1 + steps + held, bgKind = opts.bg ?? meta.bg;
  return {
    w, h, fps, n, pivot: layout.pivot,
    contacts: counter.fx.contacts.map((c: any) => transformImpactContact2D(c, { flip: options.flip, angle: options.angle })),
    settings: { output: "acted-scene", fps, seed: options.seed ?? meta.options?.seed, loop: !!meta.loop,
      background: bgKind === "none" ? "transparent" : bgKind, actor: opts.actor !== false, target: opts.target !== false,
      cameraMotion: bgKind !== "none" && options.cameraMotion !== 0, edgeFade: 0, hold, seconds,
      options: Object.fromEntries(Object.entries({ ...(meta.options ?? {}), ...source }).filter(([key, value]) => key !== "actorAdapter" && typeof value !== "function")) },
    frames: {
      *[Symbol.iterator](): Generator<FrameData> {
        const frame = createFrame(w, h, ox, oy), bg = bgKind === "none" ? null : backdrop(bgKind, w, h, Y - oy);
        if (opts.layers) enableHDRLight(frame);
        const act = createAct(fx.mod, options);
        for (let i = 0; i < n; i++) {
          if (i > 0) act.update(1 / fps);
          clearFrame(frame); act.draw(frame, { body: opts.actor !== false, target: opts.target !== false });
          const rgba = composite(frame, new Uint8ClampedArray(w * h * 4), bg), [sx, sy] = sceneCameraOffset(act.shake, false, bg === null);
          yield { t: act.t, frozen: act.frozen, color: sx || sy ? shifted(rgba, w, h, sx, sy) : rgba,
            clear: bg === null ? rgba : composite(frame, new Uint8ClampedArray(w * h * 4), null),
            ...(opts.diagnostics ? { raw: frame.color.slice(), light: frame.light.slice() } : {}),
            ...(opts.layers ? { layers: separateFrameLayers(frame) } : {}) };
        }
      },
    },
  };
}

/** Convenience collector for scripts that explicitly need random access to every acted frame. */
export function renderAct(fx: EffectData, opts: RenderOptions = {}): RenderResult {
  const sequence = renderActSequence(fx, opts);
  return { ...sequence, frames: Array.from(sequence.frames) };
}
function shifted(rgba: Uint8ClampedArray, w: number, h: number, sx: number, sy: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = Math.max(0, Math.min(w - 1, x - sx)), Y = Math.max(0, Math.min(h - 1, y - sy)), d = (y * w + x) * 4, s = (Y * w + X) * 4;
      out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
  return out;
}

/** Full-screen effects (transitions, weather, impact frames): 16:9 and at least 320 wide. They fill the screen. */
export const isScreen = (meta: Record<string, any>) => meta.size[0] >= 320 && Math.abs(meta.size[0] / meta.size[1] - 16 / 9) < 0.05;

/** Nearest-neighbour upscale of RGBA. */
export function upscale(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, k: number) {
  if (k === 1) return rgba;
  const out = new Uint8ClampedArray(w * k * h * k * 4), src = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
  const dst = new Uint32Array(out.buffer);
  for (let y = 0; y < h * k; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < w * k; x++) dst[y * w * k + x] = src[sy * w + ((x / k) | 0)];
  }
  return out;
}

/** A blank RGBA canvas with helpers to paste images and write labels. */
export function canvas(w: number, h: number, fill: number[] = [12, 11, 16, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return {
    w, h, data,
    /** Exact copy for disjoint atlas cells, including RGB beneath zero coverage. */
    copy(src: Uint8Array | Uint8ClampedArray, sw: number, sh: number, x: number, y: number) {
      const first = Math.max(0, -x), end = Math.min(sw, w - x);
      if (first >= end) return;
      for (let row = Math.max(0, -y); row < Math.min(sh, h - y); row++) {
        const start = (row * sw + first) * 4;
        data.set(src.subarray(start, start + (end - first) * 4), ((y + row) * w + x + first) * 4);
      }
    },
    paste(src: Uint8Array | Uint8ClampedArray, sw: number, sh: number, x: number, y: number) {
      for (let yy = 0; yy < sh; yy++) {
        const ty = y + yy;
        if (ty < 0 || ty >= h) continue;
        for (let xx = 0; xx < sw; xx++) {
          const tx = x + xx;
          if (tx < 0 || tx >= w) continue;
          const s = (yy * sw + xx) * 4, d = (ty * w + tx) * 4, a = src[s + 3] / 255;
          if (a === 0) continue;
          if (a === 1 || data[d + 3] === 0) {
            // PNG stores straight RGBA: pasting into empty cells must not darken RGB by alpha.
            for (let c = 0; c < 4; c++) data[d + c] = src[s + c];
          } else if (data[d + 3] === 255) {
            // Preserve existing opaque contact-sheet/background pixels and rounding exactly.
            for (let c = 0; c < 3; c++) data[d + c] = src[s + c] * a + data[d + c] * (1 - a);
          } else {
            const behind = data[d + 3] / 255 * (1 - a), outAlpha = a + behind;
            for (let c = 0; c < 3; c++) data[d + c] = (src[s + c] * a + data[d + c] * behind) / outAlpha;
            data[d + 3] = outAlpha * 255;
          }
        }
      }
    },
    text(str: string, x: number, y: number, k = 2, rgb: number[] = [200, 196, 214], font = "mini") {
      rasterText(str, font, (gx: number, gy: number) => {
        for (let yy = 0; yy < k; yy++)
          for (let xx = 0; xx < k; xx++) {
            const tx = x + gx * k + xx, ty = y + gy * k + yy;
            if (tx >= 0 && ty >= 0 && tx < w && ty < h) data.set([...rgb, 255], (ty * w + tx) * 4);
          }
      });
    },
    rect(x: number, y: number, rw: number, rh: number, rgba: number[]) {
      for (let yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++) for (let xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) data.set(rgba, (yy * w + xx) * 4);
    },
    png() {
      return encodePNG(w, h, data);
    },
  };
}

export { textWidth };

/** Which frames a contact sheet shows: all of them up to max, else evenly spaced. */
export function pickFrames(n: number, max = 16) {
  if (!Number.isSafeInteger(n) || n < 1 || !Number.isSafeInteger(max) || max < 1)
    throw new RangeError("Frame count and sample count must be positive integers");
  if (n <= max) return [...Array(n).keys()];
  if (max === 1) return [0];
  return Array.from({ length: max }, (_, i) => Math.round((i * (n - 1)) / (max - 1)));
}

export interface ContactSheetOptions { max?: number; width?: number; title?: string; zoom?: number }
/** Streaming contact-sheet sink. Only the selected cells live in the final canvas. */
export function createContactSheet(fx: EffectData, r: RenderInfo, { max = 16, width = 1600, title, zoom }: ContactSheetOptions = {}) {
  const { w, h, n, fps } = r, idx = pickFrames(n, max), positions = new Map(idx.map((fi, j) => [fi, j]));
  const k = zoom ?? Math.max(1, Math.min(6, Math.floor((width - 16) / Math.min(idx.length, 6) / (w + 6))));
  if (!Number.isSafeInteger(k) || k < 1) throw new RangeError("Contact sheet zoom must be a positive integer");
  const cw = w * k, ch = h * k, pad = 8, label = 16;
  const cols = Math.max(1, Math.min(idx.length, Math.floor((Math.max(width, cw + pad * 2) - pad) / (cw + pad))));
  const rows = Math.ceil(idx.length / cols), head = 30;
  const img = canvas(pad + cols * (cw + pad), head + rows * (ch + label + pad) + pad), m = fx.meta;
  img.text(title ?? `${fx.id}  ${m.size[0]}x${m.size[1]}  ${m.duration}S  ${n}F @${fps}  ${m.loop ? "LOOP" : "ONE-SHOT"}`, pad, 8, 3);
  return {
    push(f: FrameData, index: number) {
      const j = positions.get(index);
      if (j === undefined) return;
      const x = pad + (j % cols) * (cw + pad), y = head + Math.floor(j / cols) * (ch + label + pad);
      img.text(`${index}  ${f.t.toFixed(2)}`, x, y, 2, [140, 134, 160]);
      img.paste(upscale(f.color, w, h, k), cw, ch, x, y + label);
    },
    png: () => img.png(),
  };
}

/** A contact sheet from either an iterable or a collected sequence. */
export function contactSheet(fx: EffectData, r: RenderSequence, opts: ContactSheetOptions = {}) {
  const info = Array.isArray(r.frames) ? { ...r, n: r.frames.length } : r, sink = createContactSheet(fx, info, opts);
  let i = 0; for (const frame of r.frames) sink.push(frame, i++);
  return sink.png();
}

export function sheetMetadata(fx: EffectData, r: RenderInfo, name: string, image = `${name}.png`): AtlasMetadata {
  const cols = Math.min(r.n, r.columns ?? Math.max(1, Math.ceil(Math.sqrt((r.n * r.h) / r.w))));
  return atlasMetadata({ id: fx.id, name: fx.meta.name, animationName: name, image,
    w: r.w, h: r.h, n: r.n, fps: r.fps, loop: !!fx.meta.loop, columns: cols,
    pivot: r.pivot ?? fx.meta.origin, contacts: r.contacts, settings: r.settings,
    restoration: fx.mod.restoration ? defineRestorationTiming2D(fx.mod.restoration) : undefined,
    act: fx.mod.act ? actTiming(fx.mod) : undefined });
}

/** Streaming exact-copy sprite-sheet sink, including straight RGB under zero alpha. */
export function createSpriteSheet(fx: EffectData, r: RenderInfo, name: string, image = `${name}.png`) {
  const json = sheetMetadata(fx, r, name, image), img = canvas(json.meta.size.w, json.meta.size.h, [0, 0, 0, 0]);
  let count = 0;
  return {
    push(f: FrameData, index = count) {
      const rect = json.frames[index]?.frame;
      if (!rect || f.clear.length !== r.w * r.h * 4) throw new RangeError("Sprite-sheet frame does not match its declared layout");
      img.copy(f.clear, r.w, r.h, rect.x, rect.y);
      json.meta.pokuFx.timeSamples[index] = f.t;
      if (f.frozen) (json.meta.pokuFx.frozenFrames ??= []).push(index);
      if (f.camera) (json.meta.pokuFx.cameraSamples ??= [])[index] = f.camera;
      if (f.pivot) (json.meta.pokuFx.pivotSamples ??= [])[index] = f.pivot;
      count++;
    },
    result() {
      if (count !== r.n) throw new RangeError(`Expected ${r.n} atlas frames, received ${count}`);
      return { png: img.png(), json };
    },
  };
}

/** A sprite sheet from either a stream or collected frames. */
export function spriteSheet(fx: EffectData, r: RenderSequence, name: string, image = `${name}.png`) {
  const info = Array.isArray(r.frames) ? { ...r, n: r.frames.length } : r, sink = createSpriteSheet(fx, info, name, image);
  let i = 0; for (const frame of r.frames) sink.push(frame, i++);
  return sink.result();
}

// Keep the existing synchronous API available to CLI callers and external authoring scripts.
export { writeVideo, writeVideos } from "./video.mjs";

export function save(file: string, buf: string | Uint8Array) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof buf === "string" ? buf : buf);
  return file;
}


/** Browser/CLI export contracts. These helpers do not change live world-space placement. */
import { channelToLinear } from "./linear.js";
import { transformImpactContact2D, type ImpactContact2D } from "../core/impact-contact.js";

export interface ExportMeta2D {
  size: readonly number[];
  origin: readonly number[];
  duration?: number;
  fps?: number;
  loop?: boolean;
  options?: Record<string, unknown>;
}
export interface ExportTransform2D {
  flip?: boolean;
  angle?: number;
  margin?: number;
  /** An explicit position opts out of automatic canvas fitting, for authored layouts. */
  x?: number;
  y?: number;
}
export interface ExportLayout2D {
  w: number; h: number;
  /** World position passed to the effect and world origin passed to createFrame. */
  x: number; y: number; ox: number; oy: number;
  /** Pixel-edge pivot in the exported frame, including margin. */
  pivot: [number, number];
}
export interface EffectExportOptions2D {
  fps?: number;
  seconds?: number;
  seed?: number;
  margin?: number;
  options?: Record<string, any>;
  /** Light-only canvas-edge fade in native pixels. false explicitly disables it. */
  edgeFade?: number | false;
}
export interface EffectExportSettings2D {
  output: "effect-sheet";
  fps: number;
  seed?: number;
  loop: boolean;
  terminalFrame: "included" | "excluded";
  background: "transparent";
  actor: false;
  cameraMotion: false;
  edgeFade: number;
  margin: number;
  options: Record<string, any>;
  sourceDuration: number;
  exportDuration: number;
  truncated: boolean;
}
export interface ExportLayerFrame {
  w: number; h: number;
  color: Uint32Array;
  light: Uint32Array;
  hdrLight?: Float32Array;
}

/** Integer millisecond durations whose sum equals round(N * 1000 / fps). */
export function frameDurationMs(index: number, fps: number): number {
  return Math.round((index + 1) * 1000 / fps) - Math.round(index * 1000 / fps);
}

export interface ActExportInput {
  fps?: number; seconds?: number; hold?: number;
}
interface ActExportModule {
  meta: { duration?: number; loop?: boolean };
  act?: { poses?: readonly (readonly any[])[]; hits?: readonly { t: number; stop?: number }[] };
}
/** Presentation duration bound, including windup and simultaneous-contact maximum freezes. */
export function resolveActDuration(mod: ActExportModule, input: ActExportInput = {}) {
  const fps = input.fps ?? 60, duration = mod.meta.duration ?? 1, loop = !!mod.meta.loop;
  const poses = mod.act?.poses, from = Math.min(0, Number(poses?.[0]?.[0] ?? 0));
  const end = loop ? duration * 2 : Math.max(duration, Number(poses?.[poses.length - 1]?.[0] ?? 0));
  const hold = loop ? 0 : input.hold ?? .3;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 1000 || ![duration, from, end, hold].every(Number.isFinite)
    || duration < 0 || (loop && duration === 0) || hold < 0) throw new RangeError("Invalid acted export timeline");
  const stops = new Map<number, number>();
  for (const hit of mod.act?.hits ?? []) {
    if (!Number.isFinite(hit.t) || !Number.isFinite(hit.stop ?? 0) || (hit.stop ?? 0) < 0) throw new RangeError("Invalid ACT contact time/freeze");
    for (let cycle = 0; cycle < (loop ? 2 : 1); cycle++) {
      if (loop && (hit.t > duration || cycle > 0 && hit.t < 0)) continue;
      const at = Math.max(from, hit.t + cycle * duration);
      if (loop ? at >= end : at > end) continue;
      stops.set(at, Math.max(stops.get(at) ?? 0, hit.stop ?? 0));
    }
  }
  const freezeSeconds = [...stops.values()].reduce((a, b) => a + b, 0);
  const naturalSeconds = end - from + freezeSeconds, seconds = input.seconds ?? naturalSeconds;
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Scene duration must be finite and non-negative");
  const maxSteps = input.seconds === undefined ? Math.ceil(seconds * fps) + 2 : Math.round(seconds * fps);
  if (!Number.isSafeInteger(maxSteps) || maxSteps > 1_000_000) throw new RangeError("Scene export exceeds one million frames; choose an explicit duration or lower fps");
  return { fps, from, end, hold, seconds, naturalSeconds, freezeSeconds, maxSteps, loop };
}
/** Count the real fixed-step ACT clock without rasterizing; browser and CLI share exact frame selection. */
export function resolveActExport(mod: ActExportModule, counter: { readonly t: number; done(): boolean; update(dt: number): void }, input: ActExportInput = {},
  onSample?: (sourceTime: number, frameIndex: number) => void) {
  const plan = resolveActDuration(mod, input);
  const complete = () => plan.loop ? counter.t >= plan.end - 1e-9 : counter.done();
  let steps = 0;
  onSample?.(counter.t, 0);
  for (; steps < plan.maxSteps && !complete(); steps++) {
    counter.update(1 / plan.fps);
    onSample?.(counter.t, steps + 1);
  }
  const truncated = !complete();
  if (truncated && input.seconds === undefined) throw new Error("Act did not reach its declared ending; export an explicit seconds crop or correct its timeline");
  const held = truncated ? 0 : Math.ceil(plan.fps * plan.hold), n = 1 + steps + held;
  return { ...plan, n, steps, held, truncated, lastTime: counter.t,
    duration: (n - 1) / plan.fps, playbackDuration: n / plan.fps,
    termination: truncated ? "explicit-duration-crop" : plan.loop ? "two-cycles" : "completed" };
}

/** Fit the transformed *pixel edges*, so mirroring also reflects an asymmetric pivot. */
export function exportLayout2D(size: readonly number[], origin: readonly number[], transform: ExportTransform2D = {}): ExportLayout2D {
  const [w, h] = size, [ox, oy] = origin, margin = transform.margin ?? 0;
  if (![w, h].every(v => Number.isSafeInteger(v) && v > 0)
    || ![ox, oy].every(Number.isFinite) || !Number.isSafeInteger(margin) || margin < 0)
    throw new RangeError("Export dimensions, origin or margin are invalid");
  const angle = transform.angle ?? 0;
  if (!Number.isFinite(angle) || (transform.x !== undefined && !Number.isFinite(transform.x))
    || (transform.y !== undefined && !Number.isFinite(transform.y))) throw new RangeError("Export transform must be finite");
  if (transform.x !== undefined || transform.y !== undefined) {
    const x = transform.x ?? ox, y = transform.y ?? oy;
    return { w: w + 2 * margin, h: h + 2 * margin, x, y, ox: -margin, oy: -margin, pivot: [x + margin, y + margin] };
  }
  // Cardinal rotations must not add an empty row because cos(pi/2) is a tiny nonzero double.
  const snap = (v: number) => Math.abs(v) < 1e-12 ? 0 : Math.abs(v - 1) < 1e-12 ? 1 : Math.abs(v + 1) < 1e-12 ? -1 : v;
  const cs = snap(Math.cos(angle)), sn = snap(Math.sin(angle)), sign = transform.flip ? -1 : 1;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let i = 0; i < 4; i++) {
    const lx = (i & 1 ? w : 0) - ox, ly = (i & 2 ? h : 0) - oy;
    const x = lx * sign * cs - ly * sn, y = lx * sign * sn + ly * cs;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  left = Math.floor(left + 1e-9); right = Math.ceil(right - 1e-9);
  top = Math.floor(top + 1e-9); bottom = Math.ceil(bottom - 1e-9);
  return { w: right - left + 2 * margin, h: bottom - top + 2 * margin,
    x: -left, y: -top, ox: -margin, oy: -margin, pivot: [margin - left, margin - top] };
}

/** The same plan is used by CLI effect sheets and the browser gallery's effect-sheet export. */
export function resolveEffectExport(meta: ExportMeta2D, input: EffectExportOptions2D = {}) {
  const fps = input.fps ?? meta.fps ?? 30, sourceDuration = meta.duration ?? 1, duration = input.seconds ?? sourceDuration, margin = input.margin ?? 0;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 1000) throw new RangeError("Export fps must be in (0, 1000]");
  if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Export duration must be finite and non-negative");
  const options: Record<string, any> = { ...(meta.options ?? {}), ...(input.options ?? {}) };
  if (input.seed !== undefined) options.seed = input.seed;
  const layout = exportLayout2D(meta.size, meta.origin, { flip: !!options.flip, angle: options.angle, margin,
    x: options.x, y: options.y });
  const screen = meta.size[0] >= 320 && Math.abs(meta.size[0] / meta.size[1] - 16 / 9) < 0.05;
  const fade = input.edgeFade === false ? 0 : input.edgeFade ?? (margin === 0 && !screen ? 8 : 0);
  if (!Number.isFinite(fade) || fade < 0) throw new RangeError("edgeFade must be a non-negative number or false");
  const n = Math.max(1, Math.round(duration * fps) + (meta.loop ? 0 : 1));
  if (!Number.isSafeInteger(n)) throw new RangeError("Export frame count is too large");
  const settings: EffectExportSettings2D = {
    output: "effect-sheet", fps, seed: options.seed, loop: !!meta.loop,
    terminalFrame: meta.loop ? "excluded" : "included", background: "transparent", actor: false, cameraMotion: false,
    edgeFade: fade, margin,
    sourceDuration, exportDuration: duration, truncated: !meta.loop && duration < sourceDuration,
    // Keep selection data, not live adapter methods, in reproducible export metadata.
    options: Object.fromEntries(Object.entries(options).filter(([key, value]) => key !== "actorAdapter" && typeof value !== "function")),
  };
  return { layout, fps, n, options: { ...options, x: layout.x, y: layout.y }, settings };
}

/** Asset finishing: fade only emission at the canvas edge; never erode color or coverage. */
export function edgeFade(frame: Pick<ExportLayerFrame, "w" | "h" | "light" | "hdrLight">, width = 8): void {
  if (!(width > 0)) return;
  const { w, h, light, hdrLight } = frame;
  for (let y = 0; y < h; y++) {
    const ey = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x++) {
      const e = Math.min(ey, x, w - 1 - x);
      if (e >= width) { x = Math.max(x, Math.floor(w - 1 - width)); continue; }
      const i = y * w + x, value = light[i], u = Math.min(1, (e + 0.5) / width), k = u * u * (3 - 2 * u);
      if (value & 0xffffff) light[i] = (value & 0xff000000)
        | Math.round((value & 255) * k) | (Math.round(((value >>> 8) & 255) * k) << 8) | (Math.round(((value >>> 16) & 255) * k) << 16);
      if (hdrLight) { const j = i * 3; hdrLight[j] *= k; hdrLight[j + 1] *= k; hdrLight[j + 2] *= k; }
    }
  }
}

/** Source-over color/coverage and separate additive linear RGB. HDR is authoritative when present. */
export function separateFrameLayers(frame: ExportLayerFrame, lighting?: { radiance: Float32Array; occlusion: Float32Array }) {
  const pixels = frame.w * frame.h, color = new Uint8ClampedArray(pixels * 4), emission = new Float32Array(pixels * 3);
  if (lighting && (lighting.radiance.length !== pixels * 3 || lighting.occlusion.length !== pixels))
    throw new RangeError("Invalid lighting snapshot buffers");
  for (let i = 0; i < pixels; i++) {
    const c = frame.color[i], p = i * 4, j = i * 3;
    color[p] = c & 255; color[p + 1] = (c >>> 8) & 255; color[p + 2] = (c >>> 16) & 255; color[p + 3] = c >>> 24;
    if (frame.hdrLight) {
      emission[j] = frame.hdrLight[j]; emission[j + 1] = frame.hdrLight[j + 1]; emission[j + 2] = frame.hdrLight[j + 2];
    } else {
      const l = frame.light[i];
      emission[j] = channelToLinear(l, 0); emission[j + 1] = channelToLinear(l, 8); emission[j + 2] = channelToLinear(l, 16);
    }
  }
  return { color, emission, ...(lighting ? { radiance: lighting.radiance.slice(), occlusion: lighting.occlusion.slice() } : {}) };
}

export interface AtlasMetadataInput {
  id: string; name?: string; animationName: string; image: string;
  w: number; h: number; n: number; fps: number; loop: boolean; columns: number; pivot: readonly number[];
  contacts?: readonly unknown[]; restoration?: unknown; act?: unknown;
  settings?: Record<string, any>;
}
/** Aseprite-compatible frame rectangles and one shared timing/pivot/settings contract. */
export function atlasMetadata(input: AtlasMetadataInput) {
  const { w, h, n, fps, columns, animationName } = input;
  const frames = Array.from({ length: n }, (_, i) => ({
    filename: `${animationName} ${i}`, frame: { x: i % columns * w, y: Math.floor(i / columns) * h, w, h },
    rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h },
    duration: frameDurationMs(i, fps),
  }));
  const pokuFx: Record<string, any> = {
    id: input.id, name: input.name, fps, loop: input.loop, frames: n, frameSize: [w, h], pivot: [...input.pivot], columns,
    durationMs: Math.round(n * 1000 / fps), timeSamples: Array.from({ length: n }, (_, i) => i / fps),
    ...(input.contacts?.length ? { contacts: input.contacts } : {}),
    ...(input.restoration ? { restoration: input.restoration } : {}),
    ...(input.act ? { act: input.act } : {}),
    ...(input.settings ? { settings: input.settings } : {}),
  };
  return { frames, meta: {
    app: "Poku Pixel FX", version: "1", image: input.image, format: "RGBA8888",
    size: { w: columns * w, h: Math.ceil(n / columns) * h }, scale: "1",
    frameTags: [{ name: animationName, from: 0, to: n - 1, direction: "forward" }], pokuFx,
  } };
}
export type AtlasMetadata = ReturnType<typeof atlasMetadata>;

/** Portable game asset contract. Coordinates are pixel edges in the untrimmed frame. */
export interface AssetSocket {
  x: number; y: number; angle?: number; visible?: boolean;
  basisX?: [number, number]; basisY?: [number, number];
  mirrorPolicy?: "reflect" | "swap-hand" | "authored";
}

/** Source-canvas sockets follow the image transform, including handedness of mirrored bases. */
export function transformExportSockets(sockets: Readonly<Record<string, AssetSocket>> | undefined,
  origin: readonly number[], pivot: readonly number[], options: { flip?: boolean; angle?: number } = {}): Record<string, AssetSocket> | undefined {
  if (!sockets) return undefined;
  const angle = options.angle ?? 0, sign = options.flip ? -1 : 1, cs = Math.cos(angle), sn = Math.sin(angle);
  const vector = (x: number, y: number): [number, number] => [sign * x * cs - y * sn, sign * x * sn + y * cs];
  return Object.fromEntries(Object.entries(sockets).map(([name, s]) => {
    const [x, y] = vector(s.x - origin[0], s.y - origin[1]);
    return [name, { ...s, x: pivot[0] + x, y: pivot[1] + y,
      ...(s.angle === undefined ? {} : { angle: (options.flip ? Math.PI - s.angle : s.angle) + angle }),
      ...(s.basisX ? { basisX: vector(...s.basisX) } : {}), ...(s.basisY ? { basisY: vector(...s.basisY) } : {}) }];
  }));
}

/** Contacts retain pivot-relative coordinates; points and normals share the effect's flip/rotation. */
export function transformExportContacts(contacts: readonly ImpactContact2D[], options: { flip?: boolean; angle?: number } = {}) {
  // Callers commonly pass a full instance options object. Its x/y place the sprite,
  // while contacts deliberately remain relative to that sprite's exported pivot.
  return contacts.map(contact => transformImpactContact2D(contact, { flip: !!options.flip, angle: options.angle ?? 0 }));
}

/** Keep authored sound/cue payloads and ACT/character events together; no audio is synthesized. */
export function collectAssetEvents(mod: { meta?: { cues?: readonly Record<string, unknown>[] }; events?: readonly Record<string, unknown>[];
  act?: { hits?: readonly Record<string, unknown>[] } }): Record<string, unknown>[] {
  return [...(mod.meta?.cues ?? []), ...(mod.events ?? []), ...(mod.act?.hits ?? []).map(hit => ({ ...hit, type: "contact" }))];
}
export interface AssetFrame {
  page: number;
  rect: { x: number; y: number; w: number; h: number };
  sourceSize: [number, number];
  trimOffset: [number, number];
  /** Subtract trimOffset to obtain the pivot inside the stored rectangle. */
  pivot: [number, number];
  duration: number;
  /** Source/effect time in seconds; ACT windup may be negative. */
  time: number;
  frozen?: boolean;
  sockets?: Record<string, AssetSocket>;
  camera?: Record<string, unknown>;
}
export interface AssetPage {
  image: string; width: number; height: number;
  emission?: { image: string; format: "float32-le"; channels: 3; colorSpace: "linear-srgb" };
  /** Camera-specific lighting snapshot; independent of emissive lightStrength. */
  radiance?: { image: string; format: "float32-le"; channels: 3; colorSpace: "linear-srgb" };
  /** Camera-specific ambient occlusion. Neutral/outside pixels equal one. */
  occlusion?: { image: string; format: "float32-le"; channels: 1; colorSpace: "linear" };
}
export interface AssetEvent {
  name: string;
  /** Playback milliseconds from the first displayed frame, including ACT freezes. */
  timeMs: number;
  /** Authored effect time in seconds (may be negative for windup). */
  sourceTime: number;
  payload?: Record<string, unknown>;
}
export interface AssetManifest {
  schema: "poku-asset/v1";
  id: string; name?: string; loop: boolean; durationMs: number;
  color: { format: "RGBA8888"; colorSpace: "srgb"; alpha: "straight" };
  coordinates: "untrimmed-pixel-edges-y-down";
  pages: AssetPage[]; frames: AssetFrame[];
  tags: { name: string; from: number; to: number; direction: string }[];
  contacts?: readonly unknown[]; events?: readonly AssetEvent[];
  settings?: Record<string, unknown>;
  source: { engineVersion: string; rng: string; sourceRevision?: string; sourceSha256?: string;
    recipeRevision?: string; projectSha256?: string; [key: string]: unknown };
  files: { path: string; sha256: string; bytes: number }[];
}

/** Convert authored cues to displayed-frame event times while preserving their original payload. */
export function resolveAssetEvents(events: readonly Record<string, unknown>[], frames: readonly Pick<AssetFrame, "time" | "duration">[], loopDuration?: number): AssetEvent[] {
  if (!frames.length) return [];
  const result: AssetEvent[] = [], starts: number[] = [];
  let elapsed = 0;
  for (const frame of frames) { starts.push(elapsed); elapsed += frame.duration; }
  const last = frames[frames.length - 1].time;
  for (const event of events) {
    const at = Number(event.sourceTime ?? event.t ?? event.at ?? event.time);
    if (!Number.isFinite(at)) throw new RangeError("Asset event needs a finite authored time");
    const cycles = loopDuration && loopDuration > 0 && at >= 0 ? Math.max(1, Math.floor((last - at + 1e-9) / loopDuration) + 1) : 1;
    for (let cycle = 0; cycle < cycles; cycle++) {
      const sourceTime = at + cycle * (loopDuration ?? 0);
      if (sourceTime < frames[0].time - 1e-9 || sourceTime > last + 1e-9) continue;
      const index = frames.findIndex(frame => frame.time >= sourceTime - 1e-9);
      if (index < 0) continue;
      result.push({ name: String(event.id ?? event.name ?? event.kind ?? event.type ?? "event"), timeMs: starts[index], sourceTime, payload: { ...event } });
    }
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}

/** Bounded shelf packing, shared by browser exporters and streaming Node writers. */
export function createAtlasPacker(maxTextureSize = 2048, padding = 1) {
  if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1 || maxTextureSize > 16384
    || !Number.isSafeInteger(padding) || padding < 0 || padding * 2 >= maxTextureSize)
    throw new RangeError("Atlas texture size/padding are invalid");
  const pages: { w: number; h: number }[] = [];
  let page = -1, x = 0, y = 0, rowHeight = 0;
  return {
    pages,
    place(w: number, h: number) {
      if (![w, h].every(v => Number.isSafeInteger(v) && v > 0)
        || w + 2 * padding > maxTextureSize || h + 2 * padding > maxTextureSize)
        throw new RangeError("A frame exceeds the atlas page limit; reduce the native frame size or choose a larger page");
      if (page < 0) { page = 0; pages.push({ w: 0, h: 0 }); }
      if (x + w + 2 * padding > maxTextureSize) { x = 0; y += rowHeight; rowHeight = 0; }
      if (y + h + 2 * padding > maxTextureSize) {
        page++; pages.push({ w: 0, h: 0 }); x = 0; y = 0; rowHeight = 0;
      }
      const rect = { x: x + padding, y: y + padding, w, h };
      x += w + 2 * padding; rowHeight = Math.max(rowHeight, h + 2 * padding);
      pages[page].w = Math.max(pages[page].w, x); pages[page].h = Math.max(pages[page].h, y + rowHeight);
      return { page, rect };
    },
  };
}

/** Lossless trim: preserve hidden straight RGB as well as additive, zero-alpha emission. */
export function frameContentBounds(w: number, h: number, rgba: Uint8Array | Uint8ClampedArray, emission?: Float32Array,
  radiance?: Float32Array, occlusion?: Float32Array) {
  if (![w, h].every(v => Number.isSafeInteger(v) && v > 0) || rgba.length !== w * h * 4
    || (emission && emission.length !== w * h * 3) || (radiance && radiance.length !== w * h * 3)
    || (occlusion && occlusion.length !== w * h)) throw new RangeError("Invalid frame buffers");
  let left = w, right = -1, top = h, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = i * 4, e = i * 3;
    if (rgba[c] || rgba[c + 1] || rgba[c + 2] || rgba[c + 3]
      || (emission && (emission[e] || emission[e + 1] || emission[e + 2]))
      || (radiance && (radiance[e] || radiance[e + 1] || radiance[e + 2])) || (occlusion && occlusion[i] !== 1)) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < left ? { x: 0, y: 0, w: 1, h: 1 } : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

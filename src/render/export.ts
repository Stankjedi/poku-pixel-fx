/** Browser/CLI export contracts. These helpers do not change live world-space placement. */
import { channelToLinear } from "./linear.js";

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
  const fps = input.fps ?? meta.fps ?? 30, duration = meta.duration ?? 1, margin = input.margin ?? 0;
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
export function separateFrameLayers(frame: ExportLayerFrame) {
  const pixels = frame.w * frame.h, color = new Uint8ClampedArray(pixels * 4), emission = new Float32Array(pixels * 3);
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
  return { color, emission };
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

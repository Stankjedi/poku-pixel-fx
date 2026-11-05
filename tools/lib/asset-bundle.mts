/** Streaming, bounded multi-page assets. Preview composites never replace source color/HDR. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { AssetManifest, AssetSocket } from "../../src/render/export.js";
import { ROOT, frameDurationMs, type EffectData, type FrameData, type RenderInfo } from "./fxlib.mjs";
import { encodePNG } from "./png.mjs";
const { createAtlasPacker, frameContentBounds, resolveAssetEvents, collectAssetEvents } = await import(new URL("../../../build/render/export.js", import.meta.url).href);

export interface AssetBundleOptions {
  maxTextureSize?: number; padding?: number; trim?: boolean; deduplicate?: boolean;
  source?: Partial<AssetManifest["source"]>;
  tags?: AssetManifest["tags"];
}
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

export function createAssetBundle(base: string, fx: EffectData, info: RenderInfo, options: AssetBundleOptions = {}) {
  const size = options.maxTextureSize ?? 2048;
  if (!Number.isSafeInteger(size) || size < 1 || size > 4096) throw new RangeError("Asset pages must be 1..4096 pixels");
  if (!Number.isSafeInteger(info.n) || info.n < 1) throw new RangeError("Asset requires at least one frame");
  // The legacy 2D/ACT renderer is the default even when no project/profile was supplied.
  // Store that choice explicitly so another renderer cannot silently reinterpret raw channels.
  const renderMode = info.settings?.renderMode ??
    (info.settings?.project?.kind === "3d" || info.settings?.project?.renderProfile?.mode === "cinematic" ? "cinematic" : "legacy");
  if (!["legacy", "cinematic", "linear-transparent"].includes(renderMode)) throw new RangeError("Unsupported asset finishing mode");
  const packer = createAtlasPacker(size, options.padding ?? 1), name = basename(base), parent = dirname(base);
  mkdirSync(parent, { recursive: true });
  const temp = mkdtempSync(join(parent, ".poku-asset-"));
  const engineVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  const manifest: AssetManifest = {
    schema: "poku-asset/v1", id: fx.id, name: fx.meta.name, loop: !!fx.meta.loop, durationMs: 0,
    color: { format: "RGBA8888", colorSpace: "srgb", alpha: "straight" },
    coordinates: "untrimmed-pixel-edges-y-down", pages: [], frames: [],
    tags: options.tags ?? [{ name, from: 0, to: info.n - 1, direction: "forward" }],
    ...(info.contacts?.length ? { contacts: info.contacts } : {}),
    settings: { ...info.settings, renderMode },
    source: { engineVersion, rng: "poku-rng/v1",
      ...(fx.file && existsSync(fx.file) ? { sourceSha256: sha256(readFileSync(fx.file)) } : {}), ...options.source },
    files: [],
  };
  let activePage = -1, color: Uint8ClampedArray | undefined, emission: Float32Array | undefined;
  let radiance: Float32Array | undefined, occlusion: Float32Array | undefined;
  let channelMode: string | undefined, finished = false, count = 0;
  const duplicates = new Map<string, { page: number; rect: { x: number; y: number; w: number; h: number } }>();
  function write(path: string, data: Uint8Array) {
    writeFileSync(join(temp, path), data);
    manifest.files.push({ path, sha256: sha256(data), bytes: data.byteLength });
  }
  function flush() {
    if (activePage < 0 || !color) return;
    const { w, h } = packer.pages[activePage], rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) rgba.set(color.subarray(y * size * 4, (y * size + w) * 4), y * w * 4);
    const image = `${name}.${activePage}.color.png`;
    write(image, encodePNG(w, h, rgba));
    const page: AssetManifest["pages"][number] = { image, width: w, height: h };
    function floatPage(buffer: Float32Array, channels: 1 | 3, suffix: string) {
      const bytes = new Uint8Array(w * h * channels * 4), view = new DataView(bytes.buffer);
      for (let y = 0; y < h; y++) for (let x = 0; x < w * channels; x++)
        view.setFloat32((y * w * channels + x) * 4, buffer[y * size * channels + x], true);
      const image = `${name}.${activePage}.${suffix}.f32`; write(image, bytes); return image;
    }
    if (emission) page.emission = { image: floatPage(emission, 3, "emission"), format: "float32-le", channels: 3, colorSpace: "linear-srgb" };
    if (radiance) page.radiance = { image: floatPage(radiance, 3, "radiance"), format: "float32-le", channels: 3, colorSpace: "linear-srgb" };
    if (occlusion) page.occlusion = { image: floatPage(occlusion, 1, "occlusion"), format: "float32-le", channels: 1, colorSpace: "linear" };
    manifest.pages[activePage] = page;
  }
  return {
    manifest,
    push(frame: FrameData & { durationMs?: number; sockets?: Record<string, AssetSocket> }, index = count) {
      if (finished || index !== count || count >= info.n) throw new RangeError("Asset frames must arrive once, in order");
      const rgba = frame.layers?.color ?? frame.clear, light = frame.layers?.emission;
      const rad = frame.layers?.radiance, ao = frame.layers?.occlusion;
      if (rgba.length !== info.w * info.h * 4 || (light && light.length !== info.w * info.h * 3)
        || (rad && rad.length !== info.w * info.h * 3) || (ao && ao.length !== info.w * info.h)) throw new RangeError("Asset frame size mismatch");
      const mode = `${!!light},${!!rad},${!!ao}`;
      channelMode ??= mode;
      if (mode !== channelMode) throw new Error("Every frame must have the same asset channels");
      if (light && !light.every(v => Number.isFinite(v) && v >= 0)) throw new RangeError("Emission must be finite, non-negative linear RGB");
      if (rad && !rad.every(v => Number.isFinite(v) && v >= 0)) throw new RangeError("Radiance must be finite, non-negative linear RGB");
      if (ao && !ao.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new RangeError("Occlusion must be finite within 0..1");
      const bounds = options.trim ? frameContentBounds(info.w, info.h, rgba, light, rad, ao) : { x: 0, y: 0, w: info.w, h: info.h };
      const hash = createHash("sha256"); hash.update(`${bounds.w},${bounds.h};${mode};`);
      for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
        hash.update(rgba.subarray((y * info.w + bounds.x) * 4, (y * info.w + bounds.x + bounds.w) * 4));
        for (const [buffer, channels] of [[light, 3], [rad, 3], [ao, 1]] as const) if (buffer) {
          const row = buffer.subarray((y * info.w + bounds.x) * channels, (y * info.w + bounds.x + bounds.w) * channels);
          hash.update(new Uint8Array(row.buffer, row.byteOffset, row.byteLength));
        }
      }
      const key = hash.digest("hex"), previous = options.deduplicate ? duplicates.get(key) : undefined;
      const placement = previous ?? packer.place(bounds.w, bounds.h);
      if (!previous) {
        if (placement.page !== activePage) {
          flush(); activePage = placement.page;
          color = new Uint8ClampedArray(size * size * 4);
          emission = light ? new Float32Array(size * size * 3) : undefined;
          radiance = rad ? new Float32Array(size * size * 3) : undefined;
          occlusion = ao ? new Float32Array(size * size).fill(1) : undefined;
        }
        for (let y = 0; y < bounds.h; y++) {
          const src = (bounds.y + y) * info.w + bounds.x, dst = (placement.rect.y + y) * size + placement.rect.x;
          color!.set(rgba.subarray(src * 4, (src + bounds.w) * 4), dst * 4);
          if (light) emission!.set(light.subarray(src * 3, (src + bounds.w) * 3), dst * 3);
          if (rad) radiance!.set(rad.subarray(src * 3, (src + bounds.w) * 3), dst * 3);
          if (ao) occlusion!.set(ao.subarray(src, src + bounds.w), dst);
        }
        if (options.deduplicate) duplicates.set(key, placement);
      }
      const duration = frame.durationMs ?? frameDurationMs(index, info.fps);
      if (!Number.isSafeInteger(duration) || duration < 1 || !Number.isFinite(frame.t)) throw new RangeError("Asset frame timing is invalid");
      const pivot = frame.pivot ?? info.pivot ?? fx.meta.origin ?? [0, 0];
      manifest.frames.push({ ...placement, sourceSize: [info.w, info.h], trimOffset: [bounds.x, bounds.y],
        pivot: [pivot[0], pivot[1]], duration, time: frame.t,
        ...(frame.frozen ? { frozen: true } : {}), ...(frame.sockets ? { sockets: frame.sockets } : {}),
        ...(frame.camera ? { camera: frame.camera } : {}) });
      manifest.durationMs += duration; count++;
    },
    finish() {
      if (finished || count !== info.n) throw new Error(`Expected ${info.n} asset frames, received ${count}`);
      flush();
      const events = collectAssetEvents({ ...fx.mod, meta: fx.meta });
      if (events.length) manifest.events = resolveAssetEvents(events, manifest.frames, fx.meta.loop ? fx.meta.duration : undefined);
      const file = `${name}.asset.json`;
      writeFileSync(join(temp, file), JSON.stringify(manifest, null, 2) + "\n");
      for (const entry of manifest.files) renameSync(join(temp, entry.path), join(parent, entry.path));
      renameSync(join(temp, file), join(parent, file));
      rmSync(temp, { recursive: true, force: true }); finished = true; color = undefined; emission = radiance = occlusion = undefined;
      return { manifest, file: join(parent, file), files: [...manifest.files.map(f => join(parent, f.path)), join(parent, file)] };
    },
    abort() { if (!finished) rmSync(temp, { recursive: true, force: true }); color = undefined; emission = radiance = occlusion = undefined; },
  };
}

/** Game atlas writer: source-over color/coverage plus unclamped additive linear RGB. */
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { canvas, save, sheetMetadata, type EffectData, type FrameData, type RenderInfo } from "./fxlib.mjs";

/**
 * Write HDR scanlines directly to a temporary atlas file. Only the final color
 * PNG canvas and one frame of linear data are kept in RAM, not an HDR sequence.
 */
export function createLayerSheet(base: string, fx: EffectData, info: RenderInfo) {
  const colorFile = base + ".color.png", emissionFile = base + ".emission.f32", jsonFile = base + ".layers.json";
  const json = sheetMetadata(fx, info, basename(base), basename(colorFile));
  const { w, h } = json.meta.size, color = canvas(w, h, [0, 0, 0, 0]);
  mkdirSync(dirname(base), { recursive: true });
  const temp = mkdtempSync(join(dirname(base), ".poku-layers-")), raw = join(temp, "emission.f32"), fd = openSync(raw, "w");
  const lighting = new Map<string, { fd: number; raw: string; output: string; channels: number }>();
  let lightingMode: string | undefined;
  let count = 0, closed = false, finished = false;
  try { ftruncateSync(fd, w * h * 3 * 4); }
  catch (error) { closeSync(fd); rmSync(temp, { recursive: true, force: true }); throw error; }
  const close = () => { if (!closed) { closeSync(fd); for (const file of lighting.values()) closeSync(file.fd); closed = true; } };
  json.meta.pokuFx.layers = {
    color: { image: basename(colorFile), format: "RGBA8888", colorSpace: "srgb", alpha: "straight", blend: "source-over" },
    emission: { image: basename(emissionFile), format: "float32-le", channels: 3, colorSpace: "linear-srgb",
      layout: "row-major-interleaved-rgb", alpha: "none", blend: "add", size: { w, h } },
    composition: "linear(color.rgb) * color.a + linear(scene.rgb) * (1 - color.a) + emission.rgb",
  };
  return {
    push(frame: FrameData, index = count) {
      const layers = frame.layers, rect = json.frames[index]?.frame;
      if (!layers || !rect || layers.color.length !== info.w * info.h * 4 || layers.emission.length !== info.w * info.h * 3)
        throw new Error("Layer atlas needs color/coverage and linear emission for every frame");
      color.copy(layers.color, info.w, info.h, rect.x, rect.y);
      const bytes = new Uint8Array(layers.emission.length * 4), view = new DataView(bytes.buffer);
      for (let i = 0; i < layers.emission.length; i++) view.setFloat32(i * 4, layers.emission[i], true);
      const stride = info.w * 3 * 4;
      for (let y = 0; y < info.h; y++) {
        const position = ((rect.y + y) * w + rect.x) * 3 * 4;
        let written = 0;
        while (written < stride) written += writeSync(fd, bytes, y * stride + written, stride - written, position + written);
      }
      const mode = `${!!layers.radiance},${!!layers.occlusion}`;
      lightingMode ??= mode;
      if (mode !== lightingMode) throw new Error("Every layer frame must have the same lighting channels");
      for (const [name, data, channels] of [["radiance", layers.radiance, 3], ["occlusion", layers.occlusion, 1]] as const) {
        if (!data) continue;
        if (data.length !== info.w * info.h * channels || !data.every(v => Number.isFinite(v) && v >= 0 && (name !== "occlusion" || v <= 1)))
          throw new RangeError(`Invalid ${name} layer`);
        let file = lighting.get(name);
        if (!file) {
          const raw = join(temp, `${name}.f32`), output = `${base}.${name}.f32`, extra = openSync(raw, "w");
          file = { fd: extra, raw, output, channels }; lighting.set(name, file);
          ftruncateSync(extra, w * h * channels * 4);
          if (name === "occlusion") {
            const row = new Uint8Array(w * 4), view = new DataView(row.buffer);
            for (let x = 0; x < w; x++) view.setFloat32(x * 4, 1, true);
            for (let y = 0; y < h; y++) {
              let written = 0;
              while (written < row.length) written += writeSync(extra, row, written, row.length - written, y * row.length + written);
            }
          }
          json.meta.pokuFx.layers[name] = { image: basename(output), format: "float32-le", channels,
            colorSpace: name === "occlusion" ? "linear" : "linear-srgb", size: { w, h },
            role: "camera-lighting-snapshot", ...(name === "occlusion" ? { neutral: 1 } : {}) };
          json.meta.pokuFx.layers.composition = "(linear(color.rgb) * color.a + linear(scene.rgb) * (1 - color.a)) * occlusion + emission.rgb * lightStrength + radiance.rgb; apply stored cinematic profile";
        }
        const row = new Uint8Array(info.w * channels * 4), view = new DataView(row.buffer);
        for (let y = 0; y < info.h; y++) {
          for (let x = 0; x < info.w * channels; x++) view.setFloat32(x * 4, data[y * info.w * channels + x], true);
          const position = ((rect.y + y) * w + rect.x) * channels * 4;
          let written = 0;
          while (written < row.length) written += writeSync(file.fd, row, written, row.length - written, position + written);
        }
      }
      json.meta.pokuFx.timeSamples[index] = frame.t;
      if (frame.frozen) (json.meta.pokuFx.frozenFrames ??= []).push(index);
      if (frame.camera) (json.meta.pokuFx.cameraSamples ??= [])[index] = frame.camera;
      if (frame.pivot) (json.meta.pokuFx.pivotSamples ??= [])[index] = frame.pivot;
      count++;
    },
    finish() {
      if (count !== info.n) throw new RangeError(`Expected ${info.n} layer frames, received ${count}`);
      close();
      save(colorFile, color.png()); renameSync(raw, emissionFile);
      for (const file of lighting.values()) renameSync(file.raw, file.output);
      save(jsonFile, JSON.stringify(json, null, 2));
      rmSync(temp, { recursive: true, force: true }); finished = true;
      return [colorFile, emissionFile, ...[...lighting.values()].map(file => file.output), jsonFile];
    },
    abort() { close(); if (!finished) rmSync(temp, { recursive: true, force: true }); },
  };
}

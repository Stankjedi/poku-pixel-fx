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
  let count = 0, closed = false, finished = false;
  try { ftruncateSync(fd, w * h * 3 * 4); }
  catch (error) { closeSync(fd); rmSync(temp, { recursive: true, force: true }); throw error; }
  const close = () => { if (!closed) { closeSync(fd); closed = true; } };
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
      save(jsonFile, JSON.stringify(json, null, 2));
      rmSync(temp, { recursive: true, force: true }); finished = true;
      return [colorFile, emissionFile, jsonFile];
    },
    abort() { close(); if (!finished) rmSync(temp, { recursive: true, force: true }); },
  };
}

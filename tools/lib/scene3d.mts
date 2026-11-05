/** Shared deterministic 3D camera/render contract for inspection, video and game atlases. */
import { exportCamera3D } from "./camera3d.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EffectData, FrameData, RenderSequence, RenderOptions } from "./fxlib.mjs";
const { createFrame3D, compositeFrame3D, Painter3D, createFx3D, enableHDRLight, CinematicLighting3D, CinematicCompositor } = await import(new URL("../../../build/3d/index.js", import.meta.url).href);
const { separateFrameLayers } = await import(new URL("../../../build/render/export.js", import.meta.url).href);
const { createRenderProfile3D, parseRenderProfile3D } = await import(new URL("../../../build/render/profile3d.js", import.meta.url).href);
const effectFiles = {
  frost: "frost-nova", slash: "arc-slash", blackhole: "black-hole", wind: "wind-rasenshuriken",
  windOriginal: "wind-rasenshuriken-legacy", shatter: "ice-shatter", flame: "thermal-plume", lightning: "forked-lightning",
  water: "crown-splash", voidrift: "void-rift", meteor: "meteor-impact", laser: "coherent-laser", shield: "energy-shield",
};
export const effectNames3D = Object.keys(effectFiles);
export const positiveInteger = (value: string | undefined, fallback: number, name: string) => {
  const n = Number(value ?? fallback);
  if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError(`${name} must be a positive integer`);
  return n;
};
export function parseFlags3D(args: string[]) {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) throw new Error("Expected --option value");
    const key = args[i].slice(2), next = args[i + 1];
    if (["atlas", "layers", "bundle", "trim", "deduplicate"].includes(key) && (next === undefined || next.startsWith("--"))) flags[key] = "true";
    else {
      if (next === undefined || next.startsWith("--")) throw new Error(`${args[i]} requires a value`);
      flags[key] = next; i++;
    }
  }
  return flags;
}

export async function scene3D(name: string, flags: Record<string, string>, mode: "contact" | "atlas" | "video", finishing: Pick<RenderOptions, "postprocess" | "finalizeRGBA" | "diagnostics"> = {}) {
  if (!Object.prototype.hasOwnProperty.call(effectFiles, name)) throw new Error(`Unknown 3D effect. Choose ${effectNames3D.join(" | ")}`);
  const mod = await import(new URL(`../../../build/3d/effects/${effectFiles[name as keyof typeof effectFiles]}.js`, import.meta.url).href);
  const atlas = mode === "atlas", video = mode === "video", isWind = name === "wind" || name === "windOriginal";
  const inputProfile = flags.profile ? parseRenderProfile3D(readFileSync(flags.profile, "utf8"))
    : flags["profile-json"] ? parseRenderProfile3D(flags["profile-json"]) : createRenderProfile3D(name);
  if (inputProfile.effectId !== name) throw new Error("Render profile belongs to a different 3D effect");
  const w = positiveInteger(flags.width, inputProfile.nativeSize[0], "width"), h = positiveInteger(flags.height, inputProfile.nativeSize[1], "height");
  const fps = Number(flags.fps ?? (video ? 20 : 30));
  if (!Number.isFinite(fps) || fps <= 0 || fps > 1000) throw new RangeError("fps must be in (0, 1000]");
  const n = positiveInteger(flags.frames, mode === "contact" ? 24 : video ? Math.ceil(mod.meta.duration * fps)
    : Math.max(1, Math.round(mod.meta.duration * fps) + (mod.meta.loop ? 0 : 1)), "frames");
  const seed = Number(flags.seed ?? mod.meta.options.seed);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError("seed must be a non-negative integer");
  const options = { ...mod.meta.options, ...(flags.opts ? JSON.parse(flags.opts) : {}), seed };
  const baseCamera = { ...inputProfile.camera, ...exportCamera3D(flags, { ...inputProfile.camera, target: inputProfile.camera.target ?? [0, 0, 0] }) };
  const cinematic = flags.cinematic === undefined ? !atlas : flags.cinematic === "true" || flags.cinematic === "1";
  const background = flags.background ?? (atlas ? "none" : inputProfile.background ?? "none");
  const grid = flags.grid === undefined ? !atlas && inputProfile.grid : flags.grid === "true";
  const cameraMotion = flags["camera-motion"] === undefined ? !atlas && inputProfile.cameraMotion : flags["camera-motion"] === "true";
  const profile = createRenderProfile3D(name, { ...inputProfile, camera: baseCamera,
    nativeSize: [w, h], background: background === "none" ? null : background, grid, cameraMotion });
  const rig = profile.lights;
  const anchor = new Painter3D(createFrame3D(w, h), baseCamera).project([0, 0, 0]);
  const settings = {
    output: atlas ? "game-atlas-3d" : mode === "contact" ? "inspection-sheet-3d" : "preview-video-3d",
    fps: mode === "contact" ? undefined : fps, seed, loop: !!mod.meta.loop, options, camera: baseCamera, cameraMotion,
    renderProfile: profile,
    worldPivot: [0, 0, 0], background: background === "none" ? "transparent" : background, grid,
    renderMode: cinematic ? "cinematic" : atlas || background === "none" ? "linear-transparent" : "legacy",
    terminalFrame: mode === "contact" ? "inspection-samples" : flags.frames !== undefined ? "explicit-frame-count"
      : atlas && !mod.meta.loop ? "included" : "excluded",
    timeline: { duration: mod.meta.duration, stages: mod.meta.stages ?? [], cues: mod.meta.cues ?? [] },
    ...(atlas ? { layers: { color: "palette-material", emission: "linear-hdr",
      ...(cinematic ? { radiance: "camera-lighting-snapshot", occlusion: "camera-ambient-occlusion-snapshot" } : {}),
      cinematicFinishing: "reapply-profile-at-playback", relightableGeometry: false } } : {}),
  };
  const sequence: RenderSequence = {
    w, h, fps, n, pivot: [anchor.x, anchor.y], settings,
    frames: {
      *[Symbol.iterator](): Generator<FrameData> {
        const frame = createFrame3D(w, h), fx = createFx3D(mod, options), painter = new Painter3D(frame, baseCamera);
        if (atlas || cinematic) enableHDRLight(frame);
        const lighting = new CinematicLighting3D(), film = new CinematicCompositor();
        let previous = 0;
        for (let i = 0; i < n; i++) {
          const time = mode === "contact" ? i / Math.max(1, n - 1) * mod.meta.duration : i / fps;
          if (i > 0) fx.update(time - previous);
          previous = time;
          const camera = cameraMotion ? fx.camera(baseCamera) : baseCamera;
          if (finishing.postprocess) (frame as any).semanticMasks = Object.create(null);
          painter.setCamera(camera).begin(background === "none" ? 0 : background);
          if (grid) painter.grid(8, 1);
          fx.draw(painter);
          finishing.postprocess?.(frame, time, i, { space: 'screen-only', cameraOffset: [0, 0] });
          const rgba = new Uint8ClampedArray(w * h * 4);
          let shade: { radiance: Float32Array; occlusion: Float32Array } | undefined;
          if (cinematic) {
            const evaluated = lighting.evaluate(frame, painter.camera, rig, profile.lighting);
            shade = evaluated;
            film.render(frame, rgba, {
              ...profile.cinematic,
              background: background === "none" ? null : undefined,
              radiance: evaluated.radiance, occlusion: evaluated.occlusion,
            });
          } else if (atlas || background === "none") {
            film.render(frame, rgba, { background: null, bloom: false, exposure: 1, toneMap: "none", saturation: 1, contrast: 1, vignette: 0 });
          } else compositeFrame3D(frame, rgba);
          finishing.finalizeRGBA?.(rgba);
          const pivot = cameraMotion ? painter.project([0, 0, 0]) : anchor;
          yield { t: time, color: rgba, clear: rgba, ...(atlas ? { layers: separateFrameLayers(frame, shade) } : {}),
            ...(finishing.diagnostics ? { raw: frame.color.slice(), light: frame.light.slice() } : {}),
            ...(cameraMotion ? { camera, pivot: [pivot.x, pivot.y] } : {}) };
        }
      },
    },
  };
  const effect: EffectData = { id: mod.meta.id, file: fileURLToPath(new URL(`../../../src/3d/effects/${effectFiles[name as keyof typeof effectFiles]}.ts`, import.meta.url)), mod, meta: {
    name: mod.meta.name, size: [w, h], origin: sequence.pivot, duration: mod.meta.duration, loop: mod.meta.loop, fps, options, cues: mod.meta.cues,
  } };
  return { sequence, effect, meta: mod.meta, options, camera: baseCamera, cameraMotion, cinematic, background, grid };
}

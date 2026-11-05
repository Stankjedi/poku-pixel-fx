/** Shared deterministic 3D camera/render contract for inspection, video and game atlases. */
import { exportCamera3D } from "./camera3d.mjs";
import type { EffectData, FrameData, RenderSequence } from "./fxlib.mjs";
const { createFrame3D, compositeFrame3D, Painter3D, createFx3D, enableHDRLight, CinematicLighting3D, CinematicCompositor } = await import(new URL("../../../build/3d/index.js", import.meta.url).href);
const { separateFrameLayers } = await import(new URL("../../../build/render/export.js", import.meta.url).href);
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
    if (["atlas", "layers"].includes(key) && (next === undefined || next.startsWith("--"))) flags[key] = "true";
    else {
      if (next === undefined || next.startsWith("--")) throw new Error(`${args[i]} requires a value`);
      flags[key] = next; i++;
    }
  }
  return flags;
}

export async function scene3D(name: string, flags: Record<string, string>, mode: "contact" | "atlas" | "video") {
  if (!Object.prototype.hasOwnProperty.call(effectFiles, name)) throw new Error(`Unknown 3D effect. Choose ${effectNames3D.join(" | ")}`);
  const mod = await import(new URL(`../../../build/3d/effects/${effectFiles[name as keyof typeof effectFiles]}.js`, import.meta.url).href);
  const atlas = mode === "atlas", video = mode === "video", isWind = name === "wind" || name === "windOriginal";
  const w = positiveInteger(flags.width, video ? 260 : 192, "width"), h = positiveInteger(flags.height, video ? 180 : 128, "height");
  const fps = Number(flags.fps ?? (video ? 20 : 30));
  if (!Number.isFinite(fps) || fps <= 0 || fps > 1000) throw new RangeError("fps must be in (0, 1000]");
  const n = positiveInteger(flags.frames, mode === "contact" ? 24 : video ? Math.ceil(mod.meta.duration * fps)
    : Math.max(1, Math.round(mod.meta.duration * fps) + (mod.meta.loop ? 0 : 1)), "frames");
  const seed = Number(flags.seed ?? mod.meta.options.seed);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError("seed must be a non-negative integer");
  const options = { ...mod.meta.options, ...(flags.opts ? JSON.parse(flags.opts) : {}), seed };
  const baseCamera = exportCamera3D(flags, {
    yaw: isWind ? 0.32 : 0.68, elevation: isWind ? 0.22 : 28 * Math.PI / 180,
    zoom: name === "shield" ? 1.45 : name === "laser" ? 1.45 : name === "meteor" ? 0.98 : name === "voidrift" ? 1.3 : name === "blackhole" ? 1.36 : isWind ? 1.18 : name === "shatter" ? 1.2 : name === "flame" ? 1.65 : name === "lightning" ? 1.35 : name === "water" ? 1.28 : 1,
    target: [0, name === "shield" ? 2.1 : name === "laser" ? 1.2 : name === "meteor" ? 2.3 : name === "voidrift" ? 2.5 : name === "water" ? 1.05 : name === "lightning" ? 2.6 : name === "flame" ? 1.95 : name === "shatter" ? 1.1 : name === "slash" ? 1.4 : name === "blackhole" ? 1.12 : isWind ? 2.35 : 0.75, 0],
  });
  const cinematic = flags.cinematic === "true" || flags.cinematic === "1";
  const background = flags.background ?? (atlas ? "none" : name === "blackhole" ? "#05030d" : isWind ? "#061222" : "#0a1525");
  const grid = flags.grid === "true" || (flags.grid !== "false" && !atlas && name !== "blackhole" && !isWind);
  const cameraMotion = flags["camera-motion"] === "true" || (flags["camera-motion"] !== "false" && !atlas);
  const rig = name === "voidrift" || ["meteor", "laser", "shield", "wind"].includes(name) ? [] : [
    { position: [-2.3, 3.2, 1.6] as const, radius: 7, color: "#88dfff", intensity: 1.75, specular: 0.5, rim: 0.2 },
    { position: [2.4, 2.1, -1.7] as const, radius: 6, color: "#ff9dce", intensity: 1.3, specular: 0.38, rim: 0.22 },
  ];
  const anchor = new Painter3D(createFrame3D(w, h), baseCamera).project([0, 0, 0]);
  const settings = {
    output: atlas ? "game-atlas-3d" : mode === "contact" ? "inspection-sheet-3d" : "preview-video-3d",
    fps: mode === "contact" ? undefined : fps, seed, loop: !!mod.meta.loop, options, camera: baseCamera, cameraMotion,
    worldPivot: [0, 0, 0], background: background === "none" ? "transparent" : background, grid,
    renderMode: cinematic ? "cinematic" : atlas || background === "none" ? "linear-transparent" : "legacy",
    terminalFrame: mode === "contact" ? "inspection-samples" : flags.frames !== undefined ? "explicit-frame-count"
      : atlas && !mod.meta.loop ? "included" : "excluded",
    timeline: { duration: mod.meta.duration, stages: mod.meta.stages ?? [], cues: mod.meta.cues ?? [] },
    ...(atlas ? { layers: { color: "palette-material", emission: "linear-hdr", cinematicFinishing: "composite-preview-only" } } : {}),
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
          painter.setCamera(camera).begin(background === "none" ? 0 : background);
          if (grid) painter.grid();
          fx.draw(painter);
          const rgba = new Uint8ClampedArray(w * h * 4);
          if (cinematic) {
            const shade = lighting.evaluate(frame, painter.camera, rig, {
              ambientOcclusion: { radius: 3, bias: 0.1, intensity: 0.36 },
            });
            film.render(frame, rgba, {
              background: background === "none" ? null : undefined,
              radiance: shade.radiance, occlusion: shade.occlusion,
              bloom: { threshold: 0.12, knee: 0.2, intensity: 1.1, levels: 4 },
              exposure: 1.25, toneMap: "aces", saturation: 1.12, contrast: 1.05, vignette: 0.07, chromaticFringe: 0.5,
            });
          } else if (atlas || background === "none") {
            film.render(frame, rgba, { background: null, bloom: false, exposure: 1, toneMap: "none", saturation: 1, contrast: 1, vignette: 0 });
          } else compositeFrame3D(frame, rgba);
          const pivot = cameraMotion ? painter.project([0, 0, 0]) : anchor;
          yield { t: time, color: rgba, clear: rgba, ...(atlas ? { layers: separateFrameLayers(frame) } : {}),
            ...(cameraMotion ? { camera, pivot: [pivot.x, pivot.y] } : {}) };
        }
      },
    },
  };
  const effect: EffectData = { id: mod.meta.id, file: "", mod: {}, meta: {
    name: mod.meta.name, size: [w, h], origin: sequence.pivot, duration: mod.meta.duration, loop: mod.meta.loop, fps, options,
  } };
  return { sequence, effect, meta: mod.meta, options, camera: baseCamera, cameraMotion, cinematic, background, grid };
}

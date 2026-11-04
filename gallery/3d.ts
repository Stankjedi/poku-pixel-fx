import { createFrame3D, compositeFrame3D, Painter3D, createFx3D, CinematicCompositor, CinematicLighting3D, enableHDRLight, type PointLight3D, type Camera3D, type FxInstance3D } from "../src/3d/index.js";
import * as shield from "../src/3d/effects/energy-shield.js";
import * as voidrift from "../src/3d/effects/void-rift.js";
import * as laser from "../src/3d/effects/coherent-laser.js";
import * as meteor from "../src/3d/effects/meteor-impact.js";
import * as water from "../src/3d/effects/crown-splash.js";
import * as lightning from "../src/3d/effects/forked-lightning.js";
import * as frost from "../src/3d/effects/frost-nova.js";
import * as slash from "../src/3d/effects/arc-slash.js";
import * as blackhole from "../src/3d/effects/black-hole.js";
import * as wind from "../src/3d/effects/wind-rasenshuriken.js";
import * as windOriginal from "../src/3d/effects/wind-rasenshuriken-legacy.js";

import * as flame from "../src/3d/effects/thermal-plume.js";
import * as shatter from "../src/3d/effects/ice-shatter.js";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const screen = document.querySelector<HTMLElement>("#screen")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const readout = document.querySelector<HTMLElement>("#readout")!;
const status = document.querySelector<HTMLElement>("#status")!;
const pixelSlider = document.querySelector<HTMLInputElement>("#pixel")!;
const elevationSlider = document.querySelector<HTMLInputElement>("#elevation")!;
const seedText = document.querySelector<HTMLElement>("#seedText")!;
const ctx = canvas.getContext("2d", { alpha: false })!;
const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d", { alpha: false })!;
const effects = { frost, slash, blackhole, wind, windOriginal, shatter, flame, lightning, water, voidrift, meteor, laser, shield };
let selected: keyof typeof effects = "blackhole";
let instance: FxInstance3D<shield.EnergyShield3DOptions> | FxInstance3D<laser.CoherentLaser3DOptions> | FxInstance3D<meteor.MeteorImpact3DOptions> | FxInstance3D<voidrift.VoidRift3DOptions> | FxInstance3D<frost.FrostNova3DOptions> | FxInstance3D<slash.ArcSlash3DOptions> | FxInstance3D<blackhole.BlackHole3DOptions> | FxInstance3D<wind.WindRasenshurikenOptions> | FxInstance3D<windOriginal.WindShurikenLegacyOptions> | FxInstance3D<flame.ThermalPlume3DOptions> | FxInstance3D<shatter.IceShatter3DOptions> | FxInstance3D<lightning.ForkedLightning3DOptions> | FxInstance3D<water.CrownSplash3DOptions> = createFx3D(blackhole, {});
let width = 0, height = 0, last = performance.now(), paused = false;
let frame = createFrame3D(16, 16), painter = new Painter3D(frame), image = offCtx.createImageData(16, 16);
let pixel = 3, yaw = 0.68, elevation = 28 * Math.PI / 180, zoom = 1, glow = true;
let dragging = false, prevX = 0, prevY = 0;
let seed = blackhole.meta.options.seed;

const cinematic = new CinematicCompositor();
const worldLights = new CinematicLighting3D();
// Preserve the original luminous wind rig only for the legacy energy-styled version.
const windRig: PointLight3D[] = [
  { position: [-2.1, 3.5, 1.7], radius: 7, color: "#70efff", intensity: 1.65, specular: 0.5, rim: 0.25 },
  { position: [2.4, 2.1, -1.8], radius: 6, color: "#8b9dff", intensity: 1.15, specular: 0.38, rim: 0.22 },
];
const rigs: Record<keyof typeof effects, PointLight3D[]> = {
  blackhole: [
    { position: [-2.3, 3.3, 1.5], radius: 6.5, color: "#ff874b", intensity: 1.8, specular: 0.5, rim: 0.25 },
    { position: [2.5, 1.9, -2.2], radius: 5.5, color: "#7b56ff", intensity: 1.35, specular: 0.42, rim: 0.32 },
  ],
  frost: [
    { position: [-2.2, 2.8, 2.0], radius: 7.1, color: "#6fe5ff", intensity: 1.9, specular: 0.55, rim: 0.32 },
    { position: [2.2, 1.3, -1.8], radius: 6.5, color: "#9d79ff", intensity: 1.05, specular: 0.36 },
  ],
  slash: [
    { position: [-1.2, 3.2, 1.8], radius: 7, color: "#96ccff", intensity: 1.6, specular: 0.6 },
    { position: [2.6, 2.0, -1.8], radius: 6.4, color: "#eb82ff", intensity: 1.4, specular: 0.42, rim: 0.3 },
  ],
  shatter: [
    { position: [-2.2, 4, 2], radius: 7, color: "#91e8fa", intensity: 1.2, specular: 0.6 },
    { position: [2, 2, -2], radius: 6, color: "#486dc4", intensity: 0.6, specular: 0.3 },
  ],
  flame: [],
  lightning: [],
  water: [],
  meteor: [],
  laser: [],
  shield: [],
  voidrift: [],
  wind: [],
  windOriginal: windRig,
};

function syncLabels() {
  document.querySelector<HTMLElement>("#pxText")!.textContent = `${pixel}×`;
  document.querySelector<HTMLElement>("#elText")!.textContent = `${Math.round(elevation * 180 / Math.PI)}°`;
  seedText.textContent = `SEED ${seed}`;
}
function chooseEffect(name: keyof typeof effects) {
  selected = name;
  if (name === "frost") instance = createFx3D(frost, { seed });
  else if (name === "voidrift") instance = createFx3D(voidrift, { seed });
  else if (name === "shield") instance = createFx3D(shield, { seed });
  else if (name === "laser") instance = createFx3D(laser, { seed });
  else if (name === "meteor") instance = createFx3D(meteor, { seed });
  else if (name === "water") instance = createFx3D(water, { seed });
  else if (name === "lightning") instance = createFx3D(lightning, { seed });
  else if (name === "flame") instance = createFx3D(flame, { seed });
  else if (name === "shatter") instance = createFx3D(shatter, { seed });
  else if (name === "slash") instance = createFx3D(slash, { seed });
  else if (name === "wind") instance = createFx3D(wind, { seed });
  else if (name === "windOriginal") instance = createFx3D(windOriginal, { seed });
  else instance = createFx3D(blackhole, { seed });
  status.textContent = instance.meta.description;
}
function resize() {
  const box = screen.getBoundingClientRect();
  const sample = Math.max(pixel, box.width / (selected === "flame" ? 192 : selected === "meteor" ? 260 : 400), box.height / (selected === "flame" ? 144 : selected === "meteor" ? 180 : 300));
  const w = Math.max(96, Math.ceil(box.width / sample)), h = Math.max(72, Math.ceil(box.height / sample));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = Math.max(1, Math.round(box.width * dpr)), ch = Math.max(1, Math.round(box.height * dpr));
  if (width === w && height === h && canvas.width === cw && canvas.height === ch) return;
  width = w; height = h;
  frame = createFrame3D(w, h);
  painter = new Painter3D(frame);
  offscreen.width = w; offscreen.height = h;
  image = offCtx.createImageData(w, h);
  canvas.width = cw; canvas.height = ch;
  ctx.imageSmoothingEnabled = false;
}
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
function render() {
  resize();
  // The cinematic black hole writes/reprojects light directly; retain its legacy
  // emission fallback while all Painter3D-only effects capture unclamped HDR.
  if (selected === "blackhole") frame.hdrLight = undefined;
  else enableHDRLight(frame);
  const isBlackHole = selected === "blackhole";
  const isWind = selected === "wind" || selected === "windOriginal";
  const baseCamera: Camera3D = {
    yaw, elevation, zoom: zoom * (selected === "shield" ? 1.45 : selected === "laser" ? 1.45 : selected === "meteor" ? 0.98 : selected === "voidrift" ? 1.3 : isBlackHole ? 1.36 : isWind ? 1.18 : selected === "shatter" ? 1.2 : selected === "flame" ? 1.65 : selected === "lightning" ? 1.35 : selected === "water" ? 1.28 : 1),
    target: [0, selected === "shield" ? 2.1 : selected === "laser" ? 1.2 : selected === "meteor" ? 2.3 : selected === "voidrift" ? 2.5 : selected === "water" ? 1.05 : selected === "lightning" ? 2.6 : selected === "flame" ? 1.95 : selected === "shatter" ? 1.1 : selected === "slash" ? 1.4 : isBlackHole ? 1.12 : isWind ? 2.35 : 0.75, 0],
  };
  const camera = reducedMotion.matches ? baseCamera : instance.camera(baseCamera);
  painter.setCamera(camera).begin(isBlackHole ? "#05030d" : isWind ? "#061222" : "#0a1525");
  if (!isBlackHole && !isWind) painter.grid(8, 1);
  instance.draw(painter);
  if (glow) {
    const lighting = worldLights.evaluate(frame, camera, rigs[selected], {
      ambientOcclusion: { radius: 3, bias: 0.1, intensity: 0.34 },
    });
    cinematic.render(frame, image.data, {
      radiance: lighting.radiance, occlusion: lighting.occlusion,
      bloom: { threshold: 0.12, knee: 0.2, intensity: 1.1, levels: 4 },
      toneMap: "aces", exposure: 1.3, saturation: 1.12, contrast: 1.05,
      vignette: 0.07, chromaticFringe: 0.55,
    });
  } else compositeFrame3D(frame, image.data, 0);
  offCtx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
}
function animation(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (!paused) {
    instance.update(dt);
    if (instance.done()) instance.restart();
  }
  render();
  readout.textContent = `${instance.t.toFixed(2)} / ${instance.meta.duration.toFixed(2)} s`;
  stage.textContent = instance.stage();
  requestAnimationFrame(animation);
}
function button(id: string, handler: () => void) { document.querySelector<HTMLButtonElement>(id)!.addEventListener("click", handler); }
button("#replay", () => { instance.restart(); paused = false; document.querySelector<HTMLButtonElement>("#pause")!.textContent = "Ⅱ PAUSE"; });
button("#pause", () => {
  paused = !paused;
  document.querySelector<HTMLButtonElement>("#pause")!.textContent = paused ? "▶ PLAY" : "Ⅱ PAUSE";
});
button("#seed", () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  chooseEffect(selected); syncLabels();
});
button("#save", () => {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `poku-3d-${selected}-${instance.t.toFixed(2)}.png`;
  a.click();
});
document.querySelector<HTMLSelectElement>("#effect")!.addEventListener("change", e => {
  const value = (e.target as HTMLSelectElement).value;
  if (Object.prototype.hasOwnProperty.call(effects, value)) {
    const key = value as keyof typeof effects;
    seed = effects[key].meta.options.seed;
    chooseEffect(key); syncLabels();
  }
});
pixelSlider.addEventListener("input", () => { pixel = +pixelSlider.value; syncLabels(); });
elevationSlider.addEventListener("input", () => { elevation = +elevationSlider.value * Math.PI / 180; syncLabels(); });
document.querySelector<HTMLInputElement>("#glow")!.addEventListener("change", e => { glow = (e.target as HTMLInputElement).checked; });
canvas.addEventListener("pointerdown", e => { dragging = true; prevX = e.clientX; prevY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  yaw += (e.clientX - prevX) * 0.008;
  elevation = Math.max(0.15, Math.min(1.35, elevation + (e.clientY - prevY) * 0.005));
  elevationSlider.value = String(Math.round(elevation * 180 / Math.PI));
  prevX = e.clientX; prevY = e.clientY; syncLabels();
});
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointercancel", () => { dragging = false; });
canvas.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.max(0.6, Math.min(2, zoom * Math.exp(-e.deltaY * 0.001))); }, { passive: false });
window.addEventListener("keydown", e => { if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); instance.restart(); paused = false; } });
document.addEventListener("visibilitychange", () => { last = performance.now(); });
chooseEffect(selected); syncLabels();
requestAnimationFrame(animation);

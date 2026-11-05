import { createRenderProfile3D, parseRenderProfile3D, type RenderProfile3D } from '../src/render/profile3d.js';
import { integerViewport, PlaybackClock } from '../src/authoring/clock.js';
import { createProject, parseProject, serializeProject, type ResolvedProject } from '../src/authoring/project.js';
import { CinematicFrameRenderer } from '../src/render/webgpu.js';
import { encodeRGBAPNG } from './png.js';
import { postprocessProjectFrame,finishProjectRGBA } from '../src/authoring/edits.js';
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
let width = 0, height = 0, last = performance.now(), paused = false, dirty = true;
let frame = createFrame3D(16, 16), painter = new Painter3D(frame), image = offCtx.createImageData(16, 16);
let pixel = 3, yaw = 0.68, elevation = 28 * Math.PI / 180, zoom = 1, glow = true;
let dragging = false, prevX = 0, prevY = 0;
let seed = blackhole.meta.options.seed;
let projectOptions:Record<string,any>={},projectName='';
let loadedProject:ResolvedProject|undefined;
const previewProject=createProject({id:'3d/preview',kind:'3d'});
const selectedFps=()=>loadedProject?.fps??30;
const presentationClock=new PlaybackClock(blackhole.meta.duration,true);
presentationClock.playing=true;

const cinematic = new CinematicCompositor();
const worldLights = new CinematicLighting3D();
let profile = createRenderProfile3D(selected);
let cinematicRenderer: CinematicFrameRenderer | null = null;
let exactPixels = true;
let rendererRequest = 0;
async function selectRenderer() {
  const token=++rendererRequest;
  cinematicRenderer?.dispose(); cinematicRenderer=null;
  const backend=(document.querySelector<HTMLSelectElement>('#backend')!.value==='webgpu'?'webgpu':'cpu');
  try {
    const candidate=await CinematicFrameRenderer.create(offscreen,{backend,onStatus: (s:any)=>{document.querySelector('#renderer-status')!.textContent=JSON.stringify(s);}});
    if(token!==rendererRequest){candidate.dispose();return;}
    cinematicRenderer=candidate;dirty=true;
  } catch(error){ document.querySelector('#renderer-status')!.textContent=`CPU · ${String(error)}`; }
}

function syncLabels() {
  document.querySelector<HTMLElement>("#pxText")!.textContent = `${pixel}×`;
  document.querySelector<HTMLElement>("#elText")!.textContent = `${Math.round(elevation * 180 / Math.PI)}°`;
  seedText.textContent = `SEED ${seed}`;
}
function chooseEffect(name: keyof typeof effects) {
  dirty = true;
  selected = name; profile = createRenderProfile3D(name);
  instance = (createFx3D as any)(effects[name],{...projectOptions,seed});
  presentationClock.duration=loadedProject?.seconds??instance.meta.duration;presentationClock.reset();
  document.querySelector<HTMLInputElement>('#timeline')!.max=String(presentationClock.duration);
  document.querySelector<HTMLInputElement>('#timeline')!.step=String(1/selectedFps());
  status.textContent = instance.meta.description;
  profileFields();
}
function resize() {
  const box = screen.getBoundingClientRect();
  const [w,h]=profile.nativeSize;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = Math.max(1, Math.round(box.width * dpr)), ch = Math.max(1, Math.round(box.height * dpr));
  if (width === w && height === h && canvas.width === cw && canvas.height === ch) return;
  dirty = true;
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
  enableHDRLight(frame);
  const isBlackHole = selected === "blackhole";
  const isWind = selected === "wind" || selected === "windOriginal";
  const baseCamera: Camera3D = {...profile.camera,yaw,elevation,zoom:zoom*profile.camera.zoom};
  const camera = reducedMotion.matches || !profile.cameraMotion ? baseCamera : instance.camera(baseCamera);
  painter.setCamera(camera).begin(profile.background??0);
  if (profile.grid) painter.grid(8, 1);
  instance.draw(painter);
  const project=loadedProject??previewProject;
  (frame as any).semanticMasks=undefined;
  postprocessProjectFrame(frame,project,instance.t,Math.floor(instance.t*selectedFps()+1e-6),{space:'screen-only'});
  if (glow) {
    const lighting = worldLights.evaluate(frame, camera, profile.lights, profile.lighting);
    const options = {...profile.cinematic,radiance:lighting.radiance,occlusion:lighting.occlusion,...(project.pixelStyle?.finalColorPolicy==='palette-locked'?{finalPalette:project.pixelStyle.palette}:{})};
    if(cinematicRenderer) cinematicRenderer.render(frame,options);
    else {cinematic.render(frame,image.data,options);finishProjectRGBA(image.data,project);offCtx.putImageData(image,0,0);}
  } else {compositeFrame3D(frame,image.data,0);finishProjectRGBA(image.data,project);offCtx.putImageData(image,0,0);}
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle='#050811';ctx.fillRect(0,0,canvas.width,canvas.height);
  const v=integerViewport(width,height,canvas.width,canvas.height);
  const scale=Math.min(v.scale,Math.max(1,Math.round(pixel*(devicePixelRatio||1))));
  if(exactPixels) ctx.drawImage(offscreen,Math.floor((canvas.width-width*scale)/2),Math.floor((canvas.height-height*scale)/2),width*scale,height*scale);
  else ctx.drawImage(offscreen,0,0,canvas.width,canvas.height);
  const rendererStatus=cinematicRenderer?.status;
  document.querySelector('#renderer-status')!.textContent=rendererStatus?`${rendererStatus.backend.toUpperCase()} · ${rendererStatus.adapter?.software?'소프트웨어 어댑터 · ':''}${rendererStatus.reason??rendererStatus.state}`:'CPU cinematic';
  dirty = false;
}
function animation(now: number) {
  presentationClock.playing=!paused;
  const tick=presentationClock.tick(now,!document.hidden);
  const time=Math.min(presentationClock.duration,Math.floor(presentationClock.time*selectedFps()+1e-6)/selectedFps());
  if(tick.wrapped||time<instance.t)instance.restart();
  if(time>instance.t)instance.update(time-instance.t);
  if (!paused || dirty) render();
  readout.textContent = `${instance.t.toFixed(2)} / ${instance.meta.duration.toFixed(2)} s`;
  stage.textContent = instance.stage();
  document.querySelector<HTMLInputElement>('#timeline')!.value=String(presentationClock.time);
  requestAnimationFrame(animation);
}
function button(id: string, handler: () => void) { document.querySelector<HTMLButtonElement>(id)!.addEventListener("click", handler); }
button("#replay", () => { instance.restart();presentationClock.reset(); paused = false; dirty = true; last = performance.now(); document.querySelector<HTMLButtonElement>("#pause")!.textContent = "Ⅱ PAUSE"; });
button("#pause", () => {
  paused = !paused;
  presentationClock.suspend();
  last = performance.now();
  dirty = true;
  document.querySelector<HTMLButtonElement>("#pause")!.textContent = paused ? "▶ PLAY" : "Ⅱ PAUSE";
});
button("#seed", () => {
  const kept=profile;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  chooseEffect(selected);profile=kept;syncLabels();profileFields();
});
button("#save", () => {
  void(async()=>{render();const rgba=cinematicRenderer&&glow?await cinematicRenderer.capture():image.data;
  const a = document.createElement("a"),url=URL.createObjectURL(await encodeRGBAPNG(width,height,rgba));
  a.href=url;a.download = `poku-3d-${selected}-${instance.t.toFixed(2)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  })().catch(error=>{status.textContent=String(error);});
});
document.querySelector<HTMLSelectElement>("#effect")!.addEventListener("change", e => {
  const value = (e.target as HTMLSelectElement).value;
  if (Object.prototype.hasOwnProperty.call(effects, value)) {
    const key = value as keyof typeof effects;
    projectOptions={};projectName='';loadedProject=undefined;
    seed = effects[key].meta.options.seed;
    chooseEffect(key); syncLabels();
  }
});
pixelSlider.addEventListener("input", () => { pixel = +pixelSlider.value; dirty = true; syncLabels(); });
elevationSlider.addEventListener("input", () => { elevation = +elevationSlider.value * Math.PI / 180; dirty = true; syncLabels(); });
document.querySelector<HTMLInputElement>("#glow")!.addEventListener("change", e => { glow = (e.target as HTMLInputElement).checked; dirty = true; });
canvas.addEventListener("pointerdown", e => { dragging = true; prevX = e.clientX; prevY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  yaw += (e.clientX - prevX) * 0.008;
  elevation = Math.max(0.15, Math.min(1.35, elevation + (e.clientY - prevY) * 0.005));
  elevationSlider.value = String(Math.round(elevation * 180 / Math.PI));
  prevX = e.clientX; prevY = e.clientY; dirty = true; syncLabels();
});
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointercancel", () => { dragging = false; });
canvas.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.max(0.6, Math.min(2, zoom * Math.exp(-e.deltaY * 0.001))); dirty = true; }, { passive: false });
window.addEventListener("keydown", e => { if (e.code === "Space" && !(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)) { e.preventDefault(); instance.restart();presentationClock.reset(); paused = false; dirty = true; last = performance.now(); document.querySelector<HTMLButtonElement>("#pause")!.textContent = "Ⅱ PAUSE"; } });
document.addEventListener("visibilitychange", () => { presentationClock.suspend(); dirty = true; });
new ResizeObserver(() => { dirty = true; }).observe(screen);
window.addEventListener("resize", () => { dirty = true; });
reducedMotion.addEventListener("change", () => { dirty = true; });
document.querySelector('#backend')!.addEventListener('change',()=>{void selectRenderer();});
document.querySelector('#exact')!.addEventListener('change',e=>{exactPixels=(e.target as HTMLInputElement).checked;dirty=true;});
function currentProject(){
  const output:RenderProfile3D={...profile,camera:{...profile.camera,yaw,elevation,zoom:zoom*profile.camera.zoom}};
  return createProject({...loadedProject,id:loadedProject?.id??`3d/${selected==='windOriginal'?'wind-original':selected}`,name:projectName||effects[selected].meta.name||selected,kind:'3d',seed,fps:selectedFps(),bg:profile.background===null?'none':'dark',options:projectOptions,renderProfile:output});
}
button('#project',()=>{
  const project=currentProject();
  const url=URL.createObjectURL(new Blob([serializeProject(project)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`${selected}.poku.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
function profileFields(){
  const e=document.querySelector<HTMLInputElement>('#exposure');if(!e)return;
  e.value=String(profile.cinematic.exposure??1);document.querySelector<HTMLInputElement>('#bloom')!.value=String(profile.cinematic.bloom&&profile.cinematic.bloom.intensity||0);
  document.querySelector<HTMLInputElement>('#grid')!.checked=profile.grid;document.querySelector<HTMLInputElement>('#camera-motion')!.checked=profile.cameraMotion;
  document.querySelector<HTMLTextAreaElement>('#profile-json')!.value=JSON.stringify(profile,null,2);
}
function openProject(project:ResolvedProject){
  if(project.kind!=='3d'||!project.renderProfile)throw new Error('3D RenderProfile이 포함된 프로젝트를 선택하세요.');
  const loaded=parseRenderProfile3D(JSON.stringify(project.renderProfile));seed=project.seed;projectOptions=project.options;projectName=project.name;
  loadedProject=project;
  chooseEffect(loaded.effectId);profile=loaded;yaw=profile.camera.yaw;elevation=profile.camera.elevation;zoom=1;document.querySelector<HTMLSelectElement>('#effect')!.value=selected;
  elevationSlider.value=String(elevation*180/Math.PI);paused=true;dirty=true;syncLabels();profileFields();
}
button('#open-project',()=>document.querySelector<HTMLInputElement>('#project-file')!.click());
document.querySelector<HTMLInputElement>('#project-file')!.onchange=async event=>{
  try{const file=(event.target as HTMLInputElement).files?.[0];if(file)openProject(parseProject(await file.text()));}catch(error){status.textContent=String(error);}
};
document.querySelector<HTMLInputElement>('#timeline')!.oninput=event=>{paused=true;presentationClock.seek(Number((event.target as HTMLInputElement).value));dirty=true;};
for(const [id,delta] of [['#previous',-1],['#next',1]] as const)button(id,()=>{paused=true;presentationClock.step(delta,selectedFps());dirty=true;});
document.querySelector<HTMLInputElement>('#exposure')!.oninput=event=>{profile.cinematic.exposure=Number((event.target as HTMLInputElement).value);dirty=true;};
document.querySelector<HTMLInputElement>('#bloom')!.oninput=event=>{profile.cinematic.bloom={...profile.cinematic.bloom,intensity:Number((event.target as HTMLInputElement).value)};dirty=true;};
document.querySelector<HTMLInputElement>('#grid')!.onchange=event=>{profile.grid=(event.target as HTMLInputElement).checked;dirty=true;};
document.querySelector<HTMLInputElement>('#camera-motion')!.onchange=event=>{profile.cameraMotion=(event.target as HTMLInputElement).checked;dirty=true;};
button('#apply-profile',()=>{try{const loaded=parseRenderProfile3D(document.querySelector<HTMLTextAreaElement>('#profile-json')!.value);openProject(createProject({...currentProject(),renderProfile:loaded}));}catch(error){status.textContent=String(error);}});
button('#refresh-profile',()=>{document.querySelector<HTMLTextAreaElement>('#profile-json')!.value=JSON.stringify(currentProject().renderProfile,null,2);});
addEventListener('pagehide',()=>cinematicRenderer?.dispose());
chooseEffect(selected); syncLabels();
try{const saved=sessionStorage.getItem('poku-studio-3d-project');if(saved){sessionStorage.removeItem('poku-studio-3d-project');openProject(parseProject(saved));}}catch(error){status.textContent=String(error);}
requestAnimationFrame(animation);

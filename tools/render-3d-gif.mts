#!/usr/bin/env node
/** Deterministic GIF export; requires ffmpeg, keeps the engine dependency-free. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { encodePNG } from "./lib/png.mjs";
const { createFrame3D, compositeFrame3D, Painter3D, createFx3D } = await import(new URL("../../build/3d/index.js", import.meta.url).href);
const frost = await import(new URL("../../build/3d/effects/frost-nova.js", import.meta.url).href);
const slash = await import(new URL("../../build/3d/effects/arc-slash.js", import.meta.url).href);
const blackhole = await import(new URL("../../build/3d/effects/black-hole.js", import.meta.url).href);
const wind = await import(new URL("../../build/3d/effects/wind-rasenshuriken.js", import.meta.url).href);
const windOriginal = await import(new URL("../../build/3d/effects/wind-rasenshuriken-legacy.js", import.meta.url).href);
const mods = { frost, slash, blackhole, wind, windOriginal };
const args = process.argv.slice(2);
const name = args[0] ?? "wind";
if (!(name in mods)) throw new Error("Usage: render-3d-gif wind|windOriginal|frost|slash|blackhole [--fps 20 --width 260 --height 180 --seed 308 --out output.gif]");
const flags: Record<string,string>={};
for(let i=1;i<args.length;i+=2)flags[args[i].replace(/^--/,"")]=args[i+1];
const integer=(key:string,fallback:number)=>{
  const n=Number(flags[key]??fallback);
  if(!Number.isSafeInteger(n)||n<1)throw new RangeError(key+" must be a positive integer");
  return n;
};
const fps=integer("fps",20),w=integer("width",260),h=integer("height",180);
const mod=mods[name as keyof typeof mods],seed=integer("seed",mod.meta.options.seed);
const fx=name==="frost"?createFx3D(frost,{seed}):
  name==="slash"?createFx3D(slash,{seed}):
  name==="blackhole"?createFx3D(blackhole,{seed}):
  name==="wind"?createFx3D(wind,{seed}):createFx3D(windOriginal,{seed});
const isWind=name==="wind"||name==="windOriginal";
const frame=createFrame3D(w,h);
const painter=new Painter3D(frame,{
  yaw:isWind?0.32:0.68,elevation:isWind?0.22:33*Math.PI/180,
  zoom:name==="blackhole"?1.3:isWind?1.18:1,
  target:[0,name==="slash"?1.4:name==="blackhole"?2.1:isWind?2.35:0.75,0],
});
const rgba=new Uint8ClampedArray(w*h*4),frames=Math.ceil(mod.meta.duration*fps);
const out=resolve(flags.out??("records/3d/"+name+".gif"));
const temp=mkdtempSync(join(tmpdir(),"poku-3d-gif-"));
function run(a:string[]){
  const p=spawnSync("ffmpeg",a,{encoding:"utf8"});
  if(p.error)throw new Error("ffmpeg unavailable: "+p.error.message);
  if(p.status!==0)throw new Error("ffmpeg failed: "+p.stderr);
}
try {
  for(let i=0;i<frames;i++){
    fx.seek(i/fps);
    painter.begin(name==="blackhole"?"#05030d":isWind?"#061222":"#0a1525");
    if(name!=="blackhole"&&!isWind)painter.grid();
    fx.draw(painter);
    compositeFrame3D(frame,rgba);
    writeFileSync(join(temp,"frame-"+String(i).padStart(4,"0")+".png"),encodePNG(w,h,rgba));
  }
  mkdirSync(dirname(out),{recursive:true});
  const input=join(temp,"frame-%04d.png"),palette=join(temp,"palette.png");
  run(["-v","error","-y","-framerate",String(fps),"-i",input,
    "-vf","scale=iw*2:ih*2:flags=neighbor,palettegen=stats_mode=full",palette]);
  run(["-v","error","-y","-framerate",String(fps),"-i",input,"-i",palette,
    "-lavfi","[0:v]scale=iw*2:ih*2:flags=neighbor[v];[v][1:v]paletteuse=dither=none",
    "-loop","0",out]);
  console.log(mod.meta.id+": "+frames+" frames at "+fps+"fps -> "+out);
} finally {rmSync(temp,{recursive:true,force:true});}

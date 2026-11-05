// Integration evidence, not a claim that the Aseprite application ran.
// Run after npm run build. Optional output directory; no existing output is overwritten.
import {writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {loadEffect,renderFrames,spriteSheet,canvas,upscale,writeVideo} from '../build-tools/tools/lib/fxlib.mjs';
import {emptyOutputDirectory} from '../build-tools/tools/lib/aseprite-bridge.mjs';
import {importAsepriteSheet} from '../build-tools/tools/lib/aseprite-data.mjs';
import {createSpriteClip2D,createFrame,painterFor,composite} from '../build/core/index.js';
const dir=emptyOutputDirectory(process.argv[2]??'records/aseprite-roundtrip');
const fx=await loadEffect('weather/rising-smoke'),source=renderFrames(fx,{fps:7,bg:'none',actor:false});
const sheet=spriteSheet(fx,source,'smoke');
sheet.json.frames.forEach((f,i)=>f.duration=Math.round((i+1)*1000/7)-Math.round(i*1000/7));
const {data}=importAsepriteSheet(sheet.png,sheet.json),clip=createSpriteClip2D(data,{loop:true});
const width=source.w*4+36,height=source.h*2+58,frames=[];
let changed=0,milliseconds=0;
for(let i=0;i<source.n;i++){
  const frame=createFrame(source.w,source.h);
  clip.draw(painterFor(frame).place(...clip.pivot),(milliseconds+0.5)/1000);
  const rgba=composite(frame,new Uint8ClampedArray(source.w*source.h*4),null);
  let diff=0;for(let j=0;j<rgba.length;j++)if(rgba[j]!==source.frames[i].clear[j])diff++;
  changed+=diff;
  const image=canvas(width,height,[15,18,28,255]);
  image.text('ENGINE PNG',12,8,2,[210,226,245]);
  image.text('IMPORTED CLIP',24+source.w*2,8,2,[210,226,245]);
  image.paste(upscale(source.frames[i].clear,source.w,source.h,2),source.w*2,source.h*2,12,28);
  image.paste(upscale(rgba,source.w,source.h,2),source.w*2,source.h*2,24+source.w*2,28);
  image.text('RGBA DIFF: '+diff+' BYTES - NO ASEPRITE APP RUN',12,height-18,1,[150,175,192]);
  if(i===Math.floor(source.n*.65))writeFileSync(join(dir,'roundtrip.png'),image.png(),{flag:'wx'});
  frames.push({t:milliseconds/1000,color:image.data,clear:image.data});
  milliseconds+=data.frames[i].durationMs;
}
if(changed)throw new Error(`Round trip changed ${changed} RGBA bytes`);
const gif=join(dir,'roundtrip.gif');
const gifWritten=writeVideo(gif,{w:width,h:height,n:frames.length,fps:7,frames},1,{loops:1});
writeFileSync(join(dir,'verification.json'),JSON.stringify({effect:fx.id,frames:source.n,pivot:clip.pivot,durationMs:milliseconds,differingRgbaBytes:changed,realAsepriteAppRun:false,gifWritten:!!gifWritten},null,2),{flag:'wx'});
console.log(dir);

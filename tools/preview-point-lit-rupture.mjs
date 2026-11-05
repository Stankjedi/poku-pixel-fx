import{mkdirSync,writeFileSync}from'node:fs';import{join}from'node:path';
import{createFrame,clearFrame,createFx,composite}from'../build/core/index.js';
import * as effect from'../build/fx/arcane/point-lit-rupture.js';
import{canvas,upscale,contactSheet,spriteSheet,writeVideo}from'../build-tools/tools/lib/fxlib.mjs';
import{encodePNG}from'../build-tools/tools/lib/png.mjs';
const out=process.argv[2]??'records/arcane/point-lit-rupture';mkdirSync(out,{recursive:true});
const[w,h]=effect.meta.size,fps=effect.meta.fps,n=Math.round(effect.meta.duration*fps)+1;
function render(receiveLight){
 const f=createFrame(w,h),fx=createFx(effect,{x:128,y:154,receiveLight}),frames=[];
 for(let i=0;i<n;i++){
  if(i)fx.update(1/fps);clearFrame(f);fx.draw(f);
  const raw=f.color.slice(),light=f.light.slice(),flat=createFrame(w,h);flat.color.set(raw);
  frames.push({t:i/fps,color:composite(f,new Uint8ClampedArray(w*h*4),0xff160d08),clear:composite(f,new Uint8ClampedArray(w*h*4),null),raw,light,flat:composite(flat,new Uint8ClampedArray(w*h*4),0xff160d08)});
 }
 return{w,h,fps,n,frames,pivot:effect.meta.origin};
}
const on=render(true),off=render(false);
writeVideo(join(out,'point-lit-rupture.gif'),on,3);writeVideo(join(out,'point-lit-rupture.mp4'),on,3);
const pairs=on.frames.map((f,i)=>{const c=canvas(w*2,h+18,[8,13,22,255]);c.text('MATERIAL LIGHT OFF',8,5,1,[143,166,179]);c.text('MATERIAL LIGHT ON',w+8,5,1,[164,226,217]);c.paste(off.frames[i].color,w,h,0,18);c.paste(f.color,w,h,w,18);return{t:f.t,color:c.data,clear:c.data};});
writeVideo(join(out,'point-light-before-after.gif'),{w:w*2,h:h+18,fps,n,frames:pairs},2);
const flat=canvas(w*2,(h+18)*2,[8,13,22,255]);
for(const[row,t]of[.44,1.24].entries())for(const[col,r]of[off,on].entries()){
 const f=r.frames[Math.round(t*fps)],x=col*w,y=row*(h+18);flat.text((col?'ON':'OFF')+' / NO GLOW / '+t.toFixed(2)+' S',x+8,y+5,1,[164,226,217]);flat.paste(f.flat,w,h,x,y+18);
}
writeFileSync(join(out,'surface-comparison.png'),encodePNG(w*4,(h+18)*4,upscale(flat.data,w*2,(h+18)*2,2)));
writeFileSync(join(out,'hero.png'),encodePNG(w*3,h*3,upscale(on.frames[62].color,w,h,3)));
const e={meta:effect.meta,mod:effect,id:'arcane/point-lit-rupture'};
writeFileSync(join(out,'contact.png'),contactSheet(e,on,{max:16,zoom:2,width:1600}));
const sheet=spriteSheet(e,on,'point-lit-rupture');writeFileSync(join(out,'point-lit-rupture.png'),sheet.png);writeFileSync(join(out,'point-lit-rupture.json'),JSON.stringify(sheet.json,null,2));
let changed=0,alphaEqual=true,emissionEqual=true;
for(let i=0;i<n;i++)for(let j=0;j<w*h;j++){changed+=Number(on.frames[i].raw[j]!==off.frames[i].raw[j]);alphaEqual&&=(on.frames[i].raw[j]>>>24)===(off.frames[i].raw[j]>>>24);emissionEqual&&=on.frames[i].light[j]===off.frames[i].light[j];}
const stats={provenance:'New implementation on public baseline b6627aae0ac6318c55d18096eb246785d48cae96; not restored lost local source.',api:'samplePointLight2D / localPointLight2D',fps,frames:n,gifSize:[w*3,h*3],changedMaterialFramePixels:changed,alphaEqual,emissionEqual,emptyFirst:on.frames[0].clear.every(v=>v===0),emptyLast:on.frames.at(-1).clear.every(v=>v===0)};
writeFileSync(join(out,'validation.json'),JSON.stringify(stats,null,2));console.log(stats);

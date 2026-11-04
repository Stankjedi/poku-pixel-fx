// Build first. Reproducible pixel-native review of cue handoff and inherited draw controls.
// node tools/preview-composition.mjs [output directory]
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { loadEffect, renderAct, canvas, save, writeVideo } from '../build-tools/tools/lib/fxlib.mjs';
import { createFx, createFrame, clearFrame, composite, backdrop } from '../build/core/index.js';
const out=process.argv[2]??'records/composition-final';mkdirSync(out,{recursive:true});
const e=await loadEffect('moves/fireball-throw');
const before=renderAct(e,{fps:30,seconds:3.9,hold:0,options:{choreography:'classic'}});
const after=renderAct(e,{fps:30,seconds:3.9,hold:0});
const w=before.w,h=before.h,head=16;
const paired={w:w*2+4,h:h+head,fps:30,n:Math.min(before.n,after.n),frames:[]};
for(let i=0;i<paired.n;i++){
  const c=canvas(paired.w,paired.h);c.text('CLASSIC',5,4,1);c.text('CONTINUOUS',w+9,4,1);
  c.paste(before.frames[i].color,w,h,0,head);c.paste(after.frames[i].color,w,h,w+4,head);
  paired.frames.push({t:i/30,color:c.data});
}
if(!writeVideo(join(out,'fireball-before-after.gif'),paired,2))throw Error('GIF encoder failed');
// The same complete move is placed/rotated in parent space. No intermediate raster is scaled or rotated.
const W=356,H=244,variants=[{label:'FULL LIGHT',light:1},{label:'LIGHT 0.25',light:.25},
 {label:'MIRROR + ROTATE',x:280,y:190,flip:true,angle:.18},{label:'STOP FADE',stop:.7}];
const frame=createFrame(W,H),bg=backdrop('ground',W,H,198);
const samples=variants.map(v=>createFx(e.mod,{x:64,y:198,...v}));
const controls={w:W*2+4,h:(H+head)*2+4,fps:30,n:75,frames:[]};
for(let i=0;i<controls.n;i++){
  const c=canvas(controls.w,controls.h);
  variants.forEach((v,j)=>{
    if(i){if(v.stop!==undefined&&i===Math.round(v.stop*30))samples[j].stop();samples[j].update(1/30)}
    samples[j].draw(clearFrame(frame));const rgba=composite(frame,new Uint8ClampedArray(W*H*4),bg);
    const x=(j%2)*(W+4),y=Math.floor(j/2)*(H+head+4);c.text(v.label,x+5,y+4,1);c.paste(rgba,W,H,x,y+head);
  });
  controls.frames.push({t:i/30,color:c.data});
  if(i===24)save(join(out,'composition-controls.png'),c.png());
}
if(!writeVideo(join(out,'composition-controls.gif'),controls,2))throw Error('GIF encoder failed');
console.log(out);

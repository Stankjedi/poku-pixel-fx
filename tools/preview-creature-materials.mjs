#!/usr/bin/env node
// Optional before-build is a local checkpoint directory containing build/core/creature.js.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL}from'node:url';
import{createFrame,Painter,composite,hex,renderCreature2D}from'../build/core/index.js';
import{encodePNG}from'../build-tools/tools/lib/png.mjs';import{writeVideo}from'../build-tools/tools/lib/fxlib.mjs';
const out=process.argv[2]??'records/creature-materials',beforePath=process.argv[3];
if(!beforePath)throw new Error('Pass the baseline checkout directory for an honest before/after comparison');
const{renderCreature2D:before}=await import(pathToFileURL(path.resolve(beforePath,'build/core/creature.js')).href);
const save=(file,w,h,rgba)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,rgba));};
const blit=(p,s,x,y)=>{p.place(x,y);for(let yy=0;yy<s.h;yy++)for(let xx=0;xx<s.w;xx++){const c=s.pixels[yy*s.w+xx];if(c)p.px(s.x+xx,s.y+yy,c);}p.reset();};
function frame(t,species=['fox','cat'],size=96){
 const w=species.length*360,h=size>96?260:210,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex('#202b3a'));
 for(const[q,name]of species.entries())for(let side=0;side<2;side++){
  const x=q*360+130+side*180,motion=name==='fox'?'walk':name==='cat'?'trot':'fly',fn=side?renderCreature2D:before;
  p.text(`${name.toUpperCase()} / ${side?'AFTER':'BEFORE'}`,q*360+90+side*180,12,hex('#d8cbb3'),{align:'center'});
  blit(p,fn({species:name,size},motion,t),x,h-36);
 }
 return{w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};
}
fs.mkdirSync(out,{recursive:true});
for(const names of[['fox','cat'],['owl','dragon']]){
 const key=names[0]==='fox'?'quadrupeds':'wings';
 for(const t of[0,.375,1.125]){const q=frame(t,names);save(`${out}/${key}-${t}.png`,q.w,q.h,q.rgba);}
 const frames=[];for(let i=0;i<120;i++){const q=frame(i/20,names);frames.push({t:i/20,color:q.rgba,clear:q.rgba});}
 const q=frame(0,names);if(!writeVideo(`${out}/${key}-before-after.gif`,{w:q.w,h:q.h,fps:20,n:120,frames},2))throw new Error('ffmpeg required');
}
// Actual size samples use one shared source-pixel grid, never independent enlargement.
for(const names of[['fox','cat'],['owl','dragon']]){
 const w=960,h=860,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex('#e3ded3'));
 for(const [row,size]of[32,64,96,128].entries()){
  const y=[94,243,465,767][row],labelY=[115,279,516,833][row];p.text(`NATIVE SIZE ${size}`,w/2,[30,138,318,578][row],hex('#55636b'),{align:'center'});
  for(const [col,name]of names.entries())for(let side=0;side<2;side++){
   const x=col*480+160+side*230,fn=side?renderCreature2D:before,motion=name==='fox'?'walk':name==='cat'?'trot':'fly';
   blit(p,fn({species:name,size},motion,.375),x,y);p.text(`${name.toUpperCase()} / ${side?'AFTER':'BEFORE'}`,col*480+125+side*230,labelY,hex('#55636b'),{align:'center'});
  }
 }
 save(`${out}/${names[0]==='fox'?'quadrupeds':'wings'}-native-sizes.png`,w,h,composite(f,new Uint8Array(w*h*4),null));
}
fs.writeFileSync(`${out}/review.json`,JSON.stringify({baseline:path.resolve(beforePath),nativeSizes:[32,64,96,128],gifFps:20,gifDuration:6,displayMagnification:'whole GIF only; 2x nearest-neighbor',gaitChanged:false},null,2));console.log(out);

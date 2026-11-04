#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
import {createFrame,composite,hex,Painter,drawHuman2D,humanViewMotion2D}from'../build/core/index.js';
import {encodePNG}from'../build-tools/tools/lib/png.mjs';
import {writeVideo}from'../build-tools/tools/lib/fxlib.mjs';
import {PEOPLE}from'./preview-humans.mjs';
export const VIEWS=['front','three-quarter','side'],SIZES=[32,48,72],W=576,H=370,FPS=20,N=40;
const rows=[{person:PEOPLE[0],motion:'wave'},{person:PEOPLE[2],motion:'walk'},{person:PEOPLE[1],motion:'guard'}];
function label(p,s,x,y,color){p.text(s,x,y,hex(color),{align:'center'});}
export function frameAt(t,light=false){
 const f=createFrame(W,H),p=new Painter(f),bg=light?'#e4ded2':'#171d2b',text=light?'#334759':'#ddd0b7',muted=light?'#6a7477':'#94a6ad';
 p.rect(0,0,W,H,hex(bg));label(p,'HUMAN VIEW STUDIES / PURE 2D',W/2,12,text);
 for(let col=0;col<3;col++){
  label(p,['FRONT','THREE-QUARTER','SIDE'][col],col*192+96,32,text);
  for(let row=0;row<3;row++){
   const q=rows[row],y=139+102*row;
   p.rect(col*192+5,48+102*row,182,100,hex(light?'#d6d1c8':'#222b39'));
   for(let i=0;i<3;i++){
    const x=col*192+29+i*61,h=SIZES[i];
    p.ellipse(x,y+1,h*.16,1.5,hex(light?'#b9b7b1':'#111722'));
    p.place(x,y);drawHuman2D(p,{...q.person.style,height:h,view:VIEWS[col]},humanViewMotion2D(VIEWS[col],q.motion,t));p.reset();
    label(p,`${h}`,x,y+4,muted);
   }
   label(p,`${q.person.name} / ${q.motion.toUpperCase()}`,col*192+96,50+102*row,muted);
  }
 }
 label(p,'32 / 48 / 72 NATIVE PIXELS    CONNECTED COLOR MASSES',W/2,361,muted);
 return composite(f,new Uint8Array(W*H*4),null);
}
function save(file,w,h,rgba){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,rgba));}
function poseSheet(light=false){
 const f=createFrame(500,240),p=new Painter(f);p.rect(0,0,500,240,hex(light?'#e4ded2':'#171d2b'));
 for(let row=0;row<2;row++)for(let i=0;i<5;i++){
  const view=['three-quarter','side'][row],motion=['idle','walk','wave','guard','crouch'][i],x=50+100*i,y=100+120*row;
  p.place(x,y);drawHuman2D(p,{...PEOPLE[3].style,height:72,view},humanViewMotion2D(view,motion,.25));p.reset();label(p,`${view==='side'?'SIDE':'3/4'} ${motion.toUpperCase()}`,x,y+13,light?'#334759':'#b9c7c9');
 }
 return composite(f,new Uint8Array(500*240*4),null);
}
if(import.meta.url===`file://${process.argv[1]}`){
 const out=process.argv[2]??'records/human-views',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});
 const frames=[];for(let i=0;i<(single?1:N);i++){const rgba=frameAt(i/FPS);frames.push({t:i/FPS,color:rgba,clear:rgba});}
 for(const [name,t,light]of[['native',0,false],['quarter',.5,false],['half',1,false],['light',0,true]])save(`${out}/${name}.png`,W,H,frameAt(t,light));
 save(`${out}/poses.png`,500,240,poseSheet());save(`${out}/poses-light.png`,500,240,poseSheet(true));
 if(!single&&!writeVideo(`${out}/human-view-comparison.gif`,{w:W,h:H,fps:FPS,n:N,frames},2))throw new Error('ffmpeg required');
 const contact=new Uint8Array(W*H*4*4);for(let i=0;i<4;i++)contact.set(frameAt(i*.5),i*W*H*4);save(`${out}/contact.png`,W,H*4,contact);
 const atlas=createFrame(480,864),ap=new Painter(atlas),entries=[];
 for(let v=0;v<3;v++)for(let size=0;size<3;size++)for(let m=0;m<5;m++){
  const view=VIEWS[v],height=SIZES[size],motion=['idle','walk','wave','guard','crouch'][m],col=m,row=v*3+size;
  ap.place(col*96+48,row*96+84);drawHuman2D(ap,{...PEOPLE[0].style,height,view},humanViewMotion2D(view,motion,.25));
  entries.push({name:`${view}-${height}-${motion}`,view,height,motion,sampleTime:.25,frame:{x:col*96,y:row*96,w:96,h:96},pivot:[48,84]});
 }
 save(`${out}/key-pose-atlas.png`,480,864,composite(atlas,new Uint8Array(480*864*4),null));
 fs.writeFileSync(`${out}/key-pose-atlas.json`,JSON.stringify({kind:'static-key-pose-atlas',renderer:'Poku Pixel FX 2D Painter',entries},null,2));
 fs.writeFileSync(`${out}/animation.json`,JSON.stringify({renderer:'Poku Pixel FX 2D Painter',uses3D:false,views:VIEWS,sizes:SIZES,width:W,height:H,frames:N,fps:FPS,duration:2,displayScale:2},null,2));
 console.log(out);
}

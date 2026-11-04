#!/usr/bin/env node
import fs from'node:fs';import path from'node:path';
import{createFrame,composite,hex,Painter,drawHuman2D,humanViewMotion2D}from'../build/core/index.js';
import{encodePNG}from'../build-tools/tools/lib/png.mjs';import{writeVideo}from'../build-tools/tools/lib/fxlib.mjs';
import{PEOPLE}from'./preview-humans.mjs';
export const VIEWS=['front','three-quarter','side','back'],SIZES=[32,48,72],W=568,H=474,FPS=20,N=40;
const label=(p,s,x,y,c)=>p.text(s,x,y,hex(c),{align:'center'});
export function frameAt(t,light=false){
 const f=createFrame(W,H),p=new Painter(f),bg=light?'#e4ded2':'#171d2b',fg=light?'#374b58':'#d8cbb7',muted=light?'#66737c':'#97aab2';p.rect(0,0,W,H,hex(bg));
 label(p,'HUMAN ORIENTATION STUDIES / PURE 2D',W/2,10,fg);label(p,'FACING LEFT',142,27,fg);label(p,'FACING RIGHT',426,27,fg);
 for(let row=0;row<4;row++)for(let col=0;col<2;col++){
  const view=VIEWS[row],facing=col===0?'left':'right',foot=128+106*row;
  p.rect(col*284+5,40+row*106,274,102,hex(light?'#d6d1c8':'#222b39'));label(p,view.toUpperCase(),col*284+142,43+row*106,muted);
  for(let i=0;i<3;i++){
   const x=col*284+54+88*i,height=SIZES[i];p.ellipse(x,foot+1,height*.16,1.5,hex(light?'#bbb6ad':'#111724'));
   p.place(x,foot);drawHuman2D(p,{...PEOPLE[1].style,height,view,facing},humanViewMotion2D(view,'walk',t));p.reset();label(p,`${height} PX`,x,foot+5,muted);
  }
 }
 label(p,'ONE CONNECTED SILHOUETTE / MIRRORED PIXELS AND LANDMARKS',W/2,465,muted);
 return composite(f,new Uint8Array(W*H*4),null);
}
function save(file,w,h,rgba){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,rgba));}
function backSheet(){const f=createFrame(650,264),p=new Painter(f);p.rect(0,0,650,264,hex('#171d2b'));
 for(let row=0;row<2;row++)for(let i=0;i<5;i++){
  const x=65+i*130,y=111+130*row,hair=['crop','bob','curls','swept','bun'][i],motion=row?'walk':'idle';
  p.place(x,y);drawHuman2D(p,{...PEOPLE[i].style,height:88,view:'back',hair},humanViewMotion2D('back',motion,.25));p.reset();label(p,`${hair.toUpperCase()} / ${motion.toUpperCase()}`,x,y+11,'#a7bac0');
 }return composite(f,new Uint8Array(650*264*4),null);}
if(import.meta.url===`file://${process.argv[1]}`){const out=process.argv[2]??'records/human-orientations',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});
 const frames=[];for(let i=0;i<(single?1:N);i++){const rgba=frameAt(i/FPS);frames.push({t:i/FPS,color:rgba,clear:rgba});}
 for(const[name,t,light]of[['native',0,false],['quarter',.5,false],['half',1,false],['light',0,true]])save(`${out}/${name}.png`,W,H,frameAt(t,light));
 save(`${out}/back-hair-studies.png`,650,264,backSheet());
 if(!single&&!writeVideo(`${out}/human-orientation-walk.gif`,{w:W,h:H,fps:FPS,n:N,frames},2))throw new Error('ffmpeg required');
 const atlas=createFrame(768,288),ap=new Painter(atlas),entries=[];
 for(let v=0;v<4;v++)for(let face=0;face<2;face++)for(let size=0;size<3;size++){
  const view=VIEWS[v],facing=face?'right':'left',height=SIZES[size],col=v*2+face,row=size;ap.place(col*96+48,row*96+84);const sprite=drawHuman2D(ap,{...PEOPLE[1].style,view,facing,height},humanViewMotion2D(view,'walk',.25));
  entries.push({view,facing,height,motion:'walk',sampleTime:.25,frame:{x:col*96,y:row*96,w:96,h:96},pivot:[48,84],landmarks:Object.fromEntries(['head','neck','chest','pelvis','leftShoulder','rightShoulder','leftElbow','rightElbow','leftHand','rightHand','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle'].map(key=>[key,[48+sprite.rig[key][0],84+sprite.rig[key][1]]]))});
 }
 save(`${out}/orientation-atlas.png`,768,288,composite(atlas,new Uint8Array(768*288*4),null));fs.writeFileSync(`${out}/orientation-atlas.json`,JSON.stringify({kind:'static-key-pose-atlas',entries},null,2));
 fs.writeFileSync(`${out}/animation.json`,JSON.stringify({renderer:'Poku Pixel FX 2D Painter',uses3D:false,views:VIEWS,facings:['left','right'],sizes:SIZES,width:W,height:H,fps:FPS,frames:N,duration:2,displayScale:2},null,2));console.log(out);
}

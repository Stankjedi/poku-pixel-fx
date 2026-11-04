#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createFrame,Painter,composite,hex,drawCreature2D,renderCreature2D,renderCreatureCanvas2D} from '../build/core/index.js';
import {encodePNG} from '../build-tools/tools/lib/png.mjs';
import {writeVideo} from '../build-tools/tools/lib/fxlib.mjs';
export const EXAMPLES=[{species:'fox',motion:'walk'},{species:'cat',motion:'trot'},{species:'owl',motion:'fly'},{species:'dragon',motion:'fly'}];
export const PALETTES={
 fox:[{body:['#687d94','#aebdc9','#e4e9e2'],accent:['#a2a4a2','#d8d6c6','#fff3d6']},{body:['#59496b','#7b5c83','#a080a3','#c3abc3','#e6cddb'],accent:['#a88990','#c2a7a4','#ead2bf','#fff0d4']},{body:['#794435','#965235','#b4683f','#c77943','#d99153','#e7aa60'],accent:['#93836d','#ac9982','#d6c7a2','#f1e1bb']}],
 cat:[{body:['#91704b','#c99c66','#f0cf92'],accent:['#ab8b6d','#d8c1a0','#f4e8cd']},{body:['#4d5678','#6c7698','#929ab8','#b8bed2','#e1e0e8'],accent:['#a192a4','#c5b5bf','#dfd0d1','#f4e7db']},{body:['#405564','#526779','#697e8f','#788d9d','#93a8b4','#acbdc6'],accent:['#887a72','#9a8d84','#c3b8a4','#e4d9bb']}],
 owl:[{body:['#92968c','#c8cfc1','#f1f0d9'],accent:['#ad9e7d','#d8c8a4','#fff1c9']},{body:['#3c526a','#56758a','#7896a4','#a4bfc2','#dae3d8'],accent:['#768693','#a4b5be','#cbd5d0','#f0e9cd']},{body:['#5a4b40','#71604e','#8b7156','#a18460','#b6996e','#c9ac7e'],accent:['#8d8068','#a49678','#d1c7a3','#eee3bd']}],
 dragon:[{body:['#944630','#d77b3c','#f4b760'],accent:['#745346','#ad8060','#ead2a2']},{body:['#334b82','#4668a2','#658ac0','#8bafd8','#c4d6ec'],accent:['#5f5584','#8e79a8','#bba3c9','#ead3e8']},{body:['#28564f','#34685e','#407a69','#508e76','#69a283','#80b28b'],accent:['#694154','#7c5062','#976274','#aa7180','#bf8590','#d2999b']}],
};
export const W=800,H=470,FPS=20,N=120;
function save(file,w,h,rgba){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,rgba));}
export function frameAt(t,light=false){
 const f=createFrame(W,H),p=new Painter(f),bg=light?'#e5dfd3':'#171d2b',fg=light?'#354859':'#dfd0b2',muted=light?'#62737c':'#9aafbb';
 p.rect(0,0,W,H,hex(bg));p.text('CREATURES / DISTINCT BODY PLANS',W/2,10,hex(fg),{align:'center'});
 p.text('FOOT CONTACTS / ARTICULATED WINGS / CONTINUOUS TAILS',W/2,26,hex(muted),{align:'center'});
 EXAMPLES.forEach((v,col)=>{
  const x=col*200+128;p.rect(col*200+4,44,192,250,hex(light?'#d5d1c8':'#222c3b'));
  p.text(`${v.species.toUpperCase()} / ${v.motion.toUpperCase()}`,col*200+100,52,hex(fg),{align:'center'});
  const base=v.species==='fox'||v.species==='cat'?270:230;p.place(x,base);drawCreature2D(p,{species:v.species,size:96,...PALETTES[v.species][2]},v.motion,t);p.reset();
  if(v.species==='fox'||v.species==='cat'){p.rect(col*200+12,273,176,1,hex(light?'#a7a8a4':'#425163'));const r=renderCreature2D({species:v.species},v.motion,t).rig;for(const l of r.legs)if(l.contact)p.rect(x+l.toe[0]-2,276,4,1,hex('#80b28b'));}
  p.text('32 / 64 PX, PALETTE VARIANTS',col*200+100,312,hex(muted),{align:'center'});
  for(const [i,size]of[32,64].entries()){p.place(col*200+35+i*76,440);drawCreature2D(p,{species:v.species,size,facing:'left',...PALETTES[v.species][i]},v.motion,t);p.reset();}
 });
 p.text('PURE 2D PIXEL CLUSTERS / NO INTERNAL BLACK PANEL LINES',W/2,456,hex(muted),{align:'center'});
 return composite(f,new Uint8Array(W*H*4),null);
}
function singleFrame(v,t,light=false){const w=200,h=190,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex(light?'#e5dfd3':'#202b3b'));p.place(130,150);drawCreature2D(p,{species:v.species,size:96,...PALETTES[v.species][2]},v.motion,t);return{w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};}
if(import.meta.url===`file://${process.argv[1]}`){
 const out=process.argv[2]??'records/creatures',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});
 for(const[name,t,light]of[['native',0,false],['quarter',.375,false],['half',.75,false],['upstroke',1.125,false],['light',.75,true]])save(`${out}/${name}.png`,W,H,frameAt(t,light));
 // Transparent atlases share one frame size/pivot for the complete loop.
 for(const v of EXAMPLES){
  const period=v.motion==='walk'?2:v.motion==='trot'?1:1.5,n=Math.round(period*FPS),cw=200,ch=190,cols=5,rows=Math.ceil(n/cols),f=createFrame(cols*cw,rows*ch),p=new Painter(f),entries=[],frames=[];
  for(let i=0;i<n;i++){
   const x=i%cols*cw,y=Math.floor(i/cols)*ch;p.place(x+130,y+150);drawCreature2D(p,{species:v.species,size:96,...PALETTES[v.species][2]},v.motion,i/FPS);p.reset();
   entries.push({frame:{x,y,w:cw,h:ch},duration:1000/FPS});const q=singleFrame(v,i/FPS);frames.push({t:i/FPS,color:q.rgba,clear:q.rgba});
  }
  save(`${out}/${v.species}-${v.motion}.png`,f.w,f.h,composite(f,new Uint8Array(f.w*f.h*4),null));
  fs.writeFileSync(`${out}/${v.species}-${v.motion}.json`,JSON.stringify({frames:entries,meta:{species:v.species,motion:v.motion,fps:FPS,loop:true,pivot:[130,150],frameSize:[cw,ch],nominalSize:96,palette:PALETTES[v.species][2],renderer:'Poku Pixel FX 2D Painter',uses3D:false}},null,2));
  if(!single&&!writeVideo(`${out}/${v.species}-${v.motion}.gif`,{w:cw,h:ch,fps:FPS,n,frames},3))throw new Error('ffmpeg required');
 }
 if(!single){const frames=Array.from({length:N},(_,i)=>{const rgba=frameAt(i/FPS);return{t:i/FPS,color:rgba,clear:rgba};});if(!writeVideo(`${out}/creature-lineup.gif`,{w:W,h:H,fps:FPS,n:N,frames},2))throw new Error('ffmpeg required');}
 exportCanvasStudies(out);
 fs.writeFileSync(`${out}/review.json`,JSON.stringify({examples:EXAMPLES,palettes:PALETTES,renderer:'pure 2D Painter',fps:FPS,duration:6,uses3D:false},null,2));console.log(out);
}

export function exportCanvasStudies(out){
 for(const side of[64,128,256])for(const v of EXAMPLES){
  const size=side/2,palette=PALETTES[v.species][side===64?0:side===128?1:2],style={species:v.species,size,...palette},period=v.motion==='walk'?2:v.motion==='trot'?1:1.5,n=Math.round(period*FPS),cols=5,rows=Math.ceil(n/cols),f=createFrame(cols*side,rows*side),p=new Painter(f),entries=[];
  for(let i=0;i<n;i++){
   const q=renderCreatureCanvas2D(style,v.motion,i/FPS,{width:side,height:side}),xx=i%cols*side,yy=Math.floor(i/cols)*side;
   for(let y=0;y<side;y++)for(let x=0;x<side;x++)if(q.pixels[y*side+x])p.px(xx+x,yy+y,q.pixels[y*side+x]);
   entries.push({frame:{x:xx,y:yy,w:side,h:side},duration:1000/FPS,pivot:q.pivot});
  }
  const file=`${out}/canvases/${v.species}-${v.motion}-${side}x${side}`;
  save(file+'.png',f.w,f.h,composite(f,new Uint8Array(f.w*f.h*4),null));
  fs.writeFileSync(file+'.json',JSON.stringify({frames:entries,meta:{canvas:[side,side],style,motion:v.motion,fps:FPS,sourcePixelsPerScenePixel:1,resampled:false,physicalSize:size}},null,2));
 }

 // True canvas dimensions remain visible on a shared 1:1 comparison sheet.
 const sheet=createFrame(1088,556),sp=new Painter(sheet);sp.rect(0,0,1088,556,hex('#1c2635'));sp.text('ACTUAL 64 X 64 / 128 X 128 / 256 X 256 CANVASES',544,10,hex('#dfd4b9'),{align:'center'});
 EXAMPLES.forEach((v,col)=>{sp.text(v.species.toUpperCase(),col*272+136,28,hex('#9aafbb'),{align:'center'});for(const [row,side]of[64,128,256].entries()){
  const x=col*272+(272-side)/2,y=[44,124,268][row],q=renderCreatureCanvas2D({species:v.species,size:side/2,...PALETTES[v.species][row]},v.motion,.375,{width:side,height:side});
  sp.rect(x,y,side,side,hex('#2b3747'));for(let yy=0;yy<side;yy++)for(let xx=0;xx<side;xx++)if(q.pixels[yy*side+xx])sp.px(x+xx,y+yy,q.pixels[yy*side+xx]);
  sp.text(`${side} X ${side} / PHYSICAL SIZE ${side/2}`,col*272+136,y+side+3,hex('#9aafbb'),{align:'center'});
 }});save(`${out}/canvas-size-comparison.png`,1088,556,composite(sheet,new Uint8Array(1088*556*4),null));
 // Different physical sizes, one native scene grid. No individual sprite is resized.
 const w=768,h=300,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex('#1c2635'));p.rect(0,270,w,30,hex('#364c4d'));
 for(let x=0;x<w;x+=16)p.rect(x,270,1,30,hex('#405b57'));
 p.text('ONE SCENE GRID / ALL OBJECTS RASTERIZED 1:1',w/2,12,hex('#dfd4b9'),{align:'center'});
 const actors=[{species:'fox',size:64,motion:'walk',x:130,y:269},{species:'cat',size:32,motion:'trot',x:250,y:269},{species:'owl',size:64,motion:'fly',x:400,y:170},{species:'dragon',size:128,motion:'fly',x:650,y:220}];
 for(const a of actors){p.place(a.x,a.y);drawCreature2D(p,{species:a.species,size:a.size,...PALETTES[a.species][a.size<=32?0:a.size<=64?1:2]},a.motion,.375);p.reset();p.text(`${a.species.toUpperCase()} / ${a.size}`,a.x,286,hex('#dfd4b9'),{align:'center'});}
 save(`${out}/shared-world-native.png`,w,h,composite(f,new Uint8Array(w*h*4),null));
 fs.writeFileSync(`${out}/shared-world.json`,JSON.stringify({canvas:[w,h],sourcePixelsPerScenePixel:1,displayScaleAppliesTo:'whole scene only',actors},null,2));
}

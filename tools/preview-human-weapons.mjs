#!/usr/bin/env node
import fs from'node:fs';import path from'node:path';
import{createFrame,composite,hex,Painter,drawHumanWeapon2D,renderHumanWeapon2D,HUMAN_WEAPON_TIMING}from'../build/core/index.js';
import{encodePNG}from'../build-tools/tools/lib/png.mjs';import{writeVideo}from'../build-tools/tools/lib/fxlib.mjs';
export const W=780,H=545,FPS=50,N=90,VIEWS=['front','side','back'],SIZES=[32,48,72],KINDS=['sword','bow'];
export const STYLE={faceShape:'round',hair:'ponytail',skin:'brown',hairColor:'chestnut',outfit:'shirt',cloth:['#47627b','#6d8da0','#9cb6bb'],trousers:['#4d414c','#705a65','#958080']};
const label=(p,s,x,y,c)=>p.text(s,x,y,hex(c),{align:'center'});
export function frameAt(t,light=false){const f=createFrame(W,H),p=new Painter(f),bg=light?'#e5dfd3':'#171d2b',fg=light?'#3a4b58':'#daccb5',muted=light?'#626c71':'#91a6b1';p.rect(0,0,W,H,hex(bg));
 label(p,'SWORD / BOW / CONNECTED 2D GRIPS',W/2,10,fg);label(p,'HAND OVER HILT / VISIBLE STRING / SEPARATE RELEASED ARROW',W/2,26,muted);
 for(let col=0;col<2;col++)for(let row=0;row<3;row++){
  const kind=KINDS[col],view=VIEWS[row],foot=174+row*166;p.rect(col*390+5,43+row*166,380,159,hex(light?'#d6d1c8':'#222b39'));label(p,`${kind.toUpperCase()} / ${view.toUpperCase()}`,col*390+195,48+row*166,fg);
  for(let i=0;i<3;i++){const height=SIZES[i],x=col*390+[45,137,258][i];p.ellipse(x,foot+1,height*.2,1.3,hex(light?'#bab5ad':'#111724'));p.place(x,foot);const q=drawHumanWeapon2D(p,kind,t,{...STYLE,view,height});p.reset();label(p,`${height} PX / ${q.sample.phase.toUpperCase()}`,x,foot+10,muted);}
 }
 label(p,'ONE-SHOT REPLAY / CUES ARE AUTHORING MARKERS, NOT COLLISIONS',W/2,535,muted);return composite(f,new Uint8Array(W*H*4),null);
}
function sheet(kind,view){const w=960,h=456,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex('#e5dfd3'));const duration=HUMAN_WEAPON_TIMING[kind].duration;
 for(let i=0;i<24;i++){const t=duration*i/23,col=i%8,row=Math.floor(i/8),cell=createFrame(120,150),cp=new Painter(cell);cp.rect(0,0,120,150,hex('#e5dfd3'));cp.place(35,121);const q=drawHumanWeapon2D(cp,kind,t,{...STYLE,view,height:72});cp.reset();label(cp,`${t.toFixed(2)} / ${q.sample.phase.toUpperCase()}`,60,133,'#626c71');for(let y=0;y<150;y++)for(let x=0;x<120;x++)p.px(col*120+x,row*150+y,cell.color[y*120+x]);}
 return{w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};}
export function nativeActorAt(canvas,kind,view,t,height=canvas*.5625){
 const f=createFrame(canvas,canvas),p=new Painter(f),a=renderHumanWeapon2D(kind,t,{...STYLE,view,height}).actor;
 p.place(Math.floor(canvas*.44),Math.floor(canvas*.875));
 for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++)if(a.pixels[y*a.w+x])p.px(a.x+x,a.y+y,a.pixels[y*a.w+x]);
 return composite(f,new Uint8Array(canvas*canvas*4),null);
}
function save(file,w,h,rgba){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,rgba));}
if(import.meta.url===`file://${process.argv[1]}`){const out=process.argv[2]??'records/human-weapons',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});const frames=[];
 for(let i=0;i<(single?1:N);i++){const rgba=frameAt(i/FPS);frames.push({t:i/FPS,color:rgba,clear:rgba});}
 for(const[name,t,light]of[['ready',0,false],['windup',.28,false],['slash',.44,false],['draw',.6,false],['release',.72,false],['light',.6,true]])save(`${out}/${name}.png`,W,H,frameAt(t,light));
 for(const kind of KINDS)for(const view of VIEWS){const q=sheet(kind,view);save(`${out}/${view}-${kind}-frames.png`,q.w,q.h,q.rgba);}
 for(const size of[64,128])for(const kind of KINDS)for(const view of VIEWS){const at=kind==='sword'?.44:.6;save(`${out}/native-${size}/${kind}-${view}.png`,size,size,nativeActorAt(size,kind,view,at));}
 // Same actor size in different canvas dimensions: padding changes, pixel scale does not.
 save(`${out}/shared-grid-64.png`,64,64,nativeActorAt(64,'sword','side',.44,36));
 save(`${out}/shared-grid-128.png`,128,128,nativeActorAt(128,'sword','side',.44,36));
 if(!single)for(const size of[64,128])for(const kind of KINDS){const seq=[];for(let i=0;i<N;i++){const rgba=nativeActorAt(size,kind,'side',i/FPS);seq.push({t:i/FPS,color:rgba,clear:rgba});}if(!writeVideo(`${out}/native-${size}/${kind}-side.gif`,{w:size,h:size,fps:FPS,n:N,frames:seq},1))throw new Error('ffmpeg required');}
 if(!single&&!writeVideo(`${out}/human-weapons.gif`,{w:W,h:H,fps:FPS,n:N,frames},2))throw new Error('ffmpeg required');
 fs.writeFileSync(`${out}/animation.json`,JSON.stringify({renderer:'Poku Pixel FX 2D Painter',uses3D:false,width:W,height:H,fps:FPS,frames:N,duration:N/FPS,displayScale:2,views:VIEWS,kinds:KINDS,sizes:SIZES,cues:HUMAN_WEAPON_TIMING,nativeCanvasStudies:{sizes:[64,128],actorHeightRatio:.5625,note:'Separate target-resolution studies, not mixed-scale actors in one world.'},sharedGridStudy:{canvases:[64,128],actorHeight:36,note:'Same native actor pixels; canvas padding only; no per-actor resizing.'}},null,2));console.log(out);
}

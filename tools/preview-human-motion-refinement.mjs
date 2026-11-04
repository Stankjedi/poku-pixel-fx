#!/usr/bin/env node
/** Compare two native renderers. Usage: node tools/preview-human-motion-refinement.mjs OUT BASELINE_MODULE */
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import * as after from '../build/core/index.js';
import {encodePNG} from '../build-tools/tools/lib/png.mjs';import {writeVideo} from '../build-tools/tools/lib/fxlib.mjs';
const out=process.argv[2],baseline=process.argv[3];if(!out||!baseline)throw new Error('Supply output directory and baseline module path.');
const before=await import(pathToFileURL(path.resolve(baseline)).href),{createFrame,Painter,hex,composite}=after;
const fps=50,n=90,style={faceShape:'round',hair:'ponytail',skin:'brown',hairColor:'chestnut',outfit:'shirt',cloth:['#47627b','#6d8da0','#9cb6bb'],trousers:['#4d414c','#705a65','#958080']};
const save=(name,w,h,rgba)=>{fs.mkdirSync(path.dirname(`${out}/${name}`),{recursive:true});fs.writeFileSync(`${out}/${name}`,encodePNG(w,h,rgba));};
function panel(api,size,height,t,view='side',kind='sword',grid=true){
 const f=createFrame(size,size),p=new Painter(f),ox=height===72?56:28+(size-64)/2,oy=height===72?112:56+(size-64)/2;p.rect(0,0,size,size,hex('#e5dfd3'));
 if(grid)for(let x=4;x<size;x+=8)p.line(x,0,x,size-1,hex('#d9d3c8'));
 if(grid)for(let y=0;y<size;y+=8)p.line(0,y,size-1,y,hex('#d9d3c8'));
 p.line(0,oy+1,size-1,oy+1,hex('#b9b1a3'));
 const a=kind==='sword'?api.renderHumanWeapon2D('sword',t,{...style,view,height}).actor:api.renderHuman2D({...style,view,height},api.humanCombat2D(kind,t,{...style,view,height}).pose);
 p.place(ox,oy);for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++)if(a.pixels[y*a.w+x])p.px(a.x+x,a.y+y,a.pixels[y*a.w+x]);
 return composite(f,new Uint8Array(size*size*4),null);
}
function pair(size,height,t,view='side',kind='sword'){
 const w=size*2,h=size,rgba=new Uint8Array(w*h*4);
 for(const[i,api]of[before,after].entries()){const q=panel(api,size,height,t,view,kind);for(let y=0;y<size;y++)rgba.set(q.slice(y*size*4,(y+1)*size*4),(y*w+i*size)*4);}
 return rgba;
}
fs.mkdirSync(out,{recursive:true});
for(const size of[64,128])for(const kind of['sword','punch','block','hit']){
 const frames=[];for(let i=0;i<n;i++){const rgba=pair(size,36,i/fps,'side',kind);frames.push({t:i/fps,color:rgba,clear:rgba});}
 const file=`${out}/${kind}-shared-grid-${size}-before-after.gif`;
 if(!writeVideo(file,{w:size*2,h:size,fps,n,frames},1))throw new Error('ffmpeg required');
 for(const[name,t]of[['ready',0],['prepare',kind==='sword'?.28:.2],['contact',kind==='sword'?.44:.34],['settle',.78]])save(`${kind}-${size}-${name}.png`,size*2,size,pair(size,36,t,'side',kind));
}
{const frames=[];for(let i=0;i<n;i++){const rgba=pair(128,72,i/fps);frames.push({t:i/fps,color:rgba,clear:rgba});}if(!writeVideo(`${out}/sword-target-128-before-after.gif`,{w:256,h:128,fps,n,frames},1))throw new Error('ffmpeg required');}
// Higher actor-resolution study is deliberately separate from the shared-grid comparison.
for(const view of['front','three-quarter','side','back']){
 const times=[0,.14,.28,.34,.4,.44,.52,.64,.78,.94,1.1,1.2],w=6*160,h=4*128,rgba=new Uint8Array(w*h*4);
 for(let i=0;i<times.length;i++)for(const[j,api]of[before,after].entries()){
  // A 128px native tile, not a resized 64px bitmap.
  const tile=panel(api,128,72,times[i],view,'sword',false),col=i%6,row=Math.floor(i/6)*2+j;
  for(let y=0;y<128;y++)rgba.set(tile.slice(y*128*4,(y+1)*128*4),((row*128+y)*w+col*160)*4);
 }
 save(`sword-${view}-native-128-sheet.png`,w,h,rgba);
}
fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({fps,frames:n,duration:n/fps,beforeSide:'left',afterSide:'right',nativePixelScale:1,sharedGrid:{canvases:[64,128],actorHeight:36,paddingDelta:[32,32],spriteBitmapResampling:false},higherResolutionStudy:{canvas:128,actorHeight:72,note:'Independent target-resolution study, not larger pixels in a shared scene.'},limitations:['No automatic collision detection or damage.','The primary artist references informed timing and form; no reference artwork is redistributed.']},null,2));
console.log(out);

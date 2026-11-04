#!/usr/bin/env node
// Original adult portrait studies, generated with the Poku 2D Painter.
import fs from'node:fs';import path from'node:path';
import{createFrame,composite,hex,Painter,drawHumanPortrait2D,renderHumanPortrait2D}from'../build/core/index.js';
import{encodePNG}from'../build-tools/tools/lib/png.mjs';import{writeVideo}from'../build-tools/tools/lib/fxlib.mjs';
export const PEOPLE=[
 {name:'IRA',style:{skin:'warm',face:'oval',hair:'long',hairColor:'ink',eyes:'teal',clothing:'blouse',cloth:'ocean'}},
 {name:'RENA',style:{skin:'light',face:'angular',hair:'bob',hairColor:'copper',eyes:'amber',clothing:'coat',cloth:'moss'}},
 {name:'NALA',style:{skin:'deep',face:'long',hair:'braid',hairColor:'plum',eyes:'amber',clothing:'knit',cloth:'rose'}},
 {name:'SENA',style:{skin:'brown',face:'oval',hair:'ponytail',hairColor:'silver',eyes:'violet',clothing:'coat',cloth:'violet'}},
];
export const EXPRESSIONS=['neutral','smile','determined','surprised'];
export function canvasAt(resolution=128,time=0,light=false,expression='neutral'){
 const w=resolution*4,h=resolution+25,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex(light?'#e6dfd4':'#1d2534'));
 for(let i=0;i<4;i++){p.place(i*resolution,0);drawHumanPortrait2D(p,{...PEOPLE[i].style,resolution},{time,expression});p.reset();p.text(PEOPLE[i].name,i*resolution+resolution/2,resolution+4,hex(light?'#47535c':'#c7c0b4'),{align:'center'});}
 return{w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};
}
export function silhouetteAt(resolution=128){const w=resolution*4,h=resolution,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex('#e8e3d8'));for(let i=0;i<4;i++){const a=renderHumanPortrait2D({...PEOPLE[i].style,resolution,outline:null});for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++)if(a.mask.data[y*a.w+x])p.px(i*resolution+x,y,hex('#293343'));}return{w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};}
export function transparent(resolution=128,person=0,pose={},canvas){const[w,h]=canvas??[resolution,resolution],f=createFrame(w,h),p=new Painter(f);drawHumanPortrait2D(p,{...PEOPLE[person].style,resolution,canvas},pose);return{w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};}
export function save(file,q){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(q.w,q.h,q.rgba));}
if(import.meta.url===`file://${process.argv[1]}`){const out=process.argv[2]??'records/human-portraits',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});
 for(const res of[64,96,128,192]){save(`${out}/native-${res}.png`,canvasAt(res));save(`${out}/silhouette-${res}.png`,silhouetteAt(res));save(`${out}/light-${res}.png`,canvasAt(res,0,true));for(let i=0;i<4;i++)save(`${out}/transparent-${res}-${i}.png`,transparent(res,i));}
 for(const expression of EXPRESSIONS)save(`${out}/${expression}-128.png`,canvasAt(128,0,true,expression));
 save(`${out}/blink-128.png`,canvasAt(128,1.6,true));save(`${out}/padded-64-in-128.png`,transparent(64,0,{},[128,128]));
 if(!single)for(const res of[64,128]){const frames=[];for(let i=0;i<40;i++){const q=canvasAt(res,i/20);frames.push({t:i/20,color:q.rgba,clear:q.rgba});}const q=canvasAt(res);if(!writeVideo(`${out}/portraits-${res}.gif`,{w:q.w,h:q.h,fps:20,n:40,frames},1))throw Error('ffmpeg required');}
 fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({renderer:'Poku Pixel FX 2D Painter',originalDesigns:true,adultBustStudies:true,dimensions:[64,96,128,192],wholeSceneDisplayScale:1,people:PEOPLE},null,2));console.log(out);
}

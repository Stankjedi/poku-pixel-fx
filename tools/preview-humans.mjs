#!/usr/bin/env node
// Reusable pure-2D practice sheet. Run npm run build first.
import fs from 'node:fs';
import path from 'node:path';
import { createFrame,composite,hex,Painter,drawHuman2D,humanMotion2D } from '../build/core/index.js';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';
import { writeVideo } from '../build-tools/tools/lib/fxlib.mjs';
export const PEOPLE=[
 {name:'MIRA',caption:'RELAXED / BOB',motion:'idle',style:{height:98,build:'slender',skin:'warm',hair:'bob',hairColor:'chestnut',outfit:'shirt',cloth:['#425b6d','#628496','#92aeb3'],trousers:['#414851','#59636b','#7b8588']}},
 {name:'JUN',caption:'WAVE / CROPPED',motion:'wave',style:{height:104,skin:'light',hair:'crop',hairColor:'dark',outfit:'jacket',cloth:['#6f433f','#a26754','#c99770'],trousers:['#333f4a','#4b5a64','#70808a']}},
 {name:'AMA',caption:'WALK / CURLS',motion:'walk',style:{height:100,skin:'deep',hair:'curls',hairColor:'dark',outfit:'sleeveless',cloth:['#8d6240','#ba9157','#e1be7b'],trousers:['#334c55','#4c6e73','#749290']}},
 {name:'ELI',caption:'READY / SWEPT',motion:'guard',style:{height:102,build:'broad',skin:'brown',hair:'swept',hairColor:'dark',outfit:'shirt',cloth:['#3d5f57','#608477','#90a78b'],trousers:['#4a424b','#655a61','#82777a']}},
 {name:'NORA',caption:'CROUCH / BUN',motion:'crouch',style:{height:104,build:'slender',skin:'light',hair:'bun',hairColor:'gold',outfit:'jacket',cloth:['#635777','#8d7b98','#b8a6b9'],trousers:['#444751','#646873','#858995']}},
 {name:'LEO',caption:'STAND / TUNIC',motion:'idle',style:{height:96,skin:'brown',hair:'swept',hairColor:'silver',outfit:'tunic',cloth:['#344d70','#526f96','#839eb8'],trousers:['#4f4144','#705c57','#968075']}},
];
const W=744,H=354,FPS=20,N=40;
function label(p,txt,x,y,c='#c3c5bf'){p.text(txt,x,y,hex(c),{align:'center'});}
export function frameAt(t,light=false){
 const f=createFrame(W,H),p=new Painter(f);p.rect(0,0,W,H,hex(light?'#e3ded2':'#171d2b'));
 label(p,'HUMAN STUDIES / PURE 2D',W/2,14,light?'#3e4d58':'#ead9b9');
 label(p,'CONNECTED FORMS   /   COLOR SEPARATION   /   NO INTERNAL INK PANELS',W/2,30,light?'#5b6670':'#7c929c');
 for(let i=0;i<PEOPLE.length;i++){
   const q=PEOPLE[i],x=62+124*i,y=165;
   p.reset();p.rect(i*124+9,51,106,126,hex(light?'#d6d1c8':'#202939'));
   p.ellipse(x,y+2,23,3,hex(light?'#b7b3ab':'#101623'));
   p.place(x,y);drawHuman2D(p,q.style,humanMotion2D(q.motion,t));
   p.reset();label(p,q.name,x,183,light?'#344759':'#e1c9a5');label(p,q.caption,x,197,light?'#64727b':'#7f939e');
 }
 p.reset();p.rect(12,214,W-24,1,hex(light?'#c1bcb3':'#364050'));
 label(p,'NATIVE SIZE STUDIES',146,226,light?'#3e4d58':'#b7c7cc');
 const sizes=[32,48,72,96],xs=[44,100,170,252];
 for(let i=0;i<sizes.length;i++){p.place(xs[i],335);drawHuman2D(p,{...PEOPLE[0].style,height:sizes[i]},{});p.reset();label(p,`${sizes[i]} PX`,xs[i],342,light?'#56636a':'#91a2aa');}
 label(p,'ONE SILHOUETTE / OPTIONAL CONTOUR',525,226,light?'#3e4d58':'#b7c7cc');
 for(let i=0;i<3;i++){p.place(418+i*108,335);drawHuman2D(p,{...PEOPLE[i+1].style,height:64,outline:i===0?null:undefined},humanMotion2D(i===2?'wave':'idle',t));p.reset();label(p,['NO OUTLINE','OUTSIDE ONLY','BENDING JOINTS'][i],418+i*108,342,light?'#56636a':'#91a2aa');}
 return composite(f,new Uint8Array(W*H*4),null);
}
function save(file,w,h,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,bytes));}
if(import.meta.url===`file://${process.argv[1]}`){
 const out=process.argv[2]??'records/humans',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});
 const frames=[];for(let i=0;i<(single?1:N);i++){const rgba=frameAt(i/FPS);frames.push({t:i/FPS,color:rgba,clear:rgba});}
 save(`${out}/native.png`,W,H,frames[0].color);save(`${out}/light.png`,W,H,frameAt(0,true));
 if(!single){if(!writeVideo(`${out}/human-practice.gif`,{w:W,h:H,fps:FPS,n:N,frames},2))throw new Error('ffmpeg required');}
 save(`${out}/quarter.png`,W,H,frameAt(.5));save(`${out}/half.png`,W,H,frameAt(1));
 const transparent=createFrame(W,140),tp=new Painter(transparent);
 PEOPLE.forEach((q,i)=>{tp.place(62+124*i,124);drawHuman2D(tp,q.style,humanMotion2D(q.motion,0));});
 save(`${out}/transparent.png`,W,140,composite(transparent,new Uint8Array(W*140*4),null));
 const contact=new Uint8Array(W*H*4*4);for(let i=0;i<4;i++)contact.set(frameAt(i*.5),i*W*H*4);save(`${out}/contact.png`,W,H*4,contact);
 fs.writeFileSync(`${out}/animation.json`,JSON.stringify({renderer:'Poku Pixel FX 2D Painter',uses3D:false,width:W,height:H,fps:FPS,frames:N,duration:2,displayScale:2,people:PEOPLE},null,2));
 console.log(out);
}

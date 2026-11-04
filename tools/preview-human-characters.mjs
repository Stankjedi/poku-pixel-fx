#!/usr/bin/env node
// Appearance practice, rendered directly by Poku's 2D Painter. Build first.
import fs from'node:fs';import path from'node:path';
import{createFrame,composite,hex,Painter,drawHuman2D,humanViewMotion2D}from'../build/core/index.js';
import{encodePNG}from'../build-tools/tools/lib/png.mjs';import{writeVideo}from'../build-tools/tools/lib/fxlib.mjs';
export const PEOPLE=[
 {name:'MIRA',style:{build:'slender',skin:'warm',faceShape:'round',hair:'ponytail',hairColor:'chestnut',outfit:'sweater',cloth:['#5d4764','#876488','#b08b9f'],trousers:['#353e50','#515e73','#788798']}},
 {name:'DEV',style:{build:'broad',skin:'brown',faceShape:'square',hair:'shaved',facialHair:'beard',hairColor:'dark',outfit:'overalls',cloth:['#967450','#c49c67','#e0bf8b'],trousers:['#315564','#4b7887','#77a0a4']}},
 {name:'SORA',style:{build:'slender',skin:'light',faceShape:'long',hair:'parted',hairColor:'dark',outfit:'jacket',cloth:['#516253','#7b8e70','#a5b394'],trousers:['#494452','#696276','#91879a']}},
 {name:'AMA',style:{build:'regular',skin:'deep',faceShape:'round',hair:'curls',hairColor:'dark',outfit:'overalls',cloth:['#895456','#b77a73','#d9a08d'],trousers:['#3e5268','#617b91','#91a6b6']}},
 {name:'ELI',style:{build:'broad',skin:'light',faceShape:'square',hair:'parted',facialHair:'beard',hairColor:'silver',outfit:'sweater',cloth:['#345b57','#557f73','#88a692'],trousers:['#51484a','#74625d','#9b8373']}},
 {name:'NORA',style:{build:'regular',skin:'brown',faceShape:'long',hair:'ponytail',hairColor:'gold',outfit:'sleeveless',cloth:['#6d4550','#a6656b','#d2928b'],trousers:['#424751','#636c76','#8d98a1']}},
];
export const W=840,H=618,FPS=20,N=40,VIEWS=['front','three-quarter','side','back'];
const label=(p,s,x,y,c)=>p.text(s,x,y,hex(c),{align:'center'});
export function frameAt(t,light=false){
 const f=createFrame(W,H),p=new Painter(f),bg=light?'#e5dfd3':'#171d2b',fg=light?'#3a4b58':'#daccb5',muted=light?'#626c71':'#91a6b1';p.rect(0,0,W,H,hex(bg));
 label(p,'PEOPLE / FACE, HAIR AND EVERYDAY CLOTHES',W/2,10,fg);label(p,'AUTHORED 2D CLUSTERS / ONE CONNECTED SILHOUETTE',W/2,26,muted);
 for(let col=0;col<PEOPLE.length;col++){
  const q=PEOPLE[col],x=70+col*140;label(p,q.name,x,44,fg);
  for(let row=0;row<VIEWS.length;row++){
   const view=VIEWS[row],foot=139+row*101;p.rect(col*140+5,57+row*101,130,97,hex(light?'#d6d1c8':'#222b39'));
   p.ellipse(x,foot+1,16,2,hex(light?'#bab5ad':'#111724'));p.place(x,foot);drawHuman2D(p,{...q.style,view,height:72},humanViewMotion2D(view,'idle',t+col*.125));p.reset();label(p,view.toUpperCase(),x,foot+7,muted);
  }
  const foot=590;for(const[i,height]of[32,48,72].entries()){
   const xx=col*140+25+i*44;p.place(xx,foot);drawHuman2D(p,{...q.style,height},humanViewMotion2D('front','idle',t+col*.125));p.reset();label(p,String(height),xx,foot+7,muted);
  }
 }
 label(p,'NATIVE SIZE CHECK / 32, 48 AND 72 PX',W/2,479,fg);
 label(p,'LARGER SHAPES CARRY IDENTITY; TINY FACES KEEP ONLY READABLE MARKS',W/2,608,muted);
 return composite(f,new Uint8Array(W*H*4),null);
}
function study(type){
 const faces=['oval','round','square','long'],styles=type==='face'?faces:['shirt','sweater','overalls'],w=styles.length*150,h=360,f=createFrame(w,h),p=new Painter(f);
 p.rect(0,0,w,h,hex('#e5dfd3'));label(p,type==='face'?'SAME PALETTE / DIFFERENT HEAD SHAPES':'SAME PERSON / DIFFERENT GARMENTS',w/2,8,'#3a4b58');
 for(let col=0;col<styles.length;col++)for(let row=0;row<3;row++){
  const view=['front','three-quarter','side'][row],base=110+row*113,x=col*150+75;
  for(const[i,height]of[32,48,72].entries()){
   p.place(col*150+25+i*48,base);drawHuman2D(p,{height,view,skin:'brown',hair:'shaved',...(type==='face'?{faceShape:styles[col]}:{outfit:styles[col]})},humanViewMotion2D(view,'idle',0));p.reset();
  }
  label(p,`${styles[col].toUpperCase()} / ${view.toUpperCase()}`,x,base+7,'#626c71');
 }
 return{w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};
}
function save(file,w,h,rgba){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,rgba));}
if(import.meta.url===`file://${process.argv[1]}`){const out=process.argv[2]??'records/human-characters',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});
 const frames=[];for(let i=0;i<(single?1:N);i++){const rgba=frameAt(i/FPS);frames.push({t:i/FPS,color:rgba,clear:rgba});}
 for(const[name,t,light]of[['native',0,false],['quarter',.5,false],['blink',1.6,false],['light',0,true]])save(`${out}/${name}.png`,W,H,frameAt(t,light));
 for(const type of['face','garment']){const q=study(type);save(`${out}/${type}-study.png`,q.w,q.h,q.rgba);}
 if(!single&&!writeVideo(`${out}/human-characters-idle.gif`,{w:W,h:H,fps:FPS,n:N,frames},2))throw new Error('ffmpeg required');
 const atlas=createFrame(576,384),p=new Painter(atlas),entries=[];
 for(let row=0;row<4;row++)for(let col=0;col<6;col++){
  const view=VIEWS[row],person=PEOPLE[col];p.place(col*96+48,row*96+84);drawHuman2D(p,{...person.style,height:72,view},humanViewMotion2D(view,'idle',0));p.reset();
  entries.push({name:person.name,view,height:72,style:person.style,motion:'idle',time:0,rect:{x:col*96,y:row*96,w:96,h:96},pivot:[48,84]});
 }
 save(`${out}/character-atlas.png`,576,384,composite(atlas,new Uint8Array(576*384*4),null));fs.writeFileSync(`${out}/character-atlas.json`,JSON.stringify({kind:'static-appearance-study',entries},null,2));
 fs.writeFileSync(`${out}/animation.json`,JSON.stringify({renderer:'Poku Pixel FX 2D Painter',uses3D:false,width:W,height:H,fps:FPS,frames:N,duration:2,displayScale:2,people:PEOPLE},null,2));console.log(out);
}

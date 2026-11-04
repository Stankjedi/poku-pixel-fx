#!/usr/bin/env node
import fs from'node:fs';import path from'node:path';
import{createFrame,composite,hex,Painter,drawHuman2D,humanCombat2D,humanContactPixel2D,HUMAN_COMBAT_TIMING}from'../build/core/index.js';
import{encodePNG}from'../build-tools/tools/lib/png.mjs';import{writeVideo}from'../build-tools/tools/lib/fxlib.mjs';
export const W=900,H=502,FPS=50,N=80,ACTIONS=['punch','block','hit'],VIEWS=['front','side','back'],SIZES=[32,48,72];
export const STYLE={faceShape:'square',hair:'parted',skin:'brown',hairColor:'dark',outfit:'shirt',cloth:['#345b57','#557f73','#88a692'],trousers:['#51484a','#74625d','#9b8373']};
const label=(p,s,x,y,c)=>p.text(s,x,y,hex(c),{align:'center'});
export function frameAt(t,light=false){const f=createFrame(W,H),p=new Painter(f),bg=light?'#e5dfd3':'#171d2b',fg=light?'#3a4b58':'#daccb5',muted=light?'#626c71':'#91a6b1';p.rect(0,0,W,H,hex(bg));
 label(p,'COMBAT GESTURES / AUTHORED 2D',W/2,10,fg);label(p,'READY > ACTION > READY / COLORED INTERIORS / FIXED FOOT CONTACTS',W/2,26,muted);
 for(let col=0;col<3;col++)for(let row=0;row<3;row++){
  const action=ACTIONS[col],view=VIEWS[row],foot=158+row*153;p.rect(col*300+5,45+row*153,290,147,hex(light?'#d6d1c8':'#222b39'));
  label(p,`${action.toUpperCase()} / ${view.toUpperCase()}`,col*300+150,50+row*153,fg);
  const phase=humanCombat2D(action,t,{...STYLE,view}).phase;label(p,phase.toUpperCase(),col*300+150,64+row*153,muted);
  for(let i=0;i<3;i++){
   const height=SIZES[i],x=col*300+[45,127,222][i],style={...STYLE,view,height},q=humanCombat2D(action,t,style);p.ellipse(x,foot+1,height*.22,1.3,hex(light?'#bab5ad':'#111724'));
   if(action==='punch'&&q.contact){const [cx,cy]=q.contact.position;p.line(x+cx,foot+cy-4,x+cx,foot+cy+4,hex(light?'#a47763':'#7d5d4f'));}
   p.place(x,foot);const sp=drawHuman2D(p,style,q.pose);p.reset();
   if(q.contactActive&&q.contact){const pixel=humanContactPixel2D(sp,q.contact.position);if(pixel)p.px(x+pixel[0],foot+pixel[1],hex('#f6d48f'));}
   label(p,`${height} PX`,x,foot+9,muted);
  }
 }
 label(p,'SMALL GOLD DOT = AUTHORED SYNC CUE, NOT AUTOMATIC COLLISION',W/2,490,muted);return composite(f,new Uint8Array(W*H*4),null);
}
function sheet(action,view){const w=800,h=420,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex('#e5dfd3'));
 const duration=HUMAN_COMBAT_TIMING[action].duration;for(let i=0;i<20;i++){const t=duration*i/19,col=i%8,row=Math.floor(i/8),x=col*100+40,y=row*136+111,style={...STYLE,view,height:72},q=humanCombat2D(action,t,style);p.place(x,y);drawHuman2D(p,style,q.pose);p.reset();label(p,`${t.toFixed(2)} / ${q.phase.toUpperCase()}`,col*100+50,y+10,'#626c71');}return{w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};}
export function exchangeAt(t){
 const w=600,h=170,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex('#e5dfd3'));label(p,'SAME FLOOR / PUNCH AND HIT CUES ALIGNED',w/2,10,'#3a4b58');
 for(let i=0;i<3;i++){
  const height=SIZES[i],x=i*200+52,ground=140,style={...STYLE,view:'side',height},a=humanCombat2D('punch',t,style),b=humanCombat2D('hit',t-(HUMAN_COMBAT_TIMING.punch.contact-HUMAN_COMBAT_TIMING.hit.contact),{...style,facing:'left'});
  const otherX=x+a.contact.position[0]-b.contact.position[0];
  p.line(i*200+22,ground+1,i*200+177,ground+1,hex('#c5beb1'));
  p.place(x,ground);const attackerSprite=drawHuman2D(p,style,a.pose);p.reset();
  p.place(otherX,ground);drawHuman2D(p,{...style,facing:'left'},b.pose);p.reset();
  if(a.contactActive){const pixel=humanContactPixel2D(attackerSprite,a.contact.position);if(pixel)p.px(x+pixel[0],ground+pixel[1],hex('#f4d185'));}
  label(p,`${height} PX / ${b.phase.toUpperCase()}`,i*200+100,151,'#626c71');
 }return composite(f,new Uint8Array(w*h*4),null);
}
function save(file,w,h,rgba){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,rgba));}
if(import.meta.url===`file://${process.argv[1]}`){const out=process.argv[2]??'records/human-combat',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});const frames=[];
 for(let i=0;i<(single?1:N);i++){const rgba=frameAt(i/FPS);frames.push({t:i/FPS,color:rgba,clear:rgba});}
 for(const[name,t,light]of[['ready',0,false],['windup',.2,false],['contact',.36,false],['recoil',.24,false],['light',.36,true]])save(`${out}/${name}.png`,W,H,frameAt(t,light));
 for(const action of ACTIONS)for(const view of VIEWS){const q=sheet(action,view);save(`${out}/${view}-${action}-frames.png`,q.w,q.h,q.rgba);}
 save(`${out}/exchange-ready.png`,600,170,exchangeAt(0));
 save(`${out}/exchange-contact.png`,600,170,exchangeAt(.34));save(`${out}/exchange-recoil.png`,600,170,exchangeAt(.46));
 if(!single){const seq=[];for(let i=0;i<N;i++){const rgba=exchangeAt(i/FPS);seq.push({t:i/FPS,color:rgba,clear:rgba});}if(!writeVideo(`${out}/human-contact-exchange.gif`,{w:600,h:170,fps:FPS,n:N,frames:seq},2))throw new Error('ffmpeg required');}
 if(!single&&!writeVideo(`${out}/human-combat.gif`,{w:W,h:H,fps:FPS,n:N,frames},2))throw new Error('ffmpeg required');
 fs.writeFileSync(`${out}/animation.json`,JSON.stringify({renderer:'Poku Pixel FX 2D Painter',uses3D:false,width:W,height:H,fps:FPS,frames:N,duration:N/FPS,displayScale:2,views:VIEWS,actions:ACTIONS,sizes:SIZES,cues:HUMAN_COMBAT_TIMING,cueFrames:Object.fromEntries(ACTIONS.map(action=>[action,HUMAN_COMBAT_TIMING[action].contact*FPS])),exchangeHitDelay:HUMAN_COMBAT_TIMING.punch.contact-HUMAN_COMBAT_TIMING.hit.contact},null,2));console.log(out);
}

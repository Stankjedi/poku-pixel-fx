#!/usr/bin/env node
import fs from'node:fs';import path from'node:path';
import{createFrame,composite,hex,Painter,drawHuman2D,humanAction2D}from'../build/core/index.js';import{encodePNG}from'../build-tools/tools/lib/png.mjs';import{writeVideo}from'../build-tools/tools/lib/fxlib.mjs';import{PEOPLE}from'./preview-humans.mjs';
export const W=624,H=364,FPS=20,N=48,VIEWS=['front','side','back'],SIZES=[32,48,72];
const label=(p,s,x,y,c='#9aafb6')=>p.text(s,x,y,hex(c),{align:'center'});
export function frameAt(t,light=false){const f=createFrame(W,H),p=new Painter(f),bg=light?'#e4ded2':'#171d2b',fg=light?'#3b4b56':'#e0d3b9';p.rect(0,0,W,H,hex(bg));label(p,'HUMAN MOTION / RUN AND JUMP',W/2,12,fg);
 for(let col=0;col<3;col++)for(let row=0;row<2;row++){
  const view=VIEWS[col],action=row?'jump':'run',foot=row?337:159,top=row?187:35;
  p.rect(col*208+5,top,198,171,hex(light?'#d6d1c8':'#222b39'));label(p,`${view.toUpperCase()} / ${action.toUpperCase()}`,col*208+104,top+5,fg);
  for(let i=0;i<3;i++){const x=col*208+33+i*67,height=SIZES[i],style={...PEOPLE[0].style,view,height},sample=humanAction2D(action,t,style);
   p.ellipse(x,foot+1,height*.17,1.5,hex(light?'#b6b1a9':'#111722'));p.place(x,foot);drawHuman2D(p,style,sample.pose);p.reset();label(p,`${height}`,x,foot+5,fg);
  }
  const sample=humanAction2D(action,t,{view});label(p,sample.phase.toUpperCase(),col*208+104,row?352:174,fg);
 }return composite(f,new Uint8Array(W*H*4),null);}
function save(file,w,h,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,encodePNG(w,h,data));}
function contacts(action,view){const times=action==='run'?[0,.1,.2,.3,.4,.5,.6,.7]:[0,.12,.22,.32,.54,.78,.9,1.1],f=createFrame(768,152),p=new Painter(f);p.rect(0,0,768,152,hex('#171d2b'));
 for(let i=0;i<times.length;i++){const x=48+i*96,t=times[i],style={...PEOPLE[1].style,view,height:72},sample=humanAction2D(action,t,style);p.place(x,126);drawHuman2D(p,style,sample.pose);p.reset();label(p,`${t.toFixed(2)} / ${sample.phase.toUpperCase()}`,x,139);}
 return composite(f,new Uint8Array(768*152*4),null);}
function fullSheet(action,view){const n=action==='run'?16:25,cols=action==='run'?8:5,rows=Math.ceil(n/cols),w=cols*96,h=rows*144,f=createFrame(w,h),p=new Painter(f);p.rect(0,0,w,h,hex('#171d2b'));
 for(let i=0;i<n;i++){const x=(i%cols)*96+48,y=Math.floor(i/cols)*144+116,t=i/20,style={...PEOPLE[1].style,view,height:72},a=humanAction2D(action,t,style);p.place(x,y);drawHuman2D(p,style,a.pose);p.reset();label(p,t.toFixed(2),x,y+11);label(p,a.phase.toUpperCase(),x,y+20);}
 return {w,h,rgba:composite(f,new Uint8Array(w*h*4),null)};}
if(import.meta.url===`file://${process.argv[1]}`){const out=process.argv[2]??'records/human-actions',single=process.argv.includes('--single');fs.mkdirSync(out,{recursive:true});const frames=[];
 for(let i=0;i<(single?1:N);i++){const rgba=frameAt(i/FPS);frames.push({t:i/FPS,color:rgba,clear:rgba});}
 for(const[name,t,l]of[['native',0,false],['apex',.54,false],['landing',.9,false],['light',.54,true]])save(`${out}/${name}.png`,W,H,frameAt(t,l));
 for(const view of VIEWS)for(const action of['run','jump']){save(`${out}/${view}-${action}-frames.png`,768,152,contacts(action,view));const sheet=fullSheet(action,view);save(`${out}/${view}-${action}-all-frames.png`,sheet.w,sheet.h,sheet.rgba);}
 if(!single&&!writeVideo(`${out}/human-run-jump.gif`,{w:W,h:H,fps:FPS,n:N,frames},2))throw new Error('ffmpeg required');
 fs.writeFileSync(`${out}/animation.json`,JSON.stringify({renderer:'Poku Pixel FX 2D Painter',uses3D:false,views:VIEWS,sizes:SIZES,width:W,height:H,fps:FPS,frames:N,duration:2.4,runLoop:.8,jumpOneShot:1.2,displayScale:2},null,2));console.log(out);
}

#!/usr/bin/env node
// Reproducible native example output. Rendering never certifies a visual review.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Painter} from '../build/core/painter.js';
import {hex} from '../build/core/color.js';
import {blitSprite2D} from '../build/core/sprite-raster.js';
import {createStudioCharacter2D,createCharacterPlayer2D,serializeCharacterAsset2D} from '../build/core/character-asset.js';
import {renderCharacterPortrait2D} from '../build/core/character-identity.js';
import {createCharacterReferencePack2D} from '../build/examples/character-studio.js';
import {createPixelToolkitStudies2D} from '../build/examples/pixel-toolkit.js';
import {encodePNG} from '../build-tools/tools/lib/png.mjs';
const newFrame=(w,h)=>({w,h,ox:0,oy:0,color:new Uint32Array(w*h),light:new Uint32Array(w*h)});
const rgba=frame=>{const out=new Uint8Array(frame.color.length*4);for(let i=0;i<frame.color.length;i++){const c=frame.color[i];out[i*4]=c&255;out[i*4+1]=c>>>8&255;out[i*4+2]=c>>>16&255;out[i*4+3]=c>>>24;}return out;};
const text=(p,label,x,y,color='#b5c7c4')=>{p.reset();p.text(label,x,y,hex(color),{align:'center'});};
const save=(out,name,frame)=>fs.writeFileSync(path.join(out,name),encodePNG(frame.w,frame.h,rgba(frame)));
export function renderCharacterStudioExamples(out='examples/character-studio',options={}){
  fs.mkdirSync(out,{recursive:true});
  const pack=createCharacterReferencePack2D(),players=Object.fromEntries(Object.entries(pack).map(([k,a])=>[k,createCharacterPlayer2D(a)]));
  for(const [name,asset] of Object.entries(pack))fs.writeFileSync(path.join(out,`${name}.character.json`),serializeCharacterAsset2D(asset)+'\n');
  const sheet=newFrame(864,576),p=new Painter(sheet);p.rect(0,0,sheet.w,sheet.h,hex('#182433'));
  text(p,'ORIGINAL NATIVE CHARACTER STUDIES',432,12,'#e4dbc3');text(p,'PALETTE IDENTITY / EQUIPMENT / RASTER CELS / DATA RIG',432,27);
  Object.entries(players).forEach(([name,player],i)=>{const x=108+i*216;p.rect(i*216+8,45,200,144,hex('#243544'));p.place(x,173);player.draw(p,.2);p.reset();text(p,pack[name].name.toUpperCase(),x,194,'#e4dbc3');text(p,`${pack[name].nativeHeight} NATIVE PX`,x,208);});
  text(p,'AUTHORED KEYS / ANTICIPATION, CONTACT, RECOVERY',432,234,'#e4dbc3');
  const keys=[['IDLE','idle',0],['ANTICIPATION','key-strike',.3],['CONTACT','key-strike',.5],['RECOVERY','key-strike',.9]];
  keys.forEach(([label,clip,t],i)=>{const x=108+i*216;p.rect(i*216+8,251,200,124,hex('#243544'));p.place(x,366);players.wayfarer.draw(p,t,clip);text(p,label,x,381);});
  text(p,'DISCRETE 2D VIEWS / SAME 64 PX NATIVE IDENTITY',432,407,'#e4dbc3');
  ['front','three-quarter','side','back'].forEach((view,i)=>{const x=108+i*216;p.rect(i*216+8,425,200,109,hex('#243544'));const player=createCharacterPlayer2D(createStudioCharacter2D({height:64,view}));p.place(x,523);player.draw(p,0);text(p,view.toUpperCase(),x,543);});
  save(out,'character-reference-native.png',sheet);
  const equipment=newFrame(768,208),ep=new Painter(equipment);ep.rect(0,0,768,208,hex('#182433'));
  [['SWORD READY','sword',0],['SWORD CONTACT','sword',.44],['BOW DRAW','bow',.55],['BOW RELEASE','bow',.9]].forEach(([label,clip,t],i)=>{ep.rect(i*192+4,8,184,166,hex('#243544'));ep.place(i*192+80,158);players.wayfarer.draw(ep,t,clip);text(ep,label,i*192+96,186);});save(out,'equipment-native.png',equipment);

  const portrait=newFrame(384,152),pp=new Painter(portrait);pp.rect(0,0,384,152,hex('#e4ddd0'));
  ['neutral','smile','determined'].forEach((expression,i)=>{const sprite=renderCharacterPortrait2D(pack.wayfarer.identity,{resolution:128,pose:{expression}});pp.place(i*128,0);blitSprite2D(pp,sprite);text(pp,expression.toUpperCase(),i*128+64,138,'#314753');});save(out,'shared-identity-portraits.png',portrait);
  const studies=createPixelToolkitStudies2D(.4),toolkit=newFrame(576,232),tp=new Painter(toolkit);tp.rect(0,0,576,232,hex('#182433'));
  studies.forEach((item,i)=>{const col=i%6,row=Math.floor(i/6),x=col*96,y=row*116;tp.rect(x+4,y+4,88,108,hex('#243544'));tp.place(x+32,y+25);blitSprite2D(tp,item.sprite);text(tp,item.name.toUpperCase(),x+48,y+70);text(tp,'32 PX',x+48,y+86);});save(out,'pixel-techniques-native.png',toolkit);
  fs.writeFileSync(path.join(out,'pixel-techniques.json'),JSON.stringify(studies.map(({name,note})=>({name,note,nativeSize:[32,32]})),null,2)+'\n');
  const frames=options.single?1:60,fw=192,fh=160,columns=10,atlas=newFrame(columns*fw,Math.ceil(frames/columns)*fh),ap=new Painter(atlas);
  for(let i=0;i<frames;i++){const ox=i%columns*fw,oy=Math.floor(i/columns)*fh;ap.place(ox+96,oy+138);players.wayfarer.draw(ap,i/30,'idle');}
  save(out,'idle-atlas.png',atlas);
  fs.writeFileSync(path.join(out,'playback.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Native character studies</title><style>body{margin:24px;background:#182433;color:#e4dbc3;font:16px system-ui}canvas,img{image-rendering:pixelated;display:block;margin:12px 0}canvas{background:#243544}button,select{font:inherit}figure{margin:0 0 24px}small{color:#b5c7c4}</style><h1>Native character studies</h1><p><button id="play">Pause</button> <label>Display <select id="zoom"><option value="1">1× native</option><option value="2" selected>2× integer</option><option value="3">3× integer</option></select></label> <small>60 held cels / 30 fps / 2 s. Display scaling never resizes source assets.</small></p><canvas id="scene" width="192" height="160"></canvas><p id="status"></p><figure><img src="character-reference-native.png" alt="Four original characters, key poses and four discrete views"><figcaption>Native reference sheet</figcaption></figure><figure><img src="pixel-techniques-native.png" alt="Twelve native material and cluster techniques"><figcaption>32 × 32 native technique studies</figcaption></figure><figure><img src="equipment-native.png" alt="Swords and bow grip at ready, contact, draw and release"></figure><figure><img src="shared-identity-portraits.png" alt="Shared identity portrait expressions"></figure><script>const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),atlas=new Image();ctx.imageSmoothingEnabled=false;let running=true,start=performance.now(),held=0;const zoom=document.querySelector('#zoom');function resize(){canvas.style.width=(192*Number(zoom.value))+'px';canvas.style.height=(160*Number(zoom.value))+'px'}zoom.onchange=resize;resize();document.querySelector('#play').onclick=()=>{running=!running;if(running)start=performance.now()-held/30*1000;document.querySelector('#play').textContent=running?'Pause':'Play'};function draw(now){const index=running?Math.floor((now-start)/1000*30)%${frames}:held;held=index;ctx.clearRect(0,0,192,160);ctx.drawImage(atlas,index%10*192,Math.floor(index/10)*160,192,160,0,0,192,160);document.querySelector('#status').textContent='Frame '+index+' · '+(index/30).toFixed(2)+' s';requestAnimationFrame(draw)}atlas.onload=()=>requestAnimationFrame(draw);atlas.src='idle-atlas.png';</script>`);
  fs.writeFileSync(path.join(out,'render-manifest.json'),JSON.stringify({schema:'poku.character-example-render/v1',nativeReference:[864,576],nativeTechniques:[576,232],playback:{frames,fps:30,duration:frames/30,frameSize:[fw,fh],clip:'idle'},review:{nativeContactSheetObserved:false,fullSpeedObserved:false,notes:'Rendering alone is not visual acceptance; record actual observations separately.'}},null,2)+'\n');
  return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(renderCharacterStudioExamples(process.argv[2]??'examples/character-studio',{single:process.argv.includes('--single')}));

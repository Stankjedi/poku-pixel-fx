import {Painter,type PaintFrame} from './painter.js';
import {hex} from './color.js';
import {blitSprite2D,transformSprite2D,pixelTransform2D,type RasterSprite2D} from './sprite-raster.js';
import {characterSocket2D,type CharacterSocket2D} from './character-animation.js';

export interface CreatureBoneAsset2D { id:string;parent?:string;offset:readonly[number,number];length:number;angle:number;range?:readonly[number,number];motion?:{amplitude:number;phase:number;cycles:number} }
export interface CreaturePartAsset2D { id:string;bone:string;kind:'segment'|'ellipse'|'polygon';offset?:readonly[number,number];radius?:number;tipRadius?:number;size?:readonly[number,number];points?:readonly(readonly[number,number])[];color:string;highlight?:string;semantic:string;layer:number }
export interface CreatureRigAsset2D { schema:'poku.creature-rig/v1';id:string;nativeHeight:number;duration:number;bones:readonly CreatureBoneAsset2D[];parts:readonly CreaturePartAsset2D[];sockets?:Record<string,{bone:string;at?:number;offset?:readonly[number,number];angle?:number}> }
export interface CreatureRigSample2D { sprite:RasterSprite2D;sockets:Record<string,CharacterSocket2D>;bones:Record<string,{start:[number,number];end:[number,number];angle:number}>;semanticMasks:Record<string,Uint8Array> }
/** Validated data-driven FK anatomy. Existing cat/fox/owl/dragon renderers remain unchanged. */
export function createCreatureRigAsset2D(input:CreatureRigAsset2D):CreatureRigAsset2D{
  const asset=JSON.parse(JSON.stringify(input)) as CreatureRigAsset2D;
  if(asset.schema!=='poku.creature-rig/v1'||!asset.id||!Number.isFinite(asset.nativeHeight)||asset.nativeHeight<16||asset.nativeHeight>384||!Number.isFinite(asset.duration)||asset.duration<=0||!asset.bones.length||asset.bones.length>128||asset.parts.length>256)throw new RangeError('Invalid creature rig asset');
  const ids=new Set<string>();for(const bone of asset.bones){if(!bone.id||ids.has(bone.id)||bone.parent&&!ids.has(bone.parent)||!bone.offset.every(Number.isFinite)||!Number.isFinite(bone.length)||bone.length<0||bone.length>512||!Number.isFinite(bone.angle))throw new RangeError('Creature bones need unique IDs in parent-first order');if(bone.range&&(!bone.range.every(Number.isFinite)||bone.range[0]>bone.range[1]))throw new RangeError('Invalid bone angle range');if(bone.motion&&(!Object.values(bone.motion).every(Number.isFinite)||bone.motion.cycles<0||Math.abs(bone.motion.amplitude)>Math.PI))throw new RangeError('Bone motion must be finite');ids.add(bone.id);}
  const partIds=new Set<string>();for(const part of asset.parts){if(!part.id||partIds.has(part.id))throw new RangeError('Creature part IDs must be unique');partIds.add(part.id);if(!ids.has(part.bone)||!/^#[a-f0-9]{6}$/i.test(part.color)||!['segment','ellipse','polygon'].includes(part.kind)||!Number.isFinite(part.layer)||!part.semantic)throw new RangeError('Invalid creature part');if(part.offset&&(part.offset.length!==2||!part.offset.every(Number.isFinite))||part.size&&(part.size.length!==2||!part.size.every(n=>Number.isFinite(n)&&n>0))||[part.radius,part.tipRadius].some(n=>n!==undefined&&(!Number.isFinite(n)||n<0))||part.highlight!==undefined&&!/^#[a-f0-9]{6}$/i.test(part.highlight))throw new RangeError('Invalid creature part geometry');if(part.kind==='polygon'&&(!part.points||part.points.length<3||part.points.length>128||!part.points.every(p=>p.length===2&&p.every(Number.isFinite))))throw new RangeError('Creature polygons need finite authored points');}
  for(const socket of Object.values(asset.sockets??{}))if(!ids.has(socket.bone)||socket.at!==undefined&&!Number.isFinite(socket.at)||socket.angle!==undefined&&!Number.isFinite(socket.angle)||socket.offset!==undefined&&(socket.offset.length!==2||!socket.offset.every(Number.isFinite)))throw new RangeError('Invalid creature socket');return asset;
}
export function compileCreatureRig2D(input:CreatureRigAsset2D){
  const asset=createCreatureRigAsset2D(input),scale=asset.nativeHeight/96,parts=[...asset.parts].sort((a,b)=>a.layer-b.layer),reach=asset.bones.reduce((n,b)=>n+b.length+Math.hypot(...b.offset),0)*scale+32;
  return{asset,bounds:{x0:-reach,y0:-reach,x1:reach,y1:reach},sample(time:number,facing:'right'|'left'='right'):CreatureRigSample2D{
    if(!Number.isFinite(time))throw new RangeError('Creature time must be finite');const phase=((time%asset.duration)+asset.duration)%asset.duration/asset.duration,bones:CreatureRigSample2D['bones']=Object.create(null);
    for(const bone of asset.bones){const parent=bone.parent?bones[bone.parent]:undefined,pa=parent?.angle??0,pc=Math.cos(pa),ps=Math.sin(pa),origin=parent?.end??[0,0];let local=bone.angle+(bone.motion?bone.motion.amplitude*Math.sin(2*Math.PI*(phase*bone.motion.cycles+bone.motion.phase)):0);if(bone.range)local=Math.max(bone.range[0],Math.min(bone.range[1],local));const angle=pa+local,start:[number,number]=[origin[0]+(pc*bone.offset[0]-ps*bone.offset[1])*scale,origin[1]+(ps*bone.offset[0]+pc*bone.offset[1])*scale],end:[number,number]=[start[0]+Math.cos(angle)*bone.length*scale,start[1]+Math.sin(angle)*bone.length*scale];bones[bone.id]={start,end,angle};}
    const all=Object.values(bones).flatMap(b=>[b.start,b.end]),pad=Math.ceil(Math.max(8,...parts.map(p=>Math.max(p.radius??0,p.tipRadius??0,...(p.size??[0,0]),...(p.points??[]).map(q=>Math.hypot(...q)))))*scale)+3;
    const x=Math.floor(Math.min(...all.map(q=>q[0])))-pad,y=Math.floor(Math.min(...all.map(q=>q[1])))-pad,w=Math.ceil(Math.max(...all.map(q=>q[0])))-x+pad+1,h=Math.ceil(Math.max(...all.map(q=>q[1])))-y+pad+1;
    if(w*h>1_048_576)throw new RangeError('Creature rig raster exceeds its construction budget');
    const frame:PaintFrame={w,h,ox:x,oy:y,color:new Uint32Array(w*h),light:new Uint32Array(w*h)},p=new Painter(frame),semanticMasks:Record<string,Uint8Array>={};
    const tags:PaintFrame={w,h,ox:x,oy:y,color:new Uint32Array(w*h),light:new Uint32Array(w*h)},tagPainter=new Painter(tags),roleColors=new Map<number,string>(),roleIds=new Map<string,number>();
    for(const part of parts){const bone=bones[part.bone],c=Math.cos(bone.angle),s=Math.sin(bone.angle),offset=part.offset??[0,0],pt=(a:number,b:number):[number,number]=>[bone.start[0]+(c*(a+offset[0])-s*(b+offset[1]))*scale,bone.start[1]+(s*(a+offset[0])+c*(b+offset[1]))*scale],color=hex(part.color);const length=asset.bones.find(b=>b.id===part.bone)!.length;
      const paint=(target:Painter,fill:number,highlight?:number)=>{
        if(part.kind==='segment'){const r=part.radius??3,t=part.tipRadius??r;target.poly([pt(0,-r),pt(length,-t),pt(length,t),pt(0,r)],fill);const a=pt(0,0),b=pt(length,0);target.ellipse(a[0],a[1],r*scale,r*scale,fill);target.ellipse(b[0],b[1],t*scale,t*scale,fill);if(highlight!==undefined)target.line(...pt(1,-r*.35),...pt(Math.max(1,length-2),-t*.35),highlight);}
        else if(part.kind==='ellipse'){const size=part.size??[4,4];target.poly(Array.from({length:32},(_,i)=>pt(Math.cos(i*Math.PI/16)*size[0],Math.sin(i*Math.PI/16)*size[1])),fill);}
        else target.poly(part.points!.map(q=>pt(q[0],q[1])),fill);
      };
      let tag=roleIds.get(part.semantic);if(tag===undefined){tag=(0xff000000|(roleIds.size+1))>>>0;roleIds.set(part.semantic,tag);roleColors.set(tag,part.semantic);}
      paint(p,color,part.highlight?hex(part.highlight):undefined);paint(tagPainter,tag,part.highlight?tag:undefined);
    }
    let sprite:RasterSprite2D={x,y,w,h,pixels:frame.color,mask:{w,h,data:Uint8Array.from(frame.color,c=>c>>>24?1:0)}};
    const sockets:Record<string,CharacterSocket2D>=Object.assign(Object.create(null),{root:characterSocket2D([0,0])});
    for(const[name,definition]of Object.entries(asset.sockets??{})){const bone=bones[definition.bone],at=definition.at??1,o=definition.offset??[0,0],c=Math.cos(bone.angle),s=Math.sin(bone.angle);sockets[name]=characterSocket2D([bone.start[0]+(bone.end[0]-bone.start[0])*at+(c*o[0]-s*o[1])*scale,bone.start[1]+(bone.end[1]-bone.start[1])*at+(s*o[0]+c*o[1])*scale],bone.angle+(definition.angle??0));}
    let semanticPixels=tags.color;
    if(facing==='left'){const transformedTags=transformSprite2D({...sprite,pixels:tags.color},pixelTransform2D(0,0,0,true));semanticPixels=transformedTags.pixels;sprite=transformSprite2D(sprite,pixelTransform2D(0,0,0,true));for(const socket of Object.values(sockets)){socket.position[0]*=-1;socket.basisX[0]*=-1;socket.basisY[0]*=-1;}for(const bone of Object.values(bones)){bone.start[0]*=-1;bone.end[0]*=-1;bone.angle=Math.PI-bone.angle;}}
    for(let i=0;i<sprite.pixels.length;i++){const color=sprite.pixels[i];if(!(color>>>24))continue;const semantic=roleColors.get(semanticPixels[i]>>>0)??'body';(semanticMasks[semantic]??=new Uint8Array(sprite.pixels.length))[i]=1;}
    return{sprite,sockets,bones,semanticMasks};
  }};
}
export function drawCreatureRig2D(p:Painter,rig:ReturnType<typeof compileCreatureRig2D>,time:number,facing:'right'|'left'='right'):CreatureRigSample2D{const sample=rig.sample(time,facing);blitSprite2D(p,sample.sprite);return sample;}

/** Original six-segment serpent study. Adding anatomy changes data rather than species switches. */
export function createSerpentRig2D(nativeHeight=64):CreatureRigAsset2D{
  const bones:CreatureBoneAsset2D[]=[{id:'body',offset:[-25,-14],length:18,angle:0,motion:{amplitude:.13,phase:0,cycles:1},range:[-.3,.3]}];
  for(let i=1;i<6;i++)bones.push({id:'segment'+i,parent:i===1?'body':'segment'+(i-1),offset:[0,0],length:10,angle:0,motion:{amplitude:.25,phase:-i*.12,cycles:1},range:[-.4,.4]});
  const parts:CreaturePartAsset2D[]=bones.map((b,i)=>({id:b.id+'-skin',bone:b.id,kind:'segment',radius:Math.max(1.2,5-i*.65),tipRadius:Math.max(.7,4.5-i*.65),color:i%2?'#4d7a64':'#5c9170',highlight:'#94b879',semantic:'scales',layer:i}));
  parts.push({id:'head',bone:'body',kind:'ellipse',offset:[-5,-1],size:[9,6],color:'#709b75',semantic:'head',layer:10},{id:'eye',bone:'body',kind:'ellipse',offset:[-9,-3],size:[1,1],color:'#e1bb69',semantic:'eyes',layer:11});
  return createCreatureRigAsset2D({schema:'poku.creature-rig/v1',id:'moss-serpent',nativeHeight,duration:2,bones,parts,sockets:{head:{bone:'body',at:0,offset:[-5,-1]},mouth:{bone:'body',at:0,offset:[-13,1],angle:Math.PI},chest:{bone:'body',at:.5},tail:{bone:'segment5',at:1}}});
}

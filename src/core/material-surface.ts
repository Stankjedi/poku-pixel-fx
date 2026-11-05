import type { EditableSprite2D } from './sprite-edit.js';
import { createMaterialRamp2D, type MaterialRamp2DOptions } from './material-ramp.js';
import type { PointLight2D } from './point-light-2d.js';
import { pixelPatternCoordinate2D, ditherThreshold2D, type DitherOptions2D, type PixelPatternContext2D } from './pixel-tools.js';

export interface MaterialChannels2D { w:number;h:number;material:Uint16Array;height:Float32Array;normal:Float32Array }
export interface PixelMaterial2D extends MaterialRamp2DOptions { id:number;palette:readonly(string|number)[];specularPower?:number;emission?:readonly[number,number,number] }
function checkChannels(c:MaterialChannels2D){const n=c.w*c.h;if(!Number.isSafeInteger(n)||n<1||n>16_777_216||c.material.length!==n||c.height.length!==n||c.normal.length!==n*3)throw new RangeError('Material channels must match native dimensions');}
/** Central-difference authored height map normals. The boundary duplicates its nearest height sample. */
export function normalsFromHeight2D(width:number,height:number,values:ArrayLike<number>,strength=1):Float32Array{
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height!==values.length||width*height>16_777_216||!Number.isFinite(strength)||strength<0)throw new RangeError('Invalid height channel');
  const out=new Float32Array(values.length*3),sample=(x:number,y:number)=>values[Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x))];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(!Number.isFinite(values[i]))throw new RangeError('Height samples must be finite');
    const nx=(sample(x-1,y)-sample(x+1,y))*strength*.5,ny=(sample(x,y-1)-sample(x,y+1))*strength*.5,len=Math.hypot(nx,ny,1);
    out.set([nx/len,ny/len,1/len],i*3);
  }
  return out;
}
export function createMaterialChannels2D(w:number,h:number,options:{material?:ArrayLike<number>;height?:ArrayLike<number>;normal?:ArrayLike<number>;heightStrength?:number;defaultMaterial?:number}={}):MaterialChannels2D{
  const n=w*h;if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||n>16_777_216)throw new RangeError('Invalid material surface dimensions');
  const ids=options.material??[options.defaultMaterial??1];
  for(let i=0;i<ids.length;i++)if(!Number.isInteger(ids[i])||ids[i]<0||ids[i]>65535)throw new RangeError('Material IDs must be unsigned 16-bit integers');
  const material=options.material?Uint16Array.from(options.material):new Uint16Array(n).fill(options.defaultMaterial??1),height=options.height?Float32Array.from(options.height):new Float32Array(n);
  const normal=options.normal?Float32Array.from(options.normal):normalsFromHeight2D(w,h,height,options.heightStrength??1),out={w,h,material,height,normal};checkChannels(out);
  if(!height.every(Number.isFinite)||!normal.every(Number.isFinite))throw new RangeError('Material channels must be finite');
  return out;
}
/** Author a semantic/material selection without inferring skin or metal from RGB. */
export function paintMaterialChannel2D(source:MaterialChannels2D,selection:ArrayLike<number>,materialId:number,height?:number):MaterialChannels2D{
  checkChannels(source);if(selection.length!==source.material.length||!Number.isInteger(materialId)||materialId<0||materialId>65535||height!==undefined&&!Number.isFinite(height))throw new RangeError('Invalid material selection');
  const out:MaterialChannels2D={...source,material:source.material.slice(),height:source.height.slice(),normal:source.normal.slice()};
  for(let i=0;i<selection.length;i++)if(selection[i]){out.material[i]=materialId;if(height!==undefined)out.height[i]=height;}
  if(height!==undefined)out.normal=normalsFromHeight2D(out.w,out.h,out.height);return out;
}
/** Compile palette ramps and lights once. Returned shader preserves coverage; it never blurs surface colors. */
export function createMaterialShader2D(materials:readonly PixelMaterial2D[],lights:readonly PointLight2D[],options:{ambient?:number;origin?:readonly[number,number];view?:readonly[number,number,number]}={}){
  const ramps=new Map<number,{ramp:ReturnType<typeof createMaterialRamp2D>;power:number;emission:readonly[number,number,number]}>();
  for(const m of materials){if(!Number.isInteger(m.id)||m.id<1||m.id>65535||ramps.has(m.id))throw new RangeError('Materials need unique positive IDs');const power=m.specularPower??16;if(m.emission&&(m.emission.length!==3||!m.emission.every(n=>Number.isFinite(n)&&n>=0)))throw new RangeError('Material emission must be nonnegative finite linear RGB');if(!Number.isFinite(power)||power<1)throw new RangeError('Specular exponent must be at least one');ramps.set(m.id,{ramp:createMaterialRamp2D(m.palette,m),power,emission:m.emission??[0,0,0]});}
  const sources=lights.map(l=>{if(!l.position.every(Number.isFinite)||!Number.isFinite(l.radius)||l.radius<=0||!Number.isFinite(l.intensity??1)||(l.intensity??1)<0)throw new RangeError('Invalid surface light');return{position:[...l.position],radius:l.radius,intensity:l.intensity??1};});
  const ambient=options.ambient??.18,origin=options.origin??[0,0],view=options.view??[0,0,1],vl=Math.hypot(...view);
  if(!Number.isFinite(ambient)||ambient<0||!vl||!view.every(Number.isFinite)||!origin.every(Number.isFinite))throw new RangeError('Invalid material ambient/view');
  return<T extends EditableSprite2D>(sprite:T,channels:MaterialChannels2D):T&{emission:Float32Array}=>{
    checkChannels(channels);if(sprite.w!==channels.w||sprite.h!==channels.h)throw new RangeError('Sprite and material channels must match');
    const pixels=sprite.pixels.slice(),emission=new Float32Array(pixels.length*3);
    for(let y=0;y<sprite.h;y++)for(let x=0;x<sprite.w;x++){
      const i=y*sprite.w+x,c=pixels[i];if(!(c>>>24)||!sprite.mask.data[i])continue;const material=ramps.get(channels.material[i]);if(!material)continue;
      const j=i*3,nx=channels.normal[j],ny=channels.normal[j+1],nz=channels.normal[j+2],nl=Math.hypot(nx,ny,nz)||1;
      let diffuse=ambient,specular=0;
      for(const light of sources){const dx=light.position[0]-(x+origin[0]+.5),dy=light.position[1]-(y+origin[1]+.5),dz=light.position[2]-channels.height[i],d=Math.hypot(dx,dy,dz);if(!d||d>=light.radius)continue;
        const attenuation=(1-(d/light.radius)**2)**2*light.intensity,lambert=Math.max(0,(nx*dx+ny*dy+nz*dz)/(d*nl));diffuse+=lambert*attenuation;
        const hx=dx/d+view[0]/vl,hy=dy/d+view[1]/vl,hz=dz/d+view[2]/vl,hl=Math.hypot(hx,hy,hz)||1;
        specular+=lambert>0?Math.max(0,(nx*hx+ny*hy+nz*hz)/(nl*hl))**material.power*attenuation:0;
      }
      pixels[i]=((material.ramp(diffuse,specular)&0xffffff)|(c&0xff000000))>>>0;
      for(let ch=0;ch<3;ch++)emission[j+ch]=Math.max(0,material.emission[ch])*(c>>>24)/255;
    }
    return{...sprite,pixels,mask:{...sprite.mask,data:sprite.mask.data.slice()},emission};
  };
}

export interface MaterialTexture2D { kind:'checker'|'hatch'|'woven'|'stone'|'dither';palette:readonly number[];coordinates:DitherOptions2D;seed?:number }
/** Small reproducible material brushes. The caller chooses a selection; silhouettes remain untouched. */
export function textureMaterial2D<T extends EditableSprite2D&{x?:number;y?:number}>(source:T,texture:MaterialTexture2D,selection?:ArrayLike<number>,context:PixelPatternContext2D={}):T{
  if(!texture.palette.length||!texture.palette.every(c=>Number.isInteger(c)&&c>=-0x80000000&&c<=0xffffffff)||!['checker','hatch','woven','stone','dither'].includes(texture.kind)||selection&&selection.length!==source.w*source.h)throw new RangeError('Texture needs a valid kind, palette and matching selection');const pixels=source.pixels.slice(),palette=texture.palette;
  for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++){
    const i=y*source.w+x,c=pixels[i];if(!(c>>>24)||!source.mask.data[i]||selection&&!selection[i])continue;
    const gx=(source.x??0)+x,gy=(source.y??0)+y,[u,v]=pixelPatternCoordinate2D(gx,gy,texture.coordinates,context);
    let q=0;
    if(texture.kind==='checker')q=((u+v)&1);
    else if(texture.kind==='hatch')q=((u-v)%4+4)%4===0?0:1;
    else if(texture.kind==='woven')q=(u&1)?((v&1)?2:0):1;
    else if(texture.kind==='dither')q=Math.floor(ditherThreshold2D(gx,gy,texture.coordinates,context)*palette.length);
    else{let n=Math.imul(Math.floor(u/3)^((texture.seed??1)|0),0x45d9f3b)^Math.imul(Math.floor(v/3),0x27d4eb2d);n=Math.imul(n^(n>>>16),0x45d9f3b);q=(n>>>0)%palette.length;}
    pixels[i]=((palette[q%palette.length]&0xffffff)|(c&0xff000000))>>>0;
  }
  return{...source,pixels,mask:{...source.mask,data:source.mask.data.slice()}};
}

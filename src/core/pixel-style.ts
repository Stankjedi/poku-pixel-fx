import type { EditableSprite2D } from './sprite-edit.js';
import {createOrderedPaletteQuantizer2D} from './pixel-quantize.js';
import {indexSprite2D,renderIndexedSprite2D,ditherSprite2D,selectiveOutline2D,compileAuthoredPixelTrack2D,cyclePalette2D,createDitherSampler2D,type PaletteCycle2D,type DitherOptions2D,type SelectiveOutlineOptions2D,type AuthoredPixelTrack2D,type PixelPatternContext2D} from './pixel-tools.js';

export interface PixelStyleProfile2D {
  version:1;name:string;nativeResolution:readonly[number,number];
  presentation:'integer-device-pixels'|'fit-preview';sampling:'inverse-cell-nearest';
  surfaceColors:'indexed'|'authored-rgba';palette?:readonly number[];quantization?:'exact'|'nearest'|'ordered';colorDitherStrength?:number;cycles?:readonly PaletteCycle2D[];
  alpha:'solid'|'coverage'|'authored-dither';dither:DitherOptions2D;
  outline:'none'|'silhouette'|'selective';outlineStyle?:SelectiveOutlineOptions2D;
  emission:'none'|'palette-stepped'|'linear-hdr';finalColorPolicy:'palette-locked'|'cinematic';
  poseSampling:'authored-cels'|'quantized-rig'|'continuous-raster';pixelTracks?:readonly AuthoredPixelTrack2D[];
}
/** Serializable, explicit opt-in. It never changes the legacy painter's global defaults. */
export function createPixelStyleProfile2D(input:Partial<PixelStyleProfile2D>={}):PixelStyleProfile2D{
  const p:PixelStyleProfile2D={version:1,name:'Native crisp',nativeResolution:[320,180],presentation:'integer-device-pixels',sampling:'inverse-cell-nearest',surfaceColors:'authored-rgba',alpha:'coverage',dither:{anchor:'object',pattern:'bayer4'},outline:'none',emission:'linear-hdr',finalColorPolicy:'cinematic',poseSampling:'continuous-raster',...JSON.parse(JSON.stringify(input))};
  if(p.version!==1||typeof p.name!=='string'||!p.name.length||p.nativeResolution.length!==2||!p.nativeResolution.every(n=>Number.isInteger(n)&&n>0&&n<=4096))throw new RangeError('Invalid pixel style identity or resolution');
  const choices={presentation:['integer-device-pixels','fit-preview'],sampling:['inverse-cell-nearest'],surfaceColors:['indexed','authored-rgba'],alpha:['solid','coverage','authored-dither'],outline:['none','silhouette','selective'],emission:['none','palette-stepped','linear-hdr'],finalColorPolicy:['palette-locked','cinematic'],poseSampling:['authored-cels','quantized-rig','continuous-raster']};
  for(const[key,values]of Object.entries(choices))if(!values.includes((p as unknown as Record<string,string>)[key]))throw new RangeError('Invalid pixel style '+key);
  if(!['object','world','screen'].includes(p.dither.anchor))throw new RangeError('Invalid dither anchor');
  if(p.finalColorPolicy==='palette-locked'&&(!p.palette?.length||p.emission==='linear-hdr'))throw new RangeError('Palette-locked final output needs a palette and cannot claim unrestricted HDR emission');
  if(p.surfaceColors==='indexed'&&!p.palette?.length)throw new RangeError('Indexed style needs an explicit palette');
  if(p.quantization!==undefined&&!['exact','nearest','ordered'].includes(p.quantization))throw new RangeError('Unknown color quantization');
  if(p.colorDitherStrength!==undefined&&(!Number.isFinite(p.colorDitherStrength)||p.colorDitherStrength<0||p.colorDitherStrength>1))throw new RangeError('Color dither strength must be within 0..1');
  return p;
}
export function compilePixelStyle2D(input:PixelStyleProfile2D){
  const profile=createPixelStyleProfile2D(input),tracks=(profile.pixelTracks??[]).map(compileAuthoredPixelTrack2D);
  createDitherSampler2D(profile.dither);
  if(profile.palette){
    if(!Array.isArray(profile.palette))throw new TypeError('Pixel palette must be an array');
    indexSprite2D({w:1,h:1,pixels:new Uint32Array(1),mask:{w:1,h:1,data:new Uint8Array(1)}},profile.palette);
  }
  if(profile.cycles)cyclePalette2D(profile.palette??[],profile.cycles,0);
  const quantizer=profile.quantization==='ordered'&&(profile.surfaceColors==='indexed'||profile.finalColorPolicy==='palette-locked')?createOrderedPaletteQuantizer2D(profile.palette!,profile.colorDitherStrength??1):undefined;
  return{profile,apply<T extends EditableSprite2D&{x?:number;y?:number}>(source:T,time=0,context:PixelPatternContext2D={}):T{
    let out:EditableSprite2D&{x?:number;y?:number}={...source,pixels:source.pixels.slice(),mask:{...source.mask,data:source.mask.data.slice()}};
    for(const track of tracks)out={...out,...track(out,time)};
    if(profile.outline!=='none')out=selectiveOutline2D(out,{shadow:0xff332625,...profile.outlineStyle,...(profile.outline==='silhouette'?{omitLit:false}: {})});
    if(profile.surfaceColors==='indexed'||profile.finalColorPolicy==='palette-locked')out={...out,...renderIndexedSprite2D(quantizer?quantizer.index(out,profile.dither,context,{ditherAlpha:profile.alpha==='authored-dither'}):indexSprite2D(out,profile.palette,profile.quantization==='nearest'?'nearest':'exact'),time,profile.cycles)};
    if(profile.alpha==='authored-dither')out=ditherSprite2D(out,profile.dither,context);
    else if(profile.alpha==='solid')for(let i=0;i<out.pixels.length;i++){out.pixels[i]=out.pixels[i]>>>24?(out.pixels[i]|0xff000000)>>>0:0;out.mask.data[i]=out.pixels[i]>>>24?1:0;}
    // Emission policy is carried into the renderer/export manifest; this surface-only operation does not invent light.
    return out as T;
  }};
}
export function serializePixelStyle2D(profile:PixelStyleProfile2D):string{return JSON.stringify(createPixelStyleProfile2D(profile),null,2);}
export function parsePixelStyle2D(json:string):PixelStyleProfile2D{return createPixelStyleProfile2D(JSON.parse(json));}

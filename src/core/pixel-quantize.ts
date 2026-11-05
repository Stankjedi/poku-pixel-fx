import type { EditableSprite2D } from './sprite-edit.js';
import { createDitherSampler2D, type DitherOptions2D, type IndexedSprite2D, type PixelPatternContext2D } from './pixel-tools.js';

const LINEAR=Float64Array.from({length:256},(_,i)=>{const c=i/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
const vector=(color:number)=>[LINEAR[color&255],LINEAR[color>>>8&255],LINEAR[color>>>16&255]] as const;
const weights=[.2126,.7152,.0722] as const;
type Mix={a:number;b:number;amount:number};

/** Color reduction to an authored palette. Alpha coverage is preserved unless explicitly dithered.
 * A fixed coordinate-anchored threshold chooses two palette entries in linear light.
 * Exact palette colors remain exact. No temporal/error-diffusion state is retained.
 */
export function createOrderedPaletteQuantizer2D(palette:readonly number[],strength=1){
  if(!Array.isArray(palette)||!palette.length||palette.length>256||!palette.every(c=>Number.isInteger(c)&&c>=-0x80000000&&c<=0xffffffff))throw new RangeError('Ordered quantization needs 1..256 RGB colors');
  if(!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('Color dither strength must be within 0..1');
  const colors=palette.map(c=>(c|0xff000000)>>>0),exact=new Map(colors.map((c,i)=>[c,i]));
  if(exact.size!==colors.length)throw new RangeError('Palette colors must be unique');
  const rgb=colors.map(vector),cache=new Map<number,Mix>();
  function mix(color:number):Mix{
    const key=(color|0xff000000)>>>0,hit=exact.get(key);if(hit!==undefined)return{a:hit,b:hit,amount:0};
    const cached=cache.get(key);if(cached)return cached;
    const q=vector(key);let nearest=0,error=Infinity;
    for(let i=0;i<rgb.length;i++){let d=0;for(let k=0;k<3;k++)d+=(q[k]-rgb[i][k])**2*weights[k];if(d<error){error=d;nearest=i;}}
    let best:Mix={a:nearest,b:nearest,amount:0};const a=rgb[nearest];
    if(strength>0)for(let b=0;b<rgb.length;b++){
      if(b===nearest)continue;let dot=0,length=0;
      for(let k=0;k<3;k++){const v=rgb[b][k]-a[k];dot+=(q[k]-a[k])*v*weights[k];length+=v*v*weights[k];}
      const t=Math.max(0,Math.min(1,dot/length));if(t<=0)continue;
      let residual=0;for(let k=0;k<3;k++)residual+=(q[k]-a[k]-(rgb[b][k]-a[k])*t)**2*weights[k];
      // A small contrast penalty favors a local ramp over needless distant-color speckling.
      const score=residual+length*t*(1-t)*.025;
      if(score<error-1e-15){error=score;best={a:nearest,b,amount:t*strength};}
    }
    if(cache.size<8192)cache.set(key,best);return best;
  }
  return{palette:colors.slice(),index(source:EditableSprite2D&{x?:number;y?:number},options:DitherOptions2D={anchor:'object'},context:PixelPatternContext2D={},coverage:{ditherAlpha?:boolean}={}):IndexedSprite2D{
    const {w,h}=source,n=w*h;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||n>16_777_216||source.pixels.length!==n||source.mask.w!==w||source.mask.h!==h||source.mask.data.length!==n)throw new RangeError('Quantization requires matching native raster buffers');
    const threshold=createDitherSampler2D(options,context),indices=new Uint16Array(n),alpha=new Uint8Array(n);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x,c=source.pixels[i];if(!source.mask.data[i]||!(c>>>24))continue;
      const a=(c>>>24)/255,t=threshold(x+(source.x??0)+.5,y+(source.y??0)+.5);
      if(coverage.ditherAlpha&&t>=a)continue;
      // Conditional thresholds avoid bias when color and coverage use the same pattern:
      // P(kept and color B) = alpha * mix(B), not min(alpha, mix(B)).
      const colorThreshold=coverage.ditherAlpha?t/a:t,m=mix(c);
      indices[i]=m.amount>colorThreshold?m.b:m.a;alpha[i]=coverage.ditherAlpha?255:c>>>24;
    }
    return{w,h,x:source.x??0,y:source.y??0,indices,alpha,palette:colors.slice()};
  }};
}

/** Small original ramps: palettes are editable starting points, not automatic aesthetic approval. */
export const PIXEL_PALETTE_PRESETS:Readonly<Record<string,readonly number[]>>=Object.freeze({
  'ink-paper':Object.freeze([0xff211b20,0xff595152,0xff9a9690,0xffe8e2d5]),
  'moon-steel':Object.freeze([0xff231c17,0xff574134,0xff856b52,0xffbda083,0xffe8d3b7,0xfffff4df]),
  'ember-gold':Object.freeze([0xff1d101f,0xff342461,0xff315aab,0xff3999e4,0xff86d5ff,0xffd8f5ff]),
  'glacier':Object.freeze([0xff33251c,0xff735330,0xffa98048,0xffcbb972,0xffe1dfb5,0xfff0fff1]),
  'arcane-orchid':Object.freeze([0xff2f1728,0xff66313e,0xffa1576e,0xffcf8da6,0xffdebfdc,0xfff0eaff]),
});

import type { Painter } from './painter.js';
import type { EditableSprite2D } from './sprite-edit.js';

/** A native raster. x/y locate the top-left relative to the actor's continuous origin. */
export interface RasterSprite2D extends EditableSprite2D { x: number; y: number }
/** Column-major 2D affine transform: [a,b,c,d,tx,ty]. Pixel centers are sampled only at the destination. */
export type PixelTransform2D = readonly [number, number, number, number, number, number];
export const IDENTITY_PIXEL_TRANSFORM: PixelTransform2D = Object.freeze([1, 0, 0, 1, 0, 0]);

export function pixelTransform2D(x = 0, y = 0, angle = 0, flip = false): PixelTransform2D {
  if (![x,y,angle].every(Number.isFinite)) throw new RangeError('Pixel transform must be finite');
  const c=Math.cos(angle),s=Math.sin(angle),f=flip?-1:1;
  return [c*f,s*f,-s,c,x,y];
}
/** parent * child; never round an intermediate parent, pivot, socket, or camera coordinate. */
export function composePixelTransform2D(parent: PixelTransform2D, child: PixelTransform2D): PixelTransform2D {
  const [a,b,c,d,x,y]=parent,[e,f,g,h,u,v]=child;
  return [a*e+c*f,b*e+d*f,a*g+c*h,b*g+d*h,a*u+c*v+x,b*u+d*v+y];
}
export function transformPixelPoint2D(m: PixelTransform2D, p: readonly [number,number]): [number,number] {
  return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
}
export function invertPixelTransform2D(m: PixelTransform2D): PixelTransform2D {
  const [a,b,c,d,x,y]=m,det=a*d-b*c;
  if (!m.every(Number.isFinite)||!Number.isFinite(det)||Math.abs(det)<1e-12) throw new RangeError('Pixel transform must be finite and invertible');
  return [d/det,-b/det,-c/det,a/det,(c*y-d*x)/det,(b*x-a*y)/det];
}

/** Draw whole source cells, including arbitrary rotation. Forward point stamping loses cells. */
export function blitSprite2D(p: Pick<Painter,'mask'>, sprite: EditableSprite2D & {x?:number;y?:number}, alpha=1): void {
  p.mask(sprite.mask,sprite.x??0,sprite.y??0,(x,y)=>sprite.pixels[y*sprite.w+x],alpha);
}

/** Bake one explicit local transform. This creates a new native raster; source arrays are untouched. */
export function transformSprite2D(sprite: RasterSprite2D, transform: PixelTransform2D): RasterSprite2D {
  const inverse=invertPixelTransform2D(transform);
  const corners=[[sprite.x,sprite.y],[sprite.x+sprite.w,sprite.y],[sprite.x,sprite.y+sprite.h],[sprite.x+sprite.w,sprite.y+sprite.h]] as [number,number][];
  const points=corners.map(q=>transformPixelPoint2D(transform,q));
  const x=Math.floor(Math.min(...points.map(p=>p[0]))),y=Math.floor(Math.min(...points.map(p=>p[1])));
  const w=Math.max(1,Math.ceil(Math.max(...points.map(p=>p[0])))-x),h=Math.max(1,Math.ceil(Math.max(...points.map(p=>p[1])))-y);
  if(!Number.isSafeInteger(w*h)||w*h>16_777_216)throw new RangeError('Transformed sprite exceeds the native raster budget');
  const pixels=new Uint32Array(w*h),data=new Uint8Array(w*h);
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
    const q=transformPixelPoint2D(inverse,[x+xx+.5,y+yy+.5]),sx=Math.floor(q[0]-sprite.x),sy=Math.floor(q[1]-sprite.y);
    if(sx<0||sy<0||sx>=sprite.w||sy>=sprite.h)continue;
    const source=sy*sprite.w+sx,i=yy*w+xx;
    if(sprite.mask.data[source]){pixels[i]=sprite.pixels[source];data[i]=pixels[i]>>>24?1:0;}
  }
  return {x,y,w,h,pixels,mask:{w,h,data}};
}

/** Encode native cells for portable JSON assets. Packed colors are normalized to unsigned values. */
export function encodeSpritePixels2D(pixels: ArrayLike<number>): number[] {
  const runs:number[]=[];let color=-1,count=0;
  for(let i=0;i<pixels.length;i++){const next=pixels[i]>>>0;if(next===color)count++;else{if(count)runs.push(count,color);color=next;count=1;}}
  if(count)runs.push(count,color);return runs;
}

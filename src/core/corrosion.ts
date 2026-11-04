import { clamp, rand, smooth } from './math.js';
import { defineImpactContact2D, impactContactAge2D, type ImpactContact2D } from './impact-contact.js';

export interface CorrosionTarget2D {
  readonly x: number; readonly y: number;
  readonly mask: { readonly w: number; readonly h: number; readonly data: ArrayLike<number> };
}
export interface CorrosionOptions2D {
  seed?: number;
  /** Art-directed travel distance in projected surface pixels, not a chemical parameter. */
  reach?: number; spreadSpeed?: number; wetFor?: number; dryFor?: number;
  /** Projected runoff direction. A zero vector produces unbiased spreading. */
  flow?: readonly [number, number];
}
export interface CorrosionCell2D {
  readonly x: number; readonly y: number; readonly edge: boolean;
  readonly distance: number; readonly startsAt: number; readonly dose: number; readonly pit: number;
}
export interface CorrosionSample2D {
  readonly wet: number; readonly etch: number; readonly active: boolean;
}
export interface CorrosionField2D {
  readonly contact: ImpactContact2D; readonly cells: readonly CorrosionCell2D[];
  readonly driesAt: number;
  sample(index: number, time: number): CorrosionSample2D;
}

/** Contact-seeded, mask-confined wetting and persistent surface change. This is a stylized VFX
 * schedule, not chemistry, physical dissolution, mesh damage or gameplay logic. An eight-neighbour
 * path with no diagonal corner-cutting keeps fluid from teleporting across holes or reaching disconnected target islands.
 * Sampling is pure; source masks/contacts are snapshotted and never mutated. */
export function surfaceCorrosion2D(input: ImpactContact2D, target: CorrosionTarget2D,
  options: CorrosionOptions2D = {}): CorrosionField2D {
  const contact = defineImpactContact2D(input), { x, y, mask } = target;
  const { seed = 1, reach = 44, spreadSpeed = 70, wetFor = 1.1, dryFor = .6, flow = [0, 1] } = options;
  if (![x,y,mask.w,mask.h,seed,reach,spreadSpeed,wetFor,dryFor].every(Number.isFinite)
    || !Number.isInteger(mask.w) || !Number.isInteger(mask.h) || mask.w<1 || mask.h<1 || mask.w>512 || mask.h>512
    || mask.data.length!==mask.w*mask.h || Math.abs(x)>1e6 || Math.abs(y)>1e6 || reach<=0 || reach>2048
    || spreadSpeed<=0 || spreadSpeed>1e5 || wetFor<=0 || wetFor>30 || dryFor<=0 || dryFor>30
    || !Array.isArray(flow) || flow.length!==2 || !flow.every(Number.isFinite))
    throw new RangeError('Corrosion needs a complete 1..512 mask, finite placement/flow and positive bounded timing');
  const n=mask.w*mask.h, occupied=new Uint8Array(n), distances=new Float64Array(n).fill(Infinity);
  let root=-1, nearest=Infinity;
  for(let i=0;i<n;i++) {
    if(!Number.isFinite(mask.data[i]))throw new RangeError('Corrosion mask values must be finite');
    if(mask.data[i]<=0)continue;occupied[i]=1;
    const d=(x+i%mask.w-contact.position[0])**2+(y+Math.floor(i/mask.w)-contact.position[1])**2;
    if(d<nearest){root=i;nearest=d;}
  }
  if(root<0||nearest>2.25)throw new RangeError('Corrosion contact must touch an occupied surface pixel');
  const fl=Math.hypot(...flow);
  if(!Number.isFinite(fl))throw new RangeError('Corrosion flow length must be finite');
  const fx=fl>0?flow[0]/fl:0,fy=fl>0?flow[1]/fl:0;
  // Bounded binary-heap Dijkstra. Each visited cell is connected to the actual contact pixel.
  const heap:{i:number;d:number}[]=[];
  const push=(i:number,d:number)=>{const item={i,d};let at=heap.length;heap.push(item);while(at>0){const p=(at-1)>>1;if(heap[p].d<=d)break;heap[at]=heap[p];at=p;}heap[at]=item;};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let at=0;while(at*2+1<heap.length){let c=at*2+1;if(c+1<heap.length&&heap[c+1].d<heap[c].d)c++;if(heap[c].d>=last.d)break;heap[at]=heap[c];at=c;}heap[at]=last;}return first;};
  distances[root]=0;push(root,0);
  while(heap.length){const q=pop();if(q.d!==distances[q.i])continue;
    const ix=q.i%mask.w,iy=Math.floor(q.i/mask.w);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){
      const xx=ix+dx,yy=iy+dy;if(xx<0||yy<0||xx>=mask.w||yy>=mask.h)continue;
      const j=yy*mask.w+xx;if(!occupied[j])continue;
      if(dx&&dy&&(!occupied[iy*mask.w+xx]||!occupied[yy*mask.w+ix]))continue;
      const roughness=.92+.16*rand(Math.floor(xx/5),Math.floor(yy/5),seed+137);
      const cost=(Math.hypot(dx,dy)-.42*(dx*fx+dy*fy))*roughness,d=q.d+cost;if(d>reach||d>=distances[j])continue;
      distances[j]=d;push(j,d);
    }
  }
  const inside=(i:number,j:number)=>i>=0&&j>=0&&i<mask.w&&j<mask.h&&!!occupied[j*mask.w+i];
  const cells:CorrosionCell2D[]=[];
  for(let i=0;i<n;i++)if(Number.isFinite(distances[i])){
    const ix=i%mask.w,iy=Math.floor(i/mask.w),distance=distances[i],dose=clamp(1-distance/reach);
    // Coarse clusters avoid a television-static surface; fine noise changes only pit rims.
    const cluster=rand(Math.floor(ix/3),Math.floor(iy/3),seed),pit=cluster>.50?clamp((cluster-.48)*2.2):0;
    cells.push(Object.freeze({x:x+ix,y:y+iy,distance,startsAt:contact.at+distance/spreadSpeed,dose,
      edge:!inside(ix-1,iy)||!inside(ix+1,iy)||!inside(ix,iy-1)||!inside(ix,iy+1),pit}));
  }
  return Object.freeze({contact,cells:Object.freeze(cells),driesAt:contact.at+reach/spreadSpeed+wetFor+dryFor,
    sample(index:number,time:number):CorrosionSample2D {
      if(!Number.isInteger(index)||index<0||index>=cells.length||!Number.isFinite(time))throw new RangeError('Corrosion sample needs a valid cell and finite time');
      const c=cells[index],age=time-c.startsAt;
      if(impactContactAge2D(contact,time)<0||age<0)return Object.freeze({wet:0,etch:0,active:false});
      const wet=smooth(0,.055,age)*(1-smooth(wetFor,wetFor+dryFor,age))*c.dose;
      const etch=smooth(.12,wetFor+.15,age)*c.dose*(.24+.76*c.pit)*clamp(contact.strength,0,2);
      return Object.freeze({wet,etch:clamp(etch),active:wet>.02});
    }});
}

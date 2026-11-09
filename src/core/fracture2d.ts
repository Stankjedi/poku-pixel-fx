/** Reusable seeded convex fracture and seekable rigid chips. Authored breakup, not a stress solver. */
import { fit } from './color.js';
import { clamp, rng, smooth } from './math.js';
import { fly, flyV } from './particles.js';
import type { Painter, Point } from './painter.js';

export interface FractureOptions2D {
  /** Strictly convex local silhouette, 3..32 vertices, coordinates within +/-512 native pixels. */
  polygon: readonly (readonly [number, number])[];
  palette: readonly (string | number)[]; // dark to light; no implicit glow
  count?: number; seed?: number; release?: number;
  life?: readonly [number, number]; speed?: readonly [number, number];
  impulse?: readonly [number, number]; gravity?: number; drag?: number;
}
export interface FracturePiece2D {
  readonly id: number; readonly area: number; readonly center: readonly [number, number];
  readonly vertices: readonly (readonly [number, number])[];
  readonly velocity: readonly [number, number]; readonly spin: number; readonly life: number;
}
export interface FractureSample2D {
  id: number; age: number; position: Point; velocity: Point; angle: number; opacity: number; points: Point[];
}
const cross=(a:readonly number[],b:readonly number[],c:readonly number[]) => (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
function measure(poly:readonly (readonly number[])[]) {
  let a=0,x=0,y=0;
  const [ox,oy]=poly[0]??[0,0];
  // Local coordinates avoid catastrophic cancellation for small translated shapes/cells.
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],px=p[0]-ox,py=p[1]-oy,qx=q[0]-ox,qy=q[1]-oy,v=px*qy-qx*py;
    a+=v;x+=(px+qx)*v;y+=(py+qy)*v;
  }
  return {area:a/2,center:[ox+x/(3*a),oy+y/(3*a)] as Point};
}
function clip(poly:Point[],nx:number,ny:number,limit:number,origin:Point):Point[]{
  const out:Point[]=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=(a[0]-origin[0])*nx+(a[1]-origin[1])*ny-limit,
      db=(b[0]-origin[0])*nx+(b[1]-origin[1])*ny-limit;
    if(da<=0)out.push(a);
    if((da<0&&db>0)||(da>0&&db<0)){const u=da/(da-db);out.push([a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u]);}
  }
  return out;
}
export function createFracture2D(options:FractureOptions2D){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new RangeError('Invalid fracture options');
  const {count=18,seed=1,release=0,gravity=145,drag=.4}=options;
  if(!Number.isInteger(count)||count<2||count>64||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff
    ||![release,gravity,drag].every(Number.isFinite)||drag<0)throw new RangeError('Invalid fracture count/seed/motion');
  const point=(p:readonly number[],label:string):Point=>{
    if(!Array.isArray(p)||p.length!==2||![p[0],p[1]].every(Number.isFinite))throw new RangeError(`Invalid fracture ${label}`);
    return[p[0],p[1]];
  };
  const range=(p:readonly number[],label:string,positive=false):Point=>{const v=point(p,label);if(v[0]<(positive?Number.MIN_VALUE:0)||v[1]<v[0])throw new RangeError(`Invalid fracture ${label}`);return v;};
  const life=range(options.life===undefined?[.75,1.15]:options.life,'life',true),speed=range(options.speed===undefined?[28,48]:options.speed,'speed');
  const impulse=point(options.impulse===undefined?[0,-50]:options.impulse,'impulse');
  if(!Array.isArray(options.polygon)||options.polygon.length<3||options.polygon.length>32)throw new RangeError('Fracture polygon needs 3..32 vertices');
  let polygon=Array.from(options.polygon,p=>point(p,'vertex'));
  if(polygon.some(p=>p.some(v=>Math.abs(v)>512)))throw new RangeError('Fracture polygon exceeds local 512px bounds');
  let whole=measure(polygon);
  if(!Number.isFinite(whole.area)||Math.abs(whole.area)<1e-4)throw new RangeError('Fracture polygon has no usable area');
  if(whole.area<0){polygon.reverse();whole=measure(polygon);}
  // All other vertices must lie inside every edge. Local turns alone also accept star polygons.
  if(polygon.some((p,i)=>polygon.some((q,j)=>j!==i&&j!==(i+1)%polygon.length
    &&cross(p,polygon[(i+1)%polygon.length],q)<=1e-8)))
    throw new RangeError('Fracture polygon must be strictly convex');
  if(!Array.isArray(options.palette)||!options.palette.length||options.palette.length>32||Array.from(options.palette).some(c=>typeof c==='number'
    ?!Number.isInteger(c)||c< -0x80000000||c>0xffffffff:typeof c!=='string'||!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))throw new RangeError('Invalid fracture palette');
  const C=fit([...options.palette],7),r=rng(seed,4421),sites:Point[]=[[...whole.center]];
  const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const spacing=Math.min(maxX-minX,maxY-minY)*.025;
  for(let attempt=0;sites.length<count&&attempt<10000;attempt++){
    const q:Point=[r.range(minX,maxX),r.range(minY,maxY)];
    if(polygon.some((p,i)=>cross(p,polygon[(i+1)%polygon.length],q)<0)||sites.some(p=>Math.hypot(p[0]-q[0],p[1]-q[1])<spacing))continue;
    sites.push(q);
  }
  if(sites.length!==count)throw new RangeError('Fracture polygon is too thin for the requested cells');
  const pieces:FracturePiece2D[]=sites.map((site,id)=>{
    let cell=polygon.map(p=>[...p] as Point);
    for(let j=0;j<sites.length;j++)if(j!==id){const other=sites[j],nx=other[0]-site[0],ny=other[1]-site[1];cell=clip(cell,nx,ny,(nx*nx+ny*ny)/2,site);}
    const {area,center}=measure(cell),g=rng(seed,id,4499),dx=center[0]-whole.center[0],dy=center[1]-whole.center[1],len=Math.hypot(dx,dy);
    const angle=len>1e-6?Math.atan2(dy,dx):g.range(0,Math.PI*2),massScale=clamp(Math.sqrt(whole.area/count/area),.7,1.45),kick=g.range(...speed)*massScale;
    const velocity:Point=[Math.cos(angle)*kick+impulse[0],Math.sin(angle)*kick+impulse[1]],lifetime=g.range(...life);
    if(!Number.isFinite(area)||area<=0||!velocity.every(Number.isFinite)||!Number.isFinite(release+lifetime)||!(release+lifetime>release))throw new RangeError('Unrepresentable fracture cell/motion/lifetime');
    return Object.freeze({id,area,center:Object.freeze(center),vertices:Object.freeze(cell.map(p=>Object.freeze([p[0]-center[0],p[1]-center[1]] as Point))),
      velocity:Object.freeze(velocity),spin:g.range(-5,5),life:lifetime});
  });
  const end=release+Math.max(...pieces.map(p=>p.life));
  function sample(time:number):FractureSample2D[]{
    if(!Number.isFinite(time))throw new RangeError('Fracture sample time must be finite');
    if(time>=end)return[];
    const age=Math.max(0,time-release);
    return pieces.flatMap(p=>{
      if(time>=release+p.life)return[];
      const position=fly(...p.center,...p.velocity,age,gravity,drag),velocity=age===0&&time<release?[0,0] as Point:flyV(...p.velocity,age,gravity,drag),angle=p.spin*age;
      if(![...position,...velocity,angle].every(Number.isFinite))throw new RangeError('Fracture motion overflow');
      const cs=Math.cos(angle),sn=Math.sin(angle),points=p.vertices.map(([x,y]):Point=>[position[0]+cs*x-sn*y,position[1]+sn*x+cs*y]);
      return[{id:p.id,age,position,velocity,angle,opacity:1-smooth(.65,1,age/p.life),points}];
    });
  }
  return Object.freeze({release,end,area:whole.area,pieces:Object.freeze(pieces),sample,
    /** Draws faceted rigid matter only. Highlight direction is fixed in the local drawing space.
     * cracks reveals original cell boundaries before release; it is not simulated crack propagation. */
    draw(p:Pick<Painter,'poly'|'line'>,time:number,{opacity=1,cracks=0}:{opacity?:number;cracks?:number}={}){
      if(![opacity,cracks].every(Number.isFinite)||opacity<0||opacity>1||cracks<0||cracks>1)throw new RangeError('Invalid fracture draw controls');
      for(const q of sample(time)){
        const a=q.opacity*opacity;if(a<=0)continue;
        p.poly(q.points,C[2],a);
        for(let i=0;i<q.points.length;i++){
          const v=q.points[i],w=q.points[(i+1)%q.points.length],dx=w[0]-v[0],dy=w[1]-v[1],length=Math.hypot(dx,dy)||1;
          const facing=(dy*-.6+(-dx)*-.8)/length;
          const tone=facing>.6?5:facing>-.15?4:2;
          p.poly([q.position,v,w],C[tone],a);
          // Keep material shading continuous across release. Seams belong to the actual cells.
          if(facing>.55)p.line(v[0],v[1],w[0],w[1],C[6],a*.65);
          if(cracks>0)p.line(v[0],v[1],w[0],w[1],C[1],a*cracks*.55);
        }
      }
    },
  });
}

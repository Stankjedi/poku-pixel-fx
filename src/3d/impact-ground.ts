/** Matching contact-ground wedges: the same closed meshes become heavy ejecta. */
import { type Vec3, Rng3D, TAU3, add3, sub3, mul3, cross3, dot3, smooth3 } from "./math.js";
import { type FragmentMesh3D } from "./fragments.js";
import { type Color3D } from "./frame.js";
import { Painter3D } from "./painter.js";
export interface ImpactGroundPiece3D {mesh:FragmentMesh3D;center:Vec3;angle:number;release:number;speed:number;spin:Vec3}
export interface ImpactGround3D {pieces:ImpactGroundPiece3D[];rim:Vec3[];floor:Vec3[];size:number}
/** Twelve shared-boundary ground slabs; unlike arbitrary debris, their pre-breakup seam is coherent. */
export function createImpactGround3D(seed=1,size=1):ImpactGround3D {
  if(!Number.isFinite(size)||size<=0) throw new RangeError("ground size must be finite and positive");
  const rng=new Rng3D(seed),n=12,ring:Vec3[]=[],inner:Vec3[]=[],pieces:ImpactGroundPiece3D[]=[];
  for(let i=0;i<n;i++) {const a=i/n*TAU3,r=rng.range(1.45,1.95)*size;ring.push([Math.cos(a)*r,rng.range(0.19,0.48)*size,Math.sin(a)*r]);inner.push([Math.cos(a)*0.52*size,0.15*size,Math.sin(a)*0.52*size]);}
  for(let i=0;i<n;i++) {
    const j=(i+1)%n,world:Vec3[]=[inner[i],inner[j],ring[j],ring[i],...([inner[i],inner[j],ring[j],ring[i]].map(v=>[v[0],0.025,v[2]] as Vec3))];
    const center=mul3(world.reduce((a,b)=>add3(a,b),[0,0,0] as Vec3),1/8),vertices=world.map(v=>sub3(v,center));
    const faces:[number,number,number][]=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];
    for(const f of faces) if(dot3(cross3(sub3(vertices[f[1]],vertices[f[0]]),sub3(vertices[f[2]],vertices[f[0]])),vertices[f[0]])<0) [f[1],f[2]]=[f[2],f[1]];
    pieces.push({mesh:{vertices,faces},center,angle:(i+0.5)/n*TAU3,release:0.055+rng.range(0,0.08),speed:rng.range(0.8,1.25),spin:[rng.range(-2.5,2.5),rng.range(-1.8,1.8),rng.range(-2.5,2.5)]});
  }
  return {pieces,rim:ring,floor:inner.map(v=>[v[0],0.035,v[2]]),size};
}
/** Raised fractured lip, dark inner walls and a recessed floor remain after slabs leave. */
export function drawImpactCrater3D(p:Painter3D,ground:ImpactGround3D,age:number,palette:readonly Color3D[],heat:readonly Color3D[],opacity=1) {
  if(age<0||opacity<=0||palette.length===0||heat.length===0) return;
  const reveal=smooth3(0.025,0.18,age),hot=1-smooth3(0.18,1.35,age),n=ground.rim.length;
  const wall=[palette[0],palette[0],palette[1]??palette[0],palette[2]??palette[0]];
  for(let i=0;i<n;i++) {
    const j=(i+1)%n,a=ground.floor[i],b=ground.floor[j];
    const edge=(k:number):Vec3=>{const r=ground.rim[k];return[r[0],r[1]*(0.65+reveal*0.6),r[2]];};
    const c=edge(i),d=edge(j),outer=(v:Vec3):Vec3=>[v[0]*(1.13+0.12*Math.sin(i*2.7)),0.04,v[2]*(1.13+0.12*Math.sin(i*2.7))];
    p.triangle([0,0.035,0],a,b,palette[0],opacity);
    p.facet(a,b,d,wall,opacity);p.facet(a,d,c,wall,opacity);
    p.facet(c,d,outer(d),palette,opacity);p.facet(c,outer(d),outer(c),palette,opacity);
    if(hot>0) {
      const hi=heat[Math.min(heat.length-1,2)];
      p.line(add3(a,[0,0.008,0]),add3(c,[0,0.008,0]),0.025*ground.size,hi,opacity*hot,0.07*hot);
      if(i%2===0)p.line(a,b,0.034*ground.size,heat[heat.length-2]??hi,opacity*hot,0.1*hot);
    }
  }
}

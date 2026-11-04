/** A connected terrain response: a shallow crest followed by a smaller settling trough. */
import { type Vec3, Rng3D, clamp3, smooth3, cross3, sub3, norm3, dot3 } from "./math.js";
import { type Color3D } from "./frame.js";
import { Painter3D } from "./painter.js";

/** World-space displacement, centered on contact. Zero before contact and after settling. */
export function impactGroundHeight3D(radius:number,age:number,size=1,strength=1):number {
  if(![radius,age,size,strength].every(Number.isFinite)||radius<0||size<=0||age<=0||age>=1.25||strength<=0)return 0;
  const r=radius/size,front=0.8+7.4*age,q=(r-front)/0.62;
  const crest=Math.exp(-q*q*1.5),trough=Math.exp(-((q+1.15)**2)*2.2);
  const envelope=smooth3(0,0.07,age)*(1-smooth3(0.68,1.25,age))*smooth3(0.8,1.65,r)*(1-smooth3(4.3,5.0,r));
  return (0.38*crest-0.045*trough)*size*clamp3(strength,0,1.5)*envelope;
}
export interface ImpactTerrain3D {vertices:Vec3[];faces:[number,number,number][];tones:number[];size:number;marks:readonly [number,number][]}
/** Shared vertices keep the floor continuous while the same wave moves through it. */
export function createImpactTerrain3D(seed=1,size=1):ImpactTerrain3D {
  if(!Number.isFinite(size)||size<=0)throw new RangeError("terrain size must be finite and positive");
  const rng=new Rng3D(seed),vertices:Vec3[]=[],faces:[number,number,number][]=[],tones:number[]=[],marks:[number,number][]=[];
  const n=32,step=11.4/n;
  for(let z=0;z<=n;z++)for(let x=0;x<=n;x++) {
    const px=(x-n/2)*step,pz=(z-n/2)*step;
    vertices.push([(px+rng.range(-0.04,0.04))*size,0.025*size,(pz+rng.range(-0.04,0.04))*size]);
  }
  for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
    const a=z*(n+1)+x,b=a+1,c=a+n+1,d=c+1,at=vertices[a];
    if(Math.hypot(at[0],at[2])>5.65*size)continue;
    const tone=rng.range(-0.028,0.028);
    faces.push([a,c,b],[b,c,d]);tones.push(tone,tone*0.7);
    if((x%3===0&&z%2===0)||(z%3===0&&x%2===0))marks.push([a,x%3===0?c:b]);
  }
  return {vertices,faces,tones,size,marks};
}
/** Subdued floor, broken bedding and normal changes make the wave visible without a magic ring. */
export function drawImpactTerrain3D(p:Painter3D,terrain:ImpactTerrain3D,age:number,palette:readonly Color3D[],opacity=1,strength=1) {
  if(opacity<=0||!Number.isFinite(age)||palette.length===0)return;
  const {size}=terrain,light=norm3([0.6,1,-0.45]);
  const verts=terrain.vertices.map(v=>[v[0],v[1]+impactGroundHeight3D(Math.hypot(v[0],v[2]),age,size,strength),v[2]] as Vec3);
  for(let i=0;i<terrain.faces.length;i++) {
    const [a,b,c]=terrain.faces[i],v=verts[a],w=verts[b],u=verts[c];
    const radius=(Math.hypot(v[0],v[2])+Math.hypot(w[0],w[2])+Math.hypot(u[0],u[2]))/(3*size);
    if(Math.max(Math.hypot(v[0],v[2]),Math.hypot(w[0],w[2]),Math.hypot(u[0],u[2]))>5.0*size)continue;
    if(age>=0&&radius<1.35)continue; // The actual crater owns its recessed floor after contact.
    const edge=1-smooth3(4.25,4.95,radius),normal=norm3(cross3(sub3(w,v),sub3(u,v)));
    const shade=clamp3(0.25+dot3(normal,light)*0.46+terrain.tones[i]);
    p.triangle(v,w,u,palette[Math.round(shade*(palette.length-1))],edge*opacity);
  }
  for(const [a,b] of terrain.marks) {
    const v=verts[a],w=verts[b],r=Math.hypot(v[0],v[2])/size;
    if(r<1.7||r>4.8)continue;
    const up=(q:Vec3):Vec3=>[q[0],q[1]+0.006*size,q[2]];
    p.line(up(v),up(w),0.014*size,palette[0],opacity*0.35*(1-smooth3(4.2,4.8,r)));
  }
}

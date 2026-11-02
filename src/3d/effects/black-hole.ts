/**
 * POKU Black Hole 3D — cinematic pixel-art VFX.
 *
 * Geometry and time are procedural, never a textured card or animated still.
 * World-space inclined accretion disk is intersected with orthographic view rays;
 * an actual depth-tested horizon, faceted 3D rock fragments and orbital trails
 * maintain parallax when the camera orbits. The emissive scene uses pixel palette
 * quantization, controlled Bayer dithering and an independent blurred light field.
 * Artistic photon bending is a screen-space approximation, NOT general relativity.
 */
import type { EffectMeta3D } from "../fx.js";
import type { Color3D, Frame3D } from "../frame.js";
import { color3D } from "../frame.js";
import { type Vec3, Rng3D, clamp3, smooth3, TAU3 } from "../math.js";
import { Painter3D } from "../painter.js";

export interface BlackHole3DOptions {
  seed: number;
  radius: number;
  reach: number;
  intensity: number;
  palette: Color3D[];
}

export const meta: EffectMeta3D<BlackHole3DOptions> = {
  id: "shadow/black-hole-3d",
  name: "Black Hole 3D — Cinematic",
  description: "A true 3D black-hole vortex with a depth-tested shadow, turbulent lensed accretion disk, spiralling stellar plasma, and solid captured debris.",
  duration: 7,
  loop: false,
  options: {
    seed: 4318, radius: 1.25, reach: 6.9, intensity: 1,
    palette: [
      "#05030c", "#130827", "#270d4d", "#441477", "#7121ae", "#ab30df",
      "#df55f1", "#ff8df5", "#ffd0fa", "#65d8ff", "#fff5fd",
    ],
  },
  stages: [
    {at: 0, label: "CONDENSE"},
    {at: 0.6, label: "SINGULARITY"},
    {at: 1.3, label: "ACCRETION"},
    {at: 4.3, label: "INSPIRAL"},
    {at: 5.4, label: "COLLAPSE"},
    {at: 6.3, label: "EVAPORATE"},
  ],
  cues: [
    {at: 0.63, type: "flash", value: 0.8},
    {at: 0.71, type: "shake", value: 0.2},
    {at: 1.1, type: "sound", value: 1},
    {at: 5.52, type: "shake", value: 0.22},
    {at: 6.05, type: "flash", value: 0.36},
  ],
};

const CY = 2.1;
const TAU = TAU3;
const clamp = clamp3;
const sat = (n: number) => clamp(n, 0, 1);
const smooth = smooth3;
const fract = (n: number) => n - Math.floor(n);
const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const hash = (a: number, b: number, seed: number) => {
  let n = Math.imul(a|0, 374761393) + Math.imul(b|0, 668265263) + Math.imul(seed|0, 1274126177);
  n = Math.imul(n ^ (n>>>13), 1274126177);
  return ((n ^ (n>>>16)) >>> 0) / 4294967296;
};
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x-ix, fy = y-iy;
  const a = fx*fx*(3-2*fx), b=fy*fy*(3-2*fy);
  const n0=hash(ix,iy,seed), n1=hash(ix+1,iy,seed);
  const n2=hash(ix,iy+1,seed), n3=hash(ix+1,iy+1,seed);
  return (n0+(n1-n0)*a)*(1-b)+(n2+(n3-n2)*a)*b;
}
const rgb = (r: number, g: number, b: number) =>
  (0xff000000 | (clamp(b,0,255)<<16) | (clamp(g,0,255)<<8) | clamp(r,0,255)) >>> 0;
const ch = (col: number, shift: number) => (col>>>shift)&255;
function mixColor(a:number,b:number,amount:number) {
  const x=sat(amount), y=1-x;
  return rgb(ch(a,0)*y+ch(b,0)*x, ch(a,8)*y+ch(b,8)*x, ch(a,16)*y+ch(b,16)*x);
}
function paletteAt(pal:readonly number[],q:number,dither:number) {
  const u=clamp(q,0,0.9999)*(pal.length-1), a=Math.floor(u);
  return pal[Math.min(pal.length-1, a+(fract(u)>dither?1:0))];
}

interface Rock { a:number; radius:number; phase:number; fall:number; y:number; scale:number; spin:number; tilt:number; bright:number; }
interface Spark { a:number; r:number; phase:number; speed:number; fall:number; y:number; size:number; c:number; }
interface Star { x:number; y:number; z:number; mag:number; tw:number; color:number; }

/** Depth-tested low-poly basalt fragment, with faceted rims and thin hot fissures. */
function rock(p:Painter3D, center:Vec3, size:number, rotation:number, pal:readonly Color3D[], glow:number, detail:number) {
  const points: Vec3[]=[];
  for(let j=0;j<7;j++) {
    const a=rotation+j*TAU/7;
    const r=size*(0.78+0.24*Math.cos(j*7.91+detail));
    points.push([center[0]+Math.cos(a)*r,center[1]+size*0.29*Math.sin(j*2.4+detail),center[2]+Math.sin(a)*r]);
  }
  const cap:Vec3=[center[0]+size*.29*Math.cos(rotation*1.8),center[1]+size*.9,center[2]+size*.2];
  const base:Vec3=[center[0]-size*.25,center[1]-size*.7,center[2]+size*.15];
  const ramp=[pal[0],pal[1],pal[2],pal[3],pal[4],pal[6]];
  for(let i=0;i<points.length;i++) {
    p.facet(points[i],points[(i+1)%7],cap,ramp);
    p.facet(points[(i+1)%7],points[i],base,ramp);
  }
  if(glow>.05) {
    // Basalt silhouette edging and staggered luminous fracture on the lit face.
    for (let j=0;j<7;j++) p.line(points[j],points[(j+1)%7],.010,pal[0],.86);
    p.line(points[0],cap,.020,pal[8],glow*.94,glow*.26);
    p.line(points[2],points[3],.014,pal[7],glow*.68,glow*.13);
    if(size>.3){
      const midpoint:Vec3=[(points[1][0]+cap[0])*.5,(points[1][1]+cap[1])*.5,(points[1][2]+cap[2])*.5];
      p.line(points[1],midpoint,.015,pal[6],glow*.78,glow*.12);
      p.line(midpoint,points[3],.01,pal[9],glow*.36,glow*.08);
      p.line(points[4],cap,.014,pal[9],glow*.30,glow*.11);
    }
  }
}

/** A cheap two-pass bloom with a reusable scratch arena.
 * Optical bloom changes light, not the sharp color-buffer silhouette. */
function makeBloom() {
  let w=0,h=0,hr=new Float32Array(0),hg=new Float32Array(0),hb=new Float32Array(0);
  const mix = (n:number) => Math.min(255,Math.max(0,n))|0;
  return (frame:Frame3D,cx:number,cy:number,voidRadius:number,level:number) => {
    if(level<=0)return;
    const W=frame.w,H=frame.h,N=W*H,L=frame.light;
    if(W!==w||H!==h){w=W;h=H;hr=new Float32Array(N);hg=new Float32Array(N);hb=new Float32Array(N);}
    const radius=5;
    // Sliding horizontal box filter.
    for(let y=0;y<H;y++) {
      const o=y*W;
      let sr=0,sg=0,sb=0;
      for(let dx=-radius;dx<=radius;dx++) {
        const c=L[o+Math.min(W-1,Math.max(0,dx))];
        sr+=c&255;sg+=(c>>>8)&255;sb+=(c>>>16)&255;
      }
      for(let x=0;x<W;x++) {
        const i=o+x;
        hr[i]=sr/(radius*2+1); hg[i]=sg/(radius*2+1); hb[i]=sb/(radius*2+1);
        const a=L[o+Math.min(W-1,x+radius+1)], b=L[o+Math.max(0,x-radius)];
        sr+=(a&255)-(b&255);
        sg+=((a>>>8)&255)-((b>>>8)&255);
        sb+=((a>>>16)&255)-((b>>>16)&255);
      }
    }
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
      const i=y*W+x;
      let sr=0,sg=0,sb=0;
      for(let dy=-radius;dy<=radius;dy++) {
        const j=Math.min(H-1,Math.max(0,y+dy))*W+x;
        sr+=hr[j];sg+=hg[j];sb+=hb[j];
      }
      const normal=1/(radius*2+1);
      const l=L[i];
      const r0=mix((l&255)+sr*normal*level),g0=mix(((l>>>8)&255)+sg*normal*level),b0=mix(((l>>>16)&255)+sb*normal*level);
      if((x+.5-cx)**2+(y+.5-cy)**2 < voidRadius*voidRadius*.87) {L[i]=0;continue;}
      // The tiny, quantized glow floor preserves luminous material without blurring the pixel art itself.
      L[i]=(0xff000000|(b0<<16)|(g0<<8)|r0)>>>0;
    }
  };
}

/** 3D inclined accretion plane Y-CY=.29 X-.17 Z. */
function planeCamera(camera:Painter3D) {
  const {yaw,elevation}=camera.camera;
  const cs=Math.cos(yaw),ss=Math.sin(yaw),ce=Math.cos(elevation),se=Math.sin(elevation);
  const right:Vec3=[cs,0,-ss],up:Vec3=[-ss*se,ce,-cs*se],front:Vec3=[ss*ce,se,cs*ce];
  const n:Vec3=[-.16,1,.10],dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  return {right,up,front,ndotRight:dot(n,right),ndotUp:dot(n,up),ndotFront:dot(n,front)};
}

export function create(options:BlackHole3DOptions) {
  const rng=new Rng3D(options.seed);
  const R=Math.max(.5,options.radius),reach=Math.max(R*3,options.reach),intensity=clamp(options.intensity,.2,2);
  const inputColors=(options.palette.length?options.palette:meta.options.palette).map(color3D);
  // Match the 2D engine's variable-length ramp contract with 11 palette steps.
  const PAL=Array.from({length:11},(_,i)=>{
    const u=i/10*(inputColors.length-1),a=Math.floor(u);
    return mixColor(inputColors[a],inputColors[Math.min(inputColors.length-1,a+1)],fract(u));
  });
  const rocks:Rock[]=[], sparks:Spark[]=[], stars:Star[]=[];
  for(let i=0;i<92;i++) rocks.push({
    a:rng.range(0,TAU), radius:rng.range(R*2.45,reach*1.34), phase:rng.range(0,TAU),
    fall:rng.range(.10,.35),y:rng.range(-.8,.8),scale:rng.range(.065,.23)*(i%19===0?2.7:1),
    spin:rng.range(-3,3),tilt:rng.range(.15,.65),bright:rng.range(.35,1),
  });
  // Four asymmetrical hero fragments add large, legible depth cues.
  for(const [a,r,y,size] of [[2.9,6.8,-.6,1.25],[.15,6.2,1.8,1.12],[4.5,7.2,-.9,1.07],[5.55,5.4,1.3,.86]])
    rocks.push({a,radius:r,phase:rng.range(0,TAU),fall:.037,y,scale:size,spin:rng.range(-1,1),tilt:.5,bright:.9});
  for(let i=0;i<320;i++) sparks.push({
    a:rng.range(0,TAU),r:rng.range(R*1.8,reach*1.25),phase:rng.range(0,TAU),
    speed:rng.range(.36,1.7),fall:rng.range(.02,.23),y:rng.range(-.6,.6),
    size:rng.range(.009,.045),c:rng.int(0,3),
  });
  for(let i=0;i<180;i++) stars.push({
    x:rng.range(-12,12),y:rng.range(-7,8),z:rng.range(-4,-13),
    mag:rng.range(.012,.075),tw:rng.range(0,TAU),color:rng.int(0,4),
  });
  const bloom=makeBloom();
  let time=0;
  return {
    update(dt:number){time+=dt;},
    draw(p:Painter3D){
      if(time>=meta.duration)return;
      const t=time, phase=TAU*t/meta.duration;
      const growth=smooth(.08,1.08,t), fade=1-smooth(5.95,7,t);
      const power=growth*fade*intensity;
      if(power<=.001)return;
      const shrink=1-.75*smooth(5.5,6.9,t);
      const radius=R*(.18+.82*smooth(.07,1,t))*shrink;
      const center=p.project([0,CY,0]);
      const sx=center.x,sy=center.y,scale=center.scale,cr=radius*scale;
      const frame=p.frame,w=frame.w,h=frame.h,colors=frame.color,lights=frame.light,depth=frame.depth;
      const camera=planeCamera(p),a=camera.right,b=camera.up,c=camera.front;
      const nR=camera.ndotRight,nU=camera.ndotUp,nF=camera.ndotFront;
      const base=color3D('#05030e');
      const black=color3D('#010008');
      const nseed=options.seed;
      const tDrive=t*1.83;
      const cosPhase=Math.cos(phase)*.32,sinPhase=Math.sin(phase)*.32;
      const cosTurb=Math.cos(phase)*.36,sinTurb=Math.sin(phase)*.36;
      const maxDist=reach*1.6;
      const ditherScale=1/16;
      const minX=Math.max(0,Math.floor(sx-maxDist*scale));
      const maxX=Math.min(w-1,Math.ceil(sx+maxDist*scale));
      const minY=Math.max(0,Math.floor(sy-maxDist*scale));
      const maxY=Math.min(h-1,Math.ceil(sy+maxDist*scale));
      // Per-pixel artistic ray sampling: real 3D disk intersection, 3D depth ordering.
      for(let y=minY;y<=maxY;y++){
        const v=(sy-y-.5)/scale;
        for(let x=minX;x<=maxX;x++){
          const u=(x+.5-sx)/scale,rr=Math.hypot(u,v);
          if(rr>maxDist)continue;
          const i=y*w+x,ang=Math.atan2(v,u),bayer=(BAYER[((y&3)<<2)|(x&3)]+.5)*ditherScale;
          let surface=colors[i]||base;
          let emit=0,dep=-Infinity;
          // Semi-transparent multi-octave spiral nebulae behind the accretion plane.
          if(rr>radius*1.15 && rr<reach*1.62) {
            const logR=Math.log(rr+.31);
            const theta=ang-1.25*logR-.13*tDrive;
            const n=noise(u*.74+cosPhase,v*.74+sinPhase,nseed);
            const n2=noise(u*2.1-.35*t,v*2.1+.13*t,nseed+19);
            const cloudy=Math.pow(Math.max(0,Math.cos(2*theta+n*.94)),4);
            const innerCloud=Math.pow(Math.max(0,Math.cos(4*(theta+.22)+n2*.6)),10);
            const silhouette=smooth(radius*1.8,radius*2.9,rr)*(1-smooth(reach*1.23,reach*1.57,rr));
            const grain=(.76+.58*n+.38*(n2-.5));
            const plasma=sat((cloudy*.45+innerCloud*.18)*grain*silhouette)*power;
            if(plasma>.018) {
              const col=paletteAt(PAL,.12+plasma*.50+(n2-.5)*.05,bayer);
              surface=mixColor(surface,col,plasma*.70);
              emit+=plasma*9;
            }
            // Fine outer ion ribbons: narrow cyan/magenta strokes inside rotating smoke.
            const path=Math.cos(3*theta + Math.sin(ang*8-t*.85)*.32);
            if(path>.96 && silhouette>.1) {
              const strength=(path-.96)*4.5*silhouette*power;
              surface=mixColor(surface, n2>.62?PAL[9]:PAL[6], strength*.4);
              emit+=strength*17;
            }
          }
          // Approximate gravitational refraction near the shadow.
          const lensStrength=power*sat((radius*3.3-rr)/(radius*2.1));
          const deflection= rr>radius*.6? lensStrength*.085*radius*radius/(rr+.2):0;
          const qx=u+Math.cos(ang)*deflection, qy=v+Math.sin(ang)*deflection;
          let diskR=0,diskTheta=0;
          if(rr<reach*1.26 && Math.abs(nF)>.12){
            const d=-(nR*qx+nU*qy)/nF;
            const X=a[0]*qx+b[0]*qy+c[0]*d;
            const Z=a[2]*qx+b[2]*qy+c[2]*d;
            diskR=Math.hypot(X,Z);diskTheta=Math.atan2(Z,X);
            if(diskR>radius*1.04 && diskR<reach*.93 && Math.abs(d)<reach*3.5){
              // Wavelets are sampled in world-space polar coordinates and move
              // around the actual inclined disk, not around the camera viewport.
              const radial=(diskR-radius)/Math.max(.1,reach-radius);
              const turbulence=noise(X*1.45+cosTurb,Z*1.45+sinTurb,nseed+33);
              const micro=noise(X*4-t*.47,Z*4+t*.39,nseed+77);
              const sw=24*Math.log(diskR/radius)-7*diskTheta-tDrive*7+2.6*(turbulence-.5);
              const sw2=46*Math.log(diskR/radius)+5*diskTheta-tDrive*3.1+2.5*(micro-.5);
              const strands=Math.pow(Math.max(0,Math.cos(sw)),7);
              const filaments=Math.pow(Math.max(0,Math.cos(sw2)),14);
              const radialRidges=Math.pow(Math.max(0,Math.cos(diskR*11.7+2.2*Math.sin(diskTheta*8-tDrive*2))),10);
              const edge=smooth(radius*1.06,radius*1.28,diskR)*(1-smooth(reach*.79,reach*.95,diskR));
              const innerHeat=Math.exp(-Math.pow((diskR-radius*1.78)/(radius*1.55),2));
              const doppler=.84+.16*Math.cos(diskTheta-p.camera.yaw+.4);
              const turbulenceHeat=.73+.6*turbulence+.14*micro;
              const luminous=(.35+strands*.8+filaments*.33+radialRidges*.20)*edge*doppler*turbulenceHeat;
              const brightness=power*luminous*(.7+.65*innerHeat)*(1-.15*radial);
              const opacity=sat((.65+.3*turbulence+.15*strands)*edge*power);
              // Cyan is carried by specific high-velocity filaments, not sprayed at random.
              const cyan= Math.pow(Math.max(0,Math.sin(sw*.48+diskTheta*1.9)),13) *(.63+.55*micro);
              const col= cyan>.52 ? mixColor(PAL[6],PAL[9],sat(cyan*1.05)) :
                paletteAt(PAL,sat(.22+.58*brightness+.12*innerHeat-.1*radial),bayer);
              surface=mixColor(surface,col,opacity);
              emit += brightness*(cyan>.52?86:49);
              dep=center.depth+d;
            }
          }
          // Warped photon-sphere arcs above and around the central shadow.
          const dist=(rr/Math.max(.01,radius));
          if(dist>.97 && dist<2.34){
            const sa=Math.sin(ang);
            const warp= .06*Math.sin(ang*4-t*1.1)+.025*Math.sin(ang*9+t*.7);
            const innerBand=Math.exp(-Math.pow((dist-1.105-warp)/.036,2));
            const outerBand=Math.exp(-Math.pow((dist-1.40-.085*Math.sin(ang*2.4-t*.48))/.075,2));
            const upper=sat((sa+.15)*1.1);
            const ray=power*((innerBand*(.82+.28*sa))+(outerBand*upper*.85));
            if(ray>.006){
              const col= innerBand>.5?PAL[8]:(upper>.5?PAL[6]:PAL[4]);
              surface=mixColor(surface,col,sat(ray*.92));
              emit+=ray*91;
            }
          }
          // Strongly lensed *far side* of the accretion disk forms a suspended
          // luminous arch above the event horizon, not a second flat disk.
          // This is the signature back-lit black-hole silhouette.
          if (rr>radius*1.18 && rr<radius*2.48) {
            const sn=Math.sin(ang), upper=sat((sn+.10)*1.35);
            const target=1.83 + .11*Math.cos(2*ang-t*.28) + .045*Math.sin(6*ang+t*.8);
            const offset=rr/radius-target;
            const broad=Math.exp(-((offset/.14)**2)) * upper;
            const core=Math.exp(-((offset/.032)**2)) * upper;
            const motion=.71+.22*Math.sin(9*ang-2.2*t)+.12*Math.sin(22*ang+4.1*t);
            const glow=power*(broad*.27+core*.81)*motion;
            if (glow>.008) {
              const bright=core>.45 ? PAL[8] : PAL[5];
              surface=mixColor(surface,bright,sat(glow*.86));
              emit+=glow*92;
            }
          }
          // Broken, distant, cyan-violet optical arcs. They are intentionally
          // far subtler than the hot disk and sweep around in world-facing parallax.
          if(rr>radius*3.0 && rr<reach*1.37) {
            const lane=reach*(.87+.055*Math.sin(ang*3.4-t*.34));
            const narrow=Math.exp(-(((rr-lane)/(reach*.013))**2));
            const gate=Math.pow(Math.max(0,Math.sin(ang*2.1 + .6*t + .6)),4);
            const amount=narrow*gate*power*.42;
            if(amount>.025) {
              surface=mixColor(surface, gate>.65?PAL[9]:PAL[6],amount*.86);
              emit+=amount*49;
            }
          }
          // A ray-sphere hit is the dark black-hole silhouette. Near side of the
          // accretion plane is retained if it is in front of the hemisphere.
          if(rr<radius) {
            const hit=Math.sqrt(Math.max(0,radius*radius-rr*rr));
            const surfDepth=center.depth+hit;
            if(dep<=surfDepth) {
              const edge=sat((rr/radius-.73)/.27);
              surface=mixColor(black,PAL[1],.10*edge*edge);
              emit=0;dep=surfDepth;
            }
          }
          // Keep unrelated nearer geometry intact when composed into a game scene.
          if (depth[i] > dep) continue;
          colors[i]=surface;
          if (dep !== -Infinity) depth[i]=dep;
          if(emit>.01){
            const red=Math.min(255,emit*(.86+.32*(ch(surface,0)/255)));
            const green=Math.min(255,emit*(.45+.52*(ch(surface,8)/255)));
            const blue=Math.min(255,emit*(.72+.48*(ch(surface,16)/255)));
            lights[i]=rgb(red,green,blue);
          }
        }
      }
      // Gravitationally captured solid 3D fragments. Interior orbital speeds rise
      // as their distance shrinks; outboard boulders tumble slowly in parallax.
      const pal=PAL;
      for(const r of rocks) {
        const rd=r.radius*Math.exp(-r.fall*Math.max(0,t-.7));
        if(rd<radius*1.08)continue;
        const angle=r.a+t*.69*Math.sqrt(reach/rd)+r.phase*.025;
        const x=Math.cos(angle)*rd,z=Math.sin(angle)*rd;
        const y=CY+.16*x-.10*z+r.y*Math.max(.2,rd/r.radius);
        const pos:Vec3=[x,y,z];
        const size=r.scale*(.86+.18*Math.sin(t*1.3+r.phase));
        if(r.scale<.12) {
          p.point(pos,size,pal[r.bright>.7?7:4],power*.85,.06*power);
        } else {
          rock(p,pos,size,angle+r.spin*t,pal,r.bright*power,r.phase);
        }
      }
      // Subpixel splinters and luminous orbiting 3D trails, with a real inward
      // velocity field rather than screen-space spinning dots.
      for(const spark of sparks) {
        const rd=spark.r*Math.exp(-spark.fall*t*.57);
        if(rd<radius*1.12)continue;
        const angle=spark.a+t*spark.speed*Math.sqrt(reach/rd)+spark.phase*.16;
        const x=Math.cos(angle)*rd,z=Math.sin(angle)*rd;
        const y=CY+.16*x-.10*z+spark.y*.35;
        const tailAngle=angle-.016*(.6+spark.speed);
        const tail:Vec3=[Math.cos(tailAngle)*rd,CY+.16*Math.cos(tailAngle)*rd-.10*Math.sin(tailAngle)*rd+spark.y*.35,Math.sin(tailAngle)*rd];
        const pos:Vec3=[x,y,z],a0=power*(.4+.3*Math.sin(t*2.6+spark.phase));
        const color=pal[[7,9,8,6][spark.c]];
        if(spark.c<2) p.line(tail,pos,spark.size,color,a0, a0*.15);
        else p.point(pos,spark.size,color,a0,a0*.14);
      }
      // Depth-parallax starfield; very small, sharp glints are the only fully
      // camera-facing elements (physical stars would be distant point sources).
      for(const star of stars) {
        const a=.45+.55*Math.sin(t*1.1+star.tw)**2;
        const pos:Vec3=[star.x,CY+star.y,star.z];
        p.point(pos,star.mag,pal[star.color===0?10:star.color===1?9:7],a*power*.8,.06*a*power);
        if(star.mag>.067 && a>.69) {
          const r=star.mag*2.8;
          p.line([pos[0]-r,pos[1],pos[2]],[pos[0]+r,pos[1],pos[2]],.01,pal[9],a*.55,.08);
          p.line([pos[0],pos[1]-r,pos[2]],[pos[0],pos[1]+r,pos[2]],.01,pal[8],a*.55,.08);
        }
      }
      // Ensure no stray light leaks across the physical event horizon, even
      // after foreground facets and the final low-frequency emissive bloom.
      bloom(frame,sx,sy,cr,power*.9);
      const x0=Math.max(0,Math.floor(sx-cr*.96)),x1=Math.min(w-1,Math.ceil(sx+cr*.96));
      const y0=Math.max(0,Math.floor(sy-cr*.96)),y1=Math.min(h-1,Math.ceil(sy+cr*.96));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
        const rr2=(x+.5-sx)**2+(y+.5-sy)**2;
        if(rr2>cr*cr*.94)continue;
        const i=y*w+x;
        if(depth[i]===center.depth+Math.sqrt(Math.max(0,radius*radius-rr2/(scale*scale)))) lights[i]=0;
      }
    },
  };
}

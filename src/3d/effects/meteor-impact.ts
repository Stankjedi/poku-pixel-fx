/** Atmospheric entry: an unpowered rocky mass, surface ablation, sheared wake and oblique impact. */
import { type EffectMeta3D } from "../fx.js";
import { type Color3D, color3D } from "../frame.js";
import { type Vec3, Rng3D, clamp3, smooth3, TAU3, add3, mul3, sub3, norm3, cross3, dot3 } from "../math.js";
import { Fragments3D, drawFragment3D, transformFragment3D } from "../fragments.js";
import { createRockMesh3D, fractureRockMesh3D } from "../rock.js";
import { Particles3D } from "../particles.js";
import { impactGroundHeight3D, createImpactTerrain3D, drawImpactTerrain3D } from "../ground-motion.js";
import { impactCamera3D } from "../camera-motion.js";
import { type Camera3D } from "../painter.js";
import { createImpactGround3D, drawImpactCrater3D } from "../impact-ground.js";
import { drawVolume3D, VolumeGrid3D, volumeNoise3D } from "../volume.js";
import { Painter3D } from "../painter.js";

export interface MeteorImpact3DOptions { seed:number; size:number; force:number; palette:Color3D[] }
export const METEOR_IMPACT = 1.65;
export const meta:EffectMeta3D<MeteorImpact3DOptions> = {
  id:"space/meteor-impact-3d",name:"Meteor Impact 3D",
  description:"A tumbling basalt meteor falls on a steep ballistic arc. An incandescent leading crust sheds fragments into a sheared plasma wake, then crushes into matching ground slabs. The original rock splits into closed fragments, soil and meteor ejecta tumble separately, a contact-centered terrain swell follows the air-pressure refraction, and volumetric dust rolls above a fractured crater. The camera jolts briefly and settles. Art-directed atmospheric entry, not a fluid simulation.",
  duration:5.6,loop:false,
  stages:[{at:0,label:"ENTRY"},{at:0.38,label:"ABLATION"},{at:1.12,label:"BREAKUP"},{at:METEOR_IMPACT,label:"IMPACT"},{at:1.72,label:"GROUND FAILURE"},{at:2.1,label:"HEAVY EJECTA"},{at:3.1,label:"COOLING"},{at:4.55,label:"SETTLE"}],
  cues:[{at:0.38,type:"sound",value:0.3},{at:METEOR_IMPACT,type:"hit",value:1},{at:METEOR_IMPACT,type:"flash",value:0.85},{at:METEOR_IMPACT,type:"shake",value:0.8},{at:METEOR_IMPACT,type:"sound",value:1}],
  options:{seed:60217,size:1,force:1,palette:["#572426","#a23824","#df5925","#ff913c","#ffc765","#fff0b5"]},
};
const STONE:Color3D[]=["#1c1c28","#302834","#493a40","#65504c","#856354","#a67c5c"];
const ASH:Color3D[]=["#26252d","#3c3539","#554840","#716052","#92806a","#b39c7f"];
const TERRAIN:Color3D[]=["#121b27","#1a222c","#252c35","#353a42","#494b50","#606066"];
const SOIL:Color3D[]=["#1d2027","#303039","#48434a","#635750","#85715f","#a28c70"];
/** A ballistic, accelerating reference path. The effect adjusts height to its actual rock support. */
export function meteorEntryPosition3D(time:number,size=1):Vec3 {
  if(!Number.isFinite(time)) throw new RangeError("entry time must be finite");
  const u=clamp3(time/METEOR_IMPACT),s=clamp3(Number.isFinite(size)?size:1,0.45,1.4);
  return [5.4*(u-1),0.78*s+6.1*(1-u)+1.25*u*(1-u),-0.85*(1-u)];
}
function entryDirection(t:number):Vec3 { return norm3(sub3(meteorEntryPosition3D(Math.min(METEOR_IMPACT,t+0.005)),meteorEntryPosition3D(Math.max(0,t-0.005)))); }
export function create(options:MeteorImpact3DOptions) {
  const size=clamp3(Number.isFinite(options.size)?options.size:1,0.45,1.4),force=clamp3(Number.isFinite(options.force)?options.force:1,0.25,1.5);
  const source=options.palette.length?options.palette:meta.options.palette;
  const heat=Array.from({length:6},(_,i)=>source[Math.round(i/5*(source.length-1))]);
  const rng=new Rng3D(options.seed),body=createRockMesh3D({seed:options.seed,radius:0.94*size,roughness:0.17});
  const rotationAt=(time:number):Vec3=>[0.16+time*0.37,time*0.52,-time*0.29];
  // Land the actual lowest vertex, including its seeded silhouette and impact-time rotation.
  const support=0.025-Math.min(...body.vertices.map(v=>transformFragment3D(v,[0,0,0],rotationAt(METEOR_IMPACT))[1]));
  const entryAt=(time:number):Vec3=>add3(meteorEntryPosition3D(time,size),[0,support-0.78*size,0]);
  const rubble=new Fragments3D(0.025,96),sparks=new Particles3D(0.03,320);
  const rockMeshes=Array.from({length:10},(_,i)=>createRockMesh3D({seed:options.seed+i*731,radius:rng.range(0.11,0.27)*size,detail:0,roughness:0.3}));
  const detach=Array.from({length:23},(_,i)=>({born:0.3+i*0.055,side:rng.range(-1,1),phase:rng.range(0,TAU3),speed:rng.range(0.6,1.5)}));
  const impactRng=new Rng3D(options.seed^0x51ab71),ground=createImpactGround3D(options.seed^0x2719,size);
  const terrain=createImpactTerrain3D(options.seed^0x2147,size);
  const slabs=new Fragments3D(0.025,24),meteorChunks=new Fragments3D(0.025,24);
  const fractures=ground.rim.map(v=>({angle:Math.atan2(v[2],v[0]),length:impactRng.range(3.2,4.45),bend:impactRng.range(-0.27,0.27),split:impactRng.range(0.35,0.65)}));
  const impactChunks=fractureRockMesh3D(body).map(q=> {
    const rotation=rotationAt(METEOR_IMPACT),world=q.mesh.vertices.map(v=>transformFragment3D(add3(v,q.center),[0,0,0],rotation));
    const compressed=world.map(v=>[v[0]*1.1,v[1]*0.45+0.5*size,v[2]*1.1] as Vec3);
    const center=mul3(compressed.reduce((a,b)=>add3(a,b),[0,0,0] as Vec3),1/compressed.length);
    return {mesh:{vertices:compressed.map(v=>sub3(v,center)),faces:q.mesh.faces},center,angle:Math.atan2(center[2],center[0]),speed:impactRng.range(2.1,4.1)};
  });
  const dustBounds={min:[-5.1*size,0,-5.1*size] as Vec3,max:[5.1*size,4.1*size,5.1*size] as Vec3};
  const dustGrid=new VolumeGrid3D(dustBounds,0.28*size),dustRamp=ASH.map(color3D);
  const [dustNX,dustNY,dustNZ]=dustGrid.dimensions;
  // Every height in a grid column shares its azimuth and radial material shape.
  // Keep the exact grid coordinates and expressions, but evaluate these once.
  const dustColumns=Array.from({length:dustNX*dustNZ},(_,i)=> {
    const x=dustBounds.min[0]+(i%dustNX)/((dustNX-1)/(dustBounds.max[0]-dustBounds.min[0]));
    const z=dustBounds.min[2]+Math.floor(i/dustNX)/((dustNZ-1)/(dustBounds.max[2]-dustBounds.min[2]));
    const angle=Math.atan2(z,x);
    return {x,z,r:Math.hypot(x,z),lobe:1+0.08*Math.cos(angle)+0.11*Math.sin(angle*3+options.seed*0.17)+0.035*Math.sin(angle*9),height:0.85+0.25*Math.sin(angle*4)};
  });
  const dustTrails:{position:Vec3;born:number;radius:number}[]=[];
  let t=0,hit=false,nextChip=0,slabReleased=ground.pieces.map(()=>false),chunkReleased=false,trailTick=0,cachedDust=-1;
  function impact() {
    for(let i=0;i<24;i++) {
      const a=impactRng.range(0,TAU3),speed=impactRng.range(2.5,5.5)*force,r=impactRng.range(0.7,1.4)*size;
      rubble.spawn({mesh:rockMeshes[i%rockMeshes.length],position:[Math.cos(a)*r,0.18,Math.sin(a)*r],velocity:[Math.cos(a)*speed,impactRng.range(2.8,5.4)*force,Math.sin(a)*speed],rotation:[a,0,a],angularVelocity:[impactRng.range(-6,6),impactRng.range(-6,6),impactRng.range(-6,6)],palette:SOIL,life:3.3,gravity:13,drag:0.95,bounce:0.16,friction:0.7,meltStart:0.78});
    }
    for(let i=0;i<58;i++) {
      const a=impactRng.range(0,TAU3),speed=impactRng.range(2,6)*force;
      sparks.spawn({position:[0,0.24,0],velocity:[Math.cos(a)*speed+1,impactRng.range(1.2,5.5)*force,Math.sin(a)*speed*0.8],life:impactRng.range(0.28,0.7),radius:impactRng.range(0.016,0.035),color:heat[4],ramp:[heat[5],heat[3],heat[1]],gravity:11,drag:1.2,bounce:0.1,emission:0.09,style:"spark"});
    }
  }
  function wake(p:Painter3D) {
    const end=Math.min(t,METEOR_IMPACT),cool=1-smooth3(METEOR_IMPACT,METEOR_IMPACT+0.43,t);
    if(cool<=0) return;
    const d=entryDirection(end),side=norm3(cross3(d,[0,0,1])),side2=norm3(cross3(d,side));
    // A tapered ragged 3D mantle makes the wake read as plasma, not seven unrelated lines.
    // All stations lie on the already-travelled path; no guessed nozzle or camera-facing cone.
    const rings=14,sides=9;
    const mantle=(i:number,j:number):Vec3=> {
      const u=i/rings,when=Math.max(0,end-0.12-u*0.62),a=j/sides*TAU3;
      const radius=0.69*size*Math.pow(1-u,0.72)*(1+0.26*Math.sin(i*1.3-j*2+t*10));
      return add3(entryAt(when),add3(mul3(side,Math.cos(a)*radius),mul3(side2,Math.sin(a)*radius)));
    };
    for(let i=0;i<rings;i++) for(let j=0;j<sides;j++) {
      const u=i/rings;if(end-0.12-u*0.62<=0) continue;
      const a=mantle(i,j),b=mantle(i,j+1),c=mantle(i+1,j),d=mantle(i+1,j+1);
      const color=heat[Math.max(0,Math.min(2,Math.floor((1-u)*2.6)-((j+i)%4===0?1:0)))];
      const opacity=cool*smooth3(0.08,0.35,t)*(0.85-0.25*u);
      p.triangle(a,b,c,color,opacity,0.025*cool);p.triangle(b,d,c,color,opacity,0.025*cool);
    }
    // The wake follows past world positions. It continues cooling in the air after the body hits.
    for(let strand=0;strand<7;strand++) {
      const a=strand/7*TAU3,phase=strand*2.31,life=0.64+0.07*(strand%3),segments=16;
      let previous:Vec3|undefined;
      for(let j=0;j<=segments;j++) {
        const u=j/segments,age=0.055+u*life,when=end-age;
        if(when<=0) break;
        const center=entryAt(when),swirl=0.77*size*Math.pow(1-u,0.65)+Math.sin(u*9-t*7+phase)*0.14*u;
        const offset=add3(mul3(side,Math.cos(a+u*0.65)*swirl),mul3(side2,Math.sin(a+u*0.65)*swirl));
        const pos=add3(center,offset),strength=(1-u)*cool*smooth3(0.06,0.3,t);
        if(previous&&strength>0.015) p.line(previous,pos,(0.08+0.13*(1-u))*size*strength,heat[Math.min(4,Math.floor((1-u)*4))],1,0.1*strength);
        previous=pos;
      }
    }
  }
  function groundImpact(p:Painter3D,age:number,fade:number) {
    const spread=smooth3(0.015,0.29,age),heatFade=1-smooth3(0.22,1.45,age);
    // Broken radial paths propagate into the floor and persist after the pressure front has passed.
    for(const q of fractures) {
      const length=q.length*size*spread,angle=q.angle;
      const at=(r:number,a:number):Vec3=>[Math.cos(a)*r,0.044+impactGroundHeight3D(r,age,size,force),Math.sin(a)*r];
      const nodes=[at(0.72*size,angle),at(length*q.split,angle+q.bend),at(length*0.78,angle-q.bend*0.5),at(length,angle+q.bend*0.4)];
      if(length<0.8*size) continue;
      for(let i=1;i<nodes.length;i++) {
        const width=(0.1-i*0.02)*size;
        p.line(nodes[i-1],nodes[i],width,STONE[0],fade);
        if(heatFade>0) p.line(add3(nodes[i-1],[0,0.003,0]),add3(nodes[i],[0,0.003,0]),width*0.35,heat[i===1?2:1],fade,0.09*heatFade);
      }
      const joint=nodes[1],branch=add3(joint,[Math.cos(angle+0.8)*length*0.24,0,Math.sin(angle+0.8)*length*0.24]);
      p.line(joint,branch,0.035*size,STONE[0],fade);
    }

  }
  function impactDust(p:Painter3D,age:number) {
    const densityFade=smooth3(0.06,0.24,age)*(1-smooth3(1.0,2.6,age));
    if(densityFade<=0.001) return;
    const radius=(0.85+3.15*(1-Math.exp(-age*2.6)))*size;
    const roll=(0.34+0.62*smooth3(0.05,0.72,age))*size;
    const plume=smooth3(0.08,0.28,age)*(1-smooth3(0.65,1.55,age));
    if(cachedDust!==t) {
      const cell=0.65*size,trailCells=new Map<number,{position:Vec3;radius:number;density:number;rise:number}[]>();
      const key=(x:number,y:number,z:number)=>((z+32)*64+y+8)*64+x+32;
      // Spatial bins keep each cache sample local instead of scanning every fragment trail.
      for(const q of dustTrails) {
        const dt=age-q.born;if(dt>=0.65)continue;
        const radius=q.radius+dt*0.28*size,rise=dt*0.15,entry={position:q.position,radius,density:(1-dt/0.65)*0.55,rise};
        for(let z=Math.floor((q.position[2]-radius)/cell);z<=Math.floor((q.position[2]+radius)/cell);z++)
        for(let y=Math.floor((q.position[1]+rise-radius)/cell);y<=Math.floor((q.position[1]+rise+radius)/cell);y++)
        for(let x=Math.floor((q.position[0]-radius)/cell);x<=Math.floor((q.position[0]+radius)/cell);x++) {
          const k=key(x,y,z),bucket=trailCells.get(k);if(bucket)bucket.push(entry);else trailCells.set(k,[entry]);
        }
      }
      const ph=Math.min(3.5,0.8+age*4.2)*size,pr=(0.68+age*0.65)*size;
      const radial=dustColumns.map(q=>({rr:(q.r-radius*q.lobe)/(roll*1.3),height:roll*q.height,column:1-((q.x-age*0.38*size)**2+q.z*q.z)/(pr*pr)}));
      // VolumeGrid.refill visits x fastest, then y, then z.
      let sampleIndex=0;
      dustGrid.refill((x,y,z)=> {
        const i=sampleIndex++,q=radial[Math.floor(i/(dustNX*dustNY))*dustNX+i%dustNX];
        if(y<0.03) return;
        const yy=(y-roll*0.7)/q.height;
        let body=Math.max(0,1-q.rr*q.rr-yy*yy)*densityFade*1.9;
        // A rising, sheared central column connects the contact to ejecta, then opens again.
        const column=q.column-(y-ph*0.58)**2/(ph*ph*0.5);
        if(column>0)body+=column*plume*1.05;
        const nearby=trailCells.get(key(Math.floor(x/cell),Math.floor(y/cell),Math.floor(z/cell)));
        if(nearby)for(const q of nearby) {
          const dx=(x-q.position[0])/q.radius,dy=(y-q.position[1]-q.rise)/q.radius,dz=(z-q.position[2])/q.radius;
          const qd=1-dx*dx-dy*dy-dz*dz;if(qd>0)body+=qd*q.density;
        }
        if(body<0.01)return;
        const noise=volumeNoise3D(x*2.9/size,y*3.1/size-age*2.3,z*2.9/size,options.seed+301);
        const shaped=Math.max(0,body*(0.65+noise*0.8)-0.16);
        if(shaped<0.015)return;
        const shade=clamp3(0.3+y/(1.8*size)*0.28+(noise-0.5)*0.42-x/(7*size));
        return {density:shaped/size,color:dustRamp[Math.round(shade*5)]};
      });cachedDust=t;
    }
    const reach=Math.min(5.1*size,radius+roll*1.7),top=Math.max(1.4*size,Math.min(4.1*size,(0.9+age*2.7)*size));
    drawVolume3D(p,{min:[-reach,0,-reach],max:[reach,top,reach]},dustGrid.sample,{step:0.16*size,maxSteps:72,palette:dustRamp,alphaCutoff:0.12});
  }
  return {
    camera(base:Camera3D) {return impactCamera3D(base,t-METEOR_IMPACT,force*1.35,options.seed);},
    update(dt:number) {
      t+=dt;rubble.update(dt);sparks.update(dt);slabs.update(dt);meteorChunks.update(dt);
      while(nextChip<detach.length&&t+1e-9>=detach[nextChip].born) {
        const q=detach[nextChip++],pos=entryAt(q.born),d=entryDirection(q.born);
        const tangent:Vec3=[Math.cos(q.phase)*0.58*size,q.side*0.36*size,Math.sin(q.phase)*0.58*size];
        rubble.spawn({mesh:rockMeshes[nextChip%rockMeshes.length],position:add3(pos,tangent),velocity:[d[0]*2+q.side*0.6,d[1]*2+0.4,Math.sin(q.phase)*q.speed],angularVelocity:[q.speed*3,-q.speed*2,q.side*4],palette:[STONE[1],heat[0],heat[1],heat[2]],life:0.65,gravity:3.3,drag:1.1,bounce:0,meltStart:0.3});
        sparks.spawn({position:add3(pos,tangent),velocity:[d[0]*0.8+q.side,d[1]*0.8,Math.sin(q.phase)*1.4],life:0.48,radius:0.035*size,color:heat[4],ramp:[heat[4],heat[2],heat[0]],gravity:2,drag:0.5,emission:0.12,style:"spark"});
      }
      if(!hit&&t+1e-9>=METEOR_IMPACT) {hit=true;impact();}
      const age=t-METEOR_IMPACT;
      if(age>=0) {
        ground.pieces.forEach((piece,i)=> {
          if(slabReleased[i]||age+1e-9<piece.release) return;
          slabReleased[i]=true;
          const a=piece.angle,speed=3.0*piece.speed*force;
          slabs.spawn({mesh:piece.mesh,position:piece.center,velocity:[Math.cos(a)*speed+0.55,7.1*piece.speed*force,Math.sin(a)*speed],angularVelocity:piece.spin,palette:SOIL,life:3.65-piece.release,gravity:12.8,drag:0.55,bounce:0.12,friction:0.78,meltStart:0.82});
        });
        if(!chunkReleased&&age+1e-9>=0.065) {
          chunkReleased=true;
          for(const q of impactChunks)meteorChunks.spawn({mesh:q.mesh,position:q.center,velocity:[Math.cos(q.angle)*q.speed*force+1,7.5*force,Math.sin(q.angle)*q.speed*force],angularVelocity:[q.speed*0.6,1.2,-q.speed*0.5],palette:[STONE[0],STONE[1],heat[0],heat[1],STONE[4]],life:2.5,gravity:14,drag:0.7,bounce:0.16,friction:0.75,meltStart:0.75});
        }
        if(age<0.7&&++trailTick%8===0)for(const f of slabs.list)dustTrails.push({position:[...f.position],born:age,radius:0.14*size});
        for(let i=dustTrails.length-1;i>=0;i--)if(age-dustTrails[i].born>=0.65)dustTrails.splice(i,1);
      }
    },
    draw(p:Painter3D) {
      if(t<=0||t>=meta.duration-1e-8) return;
      const age=t-METEOR_IMPACT,fade=1-smooth3(4.35,5.45,t);
      drawImpactTerrain3D(p,terrain,age,TERRAIN,smooth3(0,0.22,t)*fade,force);
      if(age>=0) {
        groundImpact(p,age,fade);
        drawImpactCrater3D(p,ground,age,SOIL,heat,fade);
        ground.pieces.forEach((piece,i)=>{if(!slabReleased[i])drawFragment3D(p,piece.mesh,piece.center,[0,0,0],SOIL);});
      }
      wake(p);
      if(!hit) {
        const center=entryAt(t),rotation=rotationAt(t),d=entryDirection(t),hot=smooth3(0.1,0.55,t);
        const vertices=body.vertices.map(v=>transformFragment3D(v,center,rotation));
        // Heated faces follow the incident flow, not the tumbling rock's material orientation.
        for(const [i,j,k] of body.faces) {
          const a=vertices[i],b=vertices[j],c=vertices[k],at=mul3(add3(add3(a,b),c),1/3),facing=dot3(norm3(sub3(at,center)),d);
          const heated=facing>0.3&&((i+j+k)%4!==0);
          p.facet(a,b,c,heated?[heat[0],heat[1],heat[2],heat[3]]:STONE,1,heated?0.05*hot:0);
          if(facing>0.05&&(i+j+k)%5===0) p.line(a,b,0.019*size,heat[3],hot,0.08*hot);
        }
        // Thin offset bow shell on the forward-facing hemisphere, never a rocket nozzle.
        for(let s=0;s<9;s++) {
          const axis=norm3(cross3(d,[0,0,1])),other=norm3(cross3(d,axis)),a=s/9*TAU3,b=(s+0.78)/9*TAU3;
          const shell=(angle:number):Vec3=>add3(add3(center,mul3(d,0.68*size)),add3(mul3(axis,Math.cos(angle)*0.48*size),mul3(other,Math.sin(angle)*0.48*size)));
          p.line(shell(a),shell(b),0.027*size,heat[4],hot,0.12*hot);
        }
        p.glow(add3(center,mul3(d,0.5*size)),1.05*size,heat[2],0.055*hot);
      }
      if(age>=0) {
        // A brief compressed solid survives contact, then its dark chunks erupt from this same core.
        const crush=1-smooth3(0.025,0.095,age);
        if(crush>0) {
          const mesh={vertices:body.vertices.map(v=>[v[0]*(1+age*4),v[1]*Math.max(0.15,1-age*12),v[2]*(1+age*4)] as Vec3),faces:body.faces};
          drawFragment3D(p,mesh,[0,0.3*size,0],rotationAt(METEOR_IMPACT),[STONE[0],heat[0],heat[1],heat[3]],crush);
        }
        // Short, broad contact vapor. No long triangular rays masquerading as debris.
        const eruption=smooth3(0,0.025,age)*(1-smooth3(0.1,0.29,age));
        if(eruption>0) for(let i=0;i<7;i++) {
          const a=i/7*TAU3,r=(0.35+age*3.7)*size,pos:Vec3=[Math.cos(a)*r,0.15+age*(2+i%3)*size,Math.sin(a)*r];
          const mesh=rockMeshes[i],vertices=mesh.vertices.map(v=>add3(pos,mul3(v,3.2*eruption)));
          for(const [a,b,c] of mesh.faces)p.facet(vertices[a],vertices[b],vertices[c],[heat[1],heat[2],heat[3],heat[4]],1,0.06*eruption);
        }
        const flash=1-smooth3(0.016,0.105,age);
        if(flash>0) {p.glow([0,0.35,0],2.1*size,heat[3],0.48*flash);p.point([0,0.25,0],0.63*size*flash,heat[5],1,0.17*flash);}
      }
      slabs.draw(p);meteorChunks.draw(p);
      rubble.draw(p);sparks.draw(p);
      if(age>=0)impactDust(p,age);
      // Transparent pressure refracts the scene; it carries no opaque ring material.
      if(age>0&&age<0.55) p.pressureWarp([0,0.25*size,0],(0.35+11.4*age)*size,0.55*size,0.24*size*smooth3(0,0.035,age)*(1-smooth3(0.12,0.55,age)),{tint:"#a5b8c6",opacity:0.17*smooth3(0.015,0.07,age)*(1-smooth3(0.18,0.5,age))});
    },
  };
}

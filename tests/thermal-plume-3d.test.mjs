import test from "node:test";
import assert from "node:assert/strict";
import { createFrame3D, Painter3D, createFx3D, thermalPlume3D, drawVolume3D, VolumeGrid3D, volumeNoise3D, color3D, enableHDRLight } from "../build/3d/index.js";

const bounds = { min: [-1,-1,-1], max: [1,1,1] };
const camera = { yaw: 0.68, elevation: 0.49, zoom: 1.65, target: [0,1.95,0] };
function render(fx, yaw = camera.yaw, size = [120,96]) {
  const frame = createFrame3D(...size), p = new Painter3D(frame, {...camera,yaw});
  p.begin("#0a1525"); fx.draw(p);
  return {color: frame.color.slice(), light: frame.light.slice(), depth: frame.depth.slice()};
}
function at(t, options = {}) { const fx=createFx3D(thermalPlume3D,options);fx.seek(t);return fx; }
function centerVolume(step, depth = -Infinity, hdr = false) {
  const frame=createFrame3D(17,50),p=new Painter3D(frame,{yaw:0,elevation:0,zoom:1});
  if(hdr) enableHDRLight(frame);
  p.begin("#000");const i=30*17+8;frame.depth[i]=depth;
  drawVolume3D(p,bounds,()=>({density:0.7,color:"#fff",emission:0.25}),{step});
  return {frame,i};
}

test("volume optical thickness is independent of step size and preserves opaque depth",()=>{
  const a=centerVolume(0.05),b=centerVolume(0.7);
  assert.equal(a.frame.color[a.i],b.frame.color[b.i]);
  assert.equal(a.frame.color[a.i]&255,Math.round(255*(1-Math.exp(-1.4))));
  assert.equal(a.frame.depth[a.i],-Infinity);
  const clipped=centerVolume(0.1,0);
  assert.equal(clipped.frame.color[clipped.i]&255,Math.round(255*(1-Math.exp(-0.7))));
  const blocked=centerVolume(0.1,2);
  assert.equal(blocked.frame.color[blocked.i],color3D("#000"));
  assert.equal(blocked.frame.light[blocked.i],0);
});

test("near smoke attenuates prior emission and contributes only its own radiance",()=>{
  const frame=createFrame3D(17,50),p=new Painter3D(frame,{yaw:0,elevation:0,zoom:1}),i=30*17+8;
  enableHDRLight(frame);p.begin("#000");frame.light[i]=color3D("#ffffff");frame.hdrLight.fill(1);
  drawVolume3D(p,bounds,()=>({density:0.7,color:"#333"}),{step:0.2});
  // The shared surface resolver uses the painter's truncating 8-bit mirror rule.
  // Linear HDR below remains the unquantized transmittance contract.
  assert.equal(frame.light[i]&255,Math.floor(255*Math.exp(-1.4)));
  assert.ok(Math.abs(frame.hdrLight[i*3]-Math.exp(-1.4))<1e-6);
  const a=centerVolume(0.1,-Infinity,true);
  assert.ok(a.frame.hdrLight[a.i*3]>0);
  assert.ok(a.frame.hdrLight.every(Number.isFinite));
});

test("volume fields are bounded, palette controlled and honor both camera projections",()=>{
  for(const projection of ["orthographic","perspective"]) {
    const frame=createFrame3D(80,60),p=new Painter3D(frame,{yaw:1.2,elevation:0.6,zoom:1,projection});
    p.begin("#000");const before=frame.color.slice();
    drawVolume3D(p,bounds,()=>undefined);assert.deepEqual(frame.color,before);
    drawVolume3D(p,bounds,()=>({density:100,color:"#dfaaff"}),{palette:["#f00"],step:0.1});
    assert.ok(frame.color.some(c=>c!==color3D("#000")));
    assert.ok(frame.color.every(c=>((c>>>8)&65535)===0));
    assert.ok(frame.depth.every(z=>z===-Infinity));
  }
  const f=createFrame3D(16,16),p=new Painter3D(f);
  for(const step of [0,-1,Infinity,NaN]) assert.throws(()=>drawVolume3D(p,bounds,()=>undefined,{step}),RangeError);
  assert.throws(()=>drawVolume3D(p,bounds,()=>undefined,{maxSteps:1.5}),RangeError);
  assert.throws(()=>drawVolume3D(p,bounds,()=>undefined,{alphaCutoff:-1}),RangeError);
  assert.throws(()=>drawVolume3D(p,{min:[0,0,0],max:[0,1,1]},()=>undefined),RangeError);
});

test("cached fields interpolate density without black boundary halos and refill cleanly",()=>{
  const grid=new VolumeGrid3D(bounds,0.5);
  grid.refill((x)=>x<0?undefined:{density:2,color:"#ffa040",emission:0.3});
  const sample=grid.sample(-0.25,0,0);
  assert.equal(sample.density,1);assert.equal(sample.color,color3D("#ffa040"));
  assert.ok(Math.abs(sample.emission-0.3)<1e-6);
  assert.equal(grid.sample(-2,0,0),undefined);
  assert.equal(grid.sample(1,1,1).density,2);
  grid.refill(()=>undefined);assert.equal(grid.sample(0,0,0),undefined);
  assert.throws(()=>new VolumeGrid3D(bounds,0),RangeError);
  assert.throws(()=>new VolumeGrid3D(bounds,0.001),RangeError);
});

test("material-space noise is seeded, continuous and works at negative coordinates",()=>{
  const a=volumeNoise3D(-1.35,2.12,-0.76,17);
  assert.equal(a,volumeNoise3D(-1.35,2.12,-0.76,17));
  assert.notEqual(a,volumeNoise3D(-1.35,2.12,-0.76,18));
  assert.ok(Math.abs(a-volumeNoise3D(-1.35+1e-5,2.12,-0.76,17))<1e-4);
  assert.ok(a>=0&&a<=1);
});

test("thermal plume is deterministic across seek, frame partition, and repeat draws",()=>{
  const a=createFx3D(thermalPlume3D),b=createFx3D(thermalPlume3D);
  for(let i=0;i<60;i++)a.update(1/30);
  for(let i=0;i<240;i++)b.update(1/120);
  assert.deepEqual(render(a),render(b));
  assert.deepEqual(render(a),render(at(2)));
  assert.deepEqual(render(a),render(a));
  assert.notDeepEqual(render(at(2,{seed:1})).color,render(at(2,{seed:2})).color);
});

test("fire changes shape and exposes real camera parallax rather than billboards",()=>{
  const a=render(at(1.5)),b=render(at(1.8));
  assert.notDeepEqual(a.color,b.color);
  assert.notDeepEqual(render(at(2),0).color,render(at(2),Math.PI/2).color);
  const warm=c=>(c&255)>120&&((c>>>8)&255)>40&&((c>>>16)&255)<190;
  assert.ok(a.color.filter(warm).length>50);
  const smoke=render(at(4.6)),clear=render(at(4.6,{smoke:0}));
  assert.notDeepEqual(smoke.color,clear.color);
});

test("one-shot starts and ends completely empty and smoke outlives flame",()=>{
  const empty=render({draw(){}});
  assert.deepEqual(render(at(0)),empty);
  assert.deepEqual(render(at(thermalPlume3D.meta.duration)),empty);
  assert.equal(at(thermalPlume3D.meta.duration).done(),true);
  const late=render(at(4.8));assert.notDeepEqual(late.color,render(at(4.8,{smoke:0})).color);
  assert.deepEqual(render(at(5.8,{smoke:0})),empty);
});

test("palette and bounded material options are safe",()=>{
  for(const palette of [[],["#0af"],["#123","#fff"]]) assert.notDeepEqual(render(at(2,{palette})).color,render({draw(){}}).color);
  assert.doesNotThrow(()=>render(at(2,{size:NaN,wind:Infinity,smoke:NaN})));
});

test("default plume, smoke and embers stay inside preview through the complete timeline",()=>{
  const bg=color3D("#0a1525"),w=96,h=72;
  for(const seed of [0,42,4217]) {
    const fx=createFx3D(thermalPlume3D,{seed});
    for(let i=0;i<=32;i++) {
      const f=render(fx,camera.yaw,[w,h]);
      for(let x=0;x<w;x++){assert.equal(f.color[x],bg);assert.equal(f.color[(h-1)*w+x],bg);}
      for(let y=0;y<h;y++){assert.equal(f.color[y*w],bg);assert.equal(f.color[y*w+w-1],bg);}
      fx.update(0.2);
    }
  }
});

test("volume empty-cell rejection keeps every populated corner and clears on refill",()=>{
  for(let corner=0;corner<8;corner++) {
    const grid=new VolumeGrid3D(bounds,2);
    grid.refill((x,y,z)=>x===(corner&1?1:-1)&&y===(corner&2?1:-1)&&z===(corner&4?1:-1)?{density:8,color:'#ffa040',emission:.25}:undefined);
    const middle=grid.sample(0,0,0);
    assert.equal(middle.density,1,`corner ${corner}`);
    assert.equal(middle.color,color3D('#ffa040'));
    assert.equal(middle.emission,.25);
    grid.refill(()=>undefined);assert.equal(grid.sample(0,0,0),undefined);
  }
});

test("volume interpolation preserves the reference corner accumulation exactly",()=>{
  const grid=new VolumeGrid3D(bounds,.4),[nx,ny,nz]=grid.dimensions;
  const field=(x,y,z)=>x+y+z>.1?{density:1.25+x*.2+y*.1+z*.3,color:color3D('#e07b35'),emission:.23}:undefined;
  grid.refill(field);
  const data=new Float32Array(nx*ny*nz*5);
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {
    const s=field(-1+x/((nx-1)/2),-1+y/((ny-1)/2),-1+z/((nz-1)/2));if(!s)continue;
    const i=((z*ny+y)*nx+x)*5,d=s.density*(s.color>>>24)/255;
    data.set([d,(s.color&255)*d,((s.color>>>8)&255)*d,((s.color>>>16)&255)*d,s.emission*d],i);
  }
  function reference(x,y,z) {
    x=(x+1)*((nx-1)/2);y=(y+1)*((ny-1)/2);z=(z+1)*((nz-1)/2);
    const ix=Math.min(nx-2,Math.floor(x)),iy=Math.min(ny-2,Math.floor(y)),iz=Math.min(nz-2,Math.floor(z)),u=x-ix,v=y-iy,w=z-iz;
    const sums=[0,0,0,0,0];
    for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++) {
      const weight=(dx?u:1-u)*(dy?v:1-v)*(dz?w:1-w),i=(((iz+dz)*ny+iy+dy)*nx+ix+dx)*5;
      for(let k=0;k<5;k++)sums[k]+=data[i+k]*weight;
    }
    const [d,r,g,b,e]=sums;if(d<1e-6)return;
    return {density:d,color:(0xff000000|(Math.round(b/d)<<16)|(Math.round(g/d)<<8)|Math.round(r/d))>>>0,emission:e/d};
  }
  for(let iz=0;iz<=10;iz++)for(let iy=0;iy<=10;iy++)for(let ix=0;ix<=10;ix++) {
    const x=-1+ix/5,y=-1+iy/5,z=-1+iz/5;
    assert.deepEqual(grid.sample(x,y,z),reference(x,y,z),`${x},${y},${z}`);
  }
});

test("reviewed plume retains exact pixels, light and depth across material variants",async()=>{
  const {readFile}=await import('node:fs/promises');
  const {createHash}=await import('node:crypto');
  const fixture=JSON.parse(await readFile(new URL('./fixtures/thermal-plume-render.json',import.meta.url),'utf8'));
  for(const c of fixture.frames) {
    const fx=at(c.t,c.options),frame=createFrame3D(...fixture.dimensions),p=new Painter3D(frame,{...fixture.camera,...c.camera});
    if(c.hdr)enableHDRLight(frame);p.alphaMode=c.alphaMode??'coverage';p.begin('#0a1525');
    if(c.depth)for(let y=0;y<frame.h;y++)for(let x=0;x<frame.w/2;x++) {
      const i=y*frame.w+x;frame.depth[i]=0;frame.light[i]=color3D('#446688');
      if(c.hdr)frame.hdrLight.fill(.5,i*3,(i+1)*3);
    }
    fx.draw(p);
    for(const [name,expected] of Object.entries(c.hashes)) {
      const a=frame[name],actual=createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
      assert.equal(actual,expected,`${c.name} t=${c.t} ${name}`);
    }
  }
});

test("volume material shortcuts match weighted interpolation across refills",()=>{
  const grid=new VolumeGrid3D(bounds,2);
  for(const variant of ['plain','emission','mixed','transparent','empty','overflow','plain']) {
    const cells=Array.from({length:8},(_,i)=>{
      if(variant==='empty'||i===0)return;
      const c=variant==='mixed'?color3D(i&1?'#ffa040':'#173f8a'):color3D('#ffa040');
      const alpha=variant==='transparent'?(i%3)*.5:1;
      return {density:variant==='overflow'?1e38:.17+i*.61,color:((c&0xffffff)|(Math.round(alpha*255)<<24))>>>0,emission:variant==='emission'?i*.09:0};
    });
    grid.refill((x,y,z)=>cells[(x===1?1:0)|(y===1?2:0)|(z===1?4:0)]);
    const data=cells.map(s=>{
      if(!s)return new Float32Array(5);
      const d=s.density*(s.color>>>24)/255;
      return new Float32Array([d,(s.color&255)*d,((s.color>>>8)&255)*d,((s.color>>>16)&255)*d,s.emission*d]);
    });
    for(const u of [.1,.5,.9])for(const v of [.1,.5,.9])for(const w of [.1,.5,.9]) {
      const x=u*2-1,y=v*2-1,z=w*2-1,uu=(x+1)*.5,vv=(y+1)*.5,ww=(z+1)*.5;
      const sums=[0,0,0,0,0];
      for(let i=0;i<8;i++){
        const weight=(i&1?uu:1-uu)*(i&2?vv:1-vv)*(i&4?ww:1-ww);
        for(let j=0;j<5;j++)sums[j]+=data[i][j]*weight;
      }
      const [d,r,g,b,e]=sums;
      const expected=d<1e-6?undefined:{density:d,color:(0xff000000|(Math.round(b/d)<<16)|(Math.round(g/d)<<8)|Math.round(r/d))>>>0,emission:e/d};
      const actual=grid.sample(x,y,z);
      assert.deepEqual(actual,expected,`${variant} at ${u},${v},${w}`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { liquidMotion, liquidImpactTime } from '../build/core/liquid.js';
import { createFrame, painterFor, resolveOptions } from '../build/core/fx.js';
import * as jet from '../build/fx/water/water-jet.js';
import * as crown from '../build/fx/water/capillary-crown.js';
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('liquid flight uses exact gravity, drag and depth projection with continuous velocity',()=>{
  const launch=Object.freeze({x:4,z:-3,h:20,vx:35,vz:12,vh:70});
  const physics=Object.freeze({gravity:650,drag:.45,depthScale:.24});
  const age=.2, at=liquidMotion(launch,age,physics), before=liquidMotion(launch,age-1e-6,physics), after=liquidMotion(launch,age+1e-6,physics);
  close((after.x-before.x)/2e-6,at.vx,1e-6);close((after.h-before.h)/2e-6,at.vh,1e-6);
  close((after.z-before.z)/2e-6,at.vz,1e-6);close((after.y-before.y)/2e-6,at.vy,1e-6);
  close(at.y,at.z*.24-at.h);
  const composed=liquidMotion(at,.05,physics), whole=liquidMotion(launch,.25,physics);
  for(const key of Object.keys(whole))close(composed[key],whole[key]);
  for(const t of [.4,0,.1])liquidMotion(launch,t,physics);
  assert.deepEqual(liquidMotion(launch,age,physics),at);
  const noDrag=liquidMotion(launch,.2,{...physics,drag:0}), tiny=liquidMotion(launch,.2,{...physics,drag:1e-12});
  for(const key of Object.keys(noDrag))close(noDrag[key],tiny[key]);
});

test('liquid impacts stop at the descending surface crossing including zero-height rising births',()=>{
  for(const launch of [{h:28,vh:76,vx:3},{h:0,vh:80,vx:-20,z:5,vz:12},{h:4,vh:-30},{h:1,vh:-1e9}]){
    for(const drag of [0,1e-12,.45,10]){
      const physics={gravity:700,drag,depthScale:.24}, time=liquidImpactTime(launch,physics);
      assert.ok(time>0 && Number.isFinite(time));
      const at=liquidMotion(launch,time,physics);
      close(at.h,0,1e-6);assert.ok(at.vh<0);
      assert.ok(liquidMotion(launch,time*.9999,physics).h>0);
      assert.ok(liquidMotion(launch,time*1.0001,physics).h<0);
      close(at.y,at.z*.24,1e-6);
    }
  }
  assert.equal(liquidImpactTime({h:0,vh:-4}),0);
  assert.equal(liquidImpactTime({}),0);
});

test('liquid helpers reject invalid values instead of silently emitting NaN geometry',()=>{
  for(const age of [-.1,NaN,Infinity])assert.throws(()=>liquidMotion({},age),RangeError);
  for(const launch of [{h:-1},{x:NaN},{vh:Infinity}]){
    assert.throws(()=>liquidMotion(launch,.1),RangeError);assert.throws(()=>liquidImpactTime(launch),RangeError);
  }
  for(const physics of [{gravity:0},{gravity:-4},{drag:-1},{depthScale:-1},{drag:NaN}]){
    assert.throws(()=>liquidMotion({},.1,physics),RangeError);assert.throws(()=>liquidImpactTime({},physics),RangeError);
  }
});

function shot(fx,t,opts={},padding=0){
  const [w,h]=fx.meta.size, f=createFrame(w+padding*2,h+padding*2,-padding,-padding);
  const p=painterFor(f);p.place(opts.x??fx.meta.origin[0],opts.y??fx.meta.origin[1],opts.flip??false,opts.angle??0);
  const o=resolveOptions(fx.meta,opts);fx.drawBack?.(p,t,o);fx.draw(p,t,o);return f;
}
function hash(fx,opts={}){
  const h=createHash('sha256');for(const t of [0,.07,.25,.5,.85,1]){
    const f=shot(fx,t,opts);h.update(new Uint8Array(f.color.buffer));h.update(new Uint8Array(f.light.buffer));
  }return h.digest('hex');
}
test('classic water jet remains byte-identical while default liquid output changes',()=>{
  assert.equal(hash(jet,{flowStyle:'classic'}),'79f421eb4514659576a0a70815a74818f7ba54941d283b99161708e1a109a5f8');
  assert.notEqual(hash(jet),hash(jet,{flowStyle:'classic'}));
});

test('liquid jet loops exactly, including broken necks and downstream beads',()=>{
  for(const opts of [{},{seed:2},{seed:8,palette:['#172944','#24b7a5','#ffffff']},{flip:true,angle:.3},{length:75}]){
    for(const t of [0,.07,.219,.5,.99]){
      const a=shot(jet,t,opts),b=shot(jet,t+jet.meta.duration,opts);
      assert.deepEqual(a.color,b.color);assert.deepEqual(a.light,b.light);
    }
  }
});

test('water effects are seekable, seeded, recolorable and return transparent terminal frames',()=>{
  for(const fx of [jet,crown]){
    for(const opts of [{},{seed:2},{seed:8,palette:['#15333f','#20e9c0','#f3ffff']},{flip:true,angle:.3}]){
      const a=shot(fx,.53,opts);shot(fx,1.3,opts);assert.deepEqual(shot(fx,.53,opts).color,a.color);
      assert.ok(a.color.some(c=>c>>>24));
      assert.ok(a.color.some(c=>(c>>>24)>0 && (c>>>24)<240),'water has continuous translucent coverage');
    }
    assert.notEqual(hash(fx),hash(fx,{seed:9}));
  }
  for(const t of [crown.meta.duration,crown.meta.duration+1]){
    const f=shot(crown,t);assert.ok(f.color.every(c=>c===0));assert.ok(f.light.every(c=>c===0));
  }
});

test('complete water animations remain inside declared color bounds for default and seed variants',()=>{
  for(const fx of [jet,crown])for(const seed of [fx.meta.options.seed,2,3,7])for(const flip of [false,true]){
    for(let i=0;i<=Math.round(fx.meta.duration*fx.meta.fps);i++){
      const f=shot(fx,i/fx.meta.fps,{seed,flip,x:flip?fx.meta.size[0]-fx.meta.origin[0]:fx.meta.origin[0]},24),[w,h]=fx.meta.size;
      f.color.forEach((c,j)=>{
        if(!(c>>>24))return;const x=j%f.w-24,y=Math.floor(j/f.w)-24;
        assert.ok(x>=0&&y>=0&&x<w&&y<h,`${fx.meta.name}, seed ${seed}, frame ${i}: ${x},${y}`);
      });
    }
  }
});

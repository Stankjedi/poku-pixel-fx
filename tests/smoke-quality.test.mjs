import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFrame, createFx, clearFrame, painterFor, resolveOptions } from '../build/core/fx.js';
import { smokeVolume, smokeCurl } from '../build/core/smoke.js';
import { fit } from '../build/core/color.js';
import * as plume from '../build/fx/weather/rising-smoke.js';
import * as bomb from '../build/fx/explosions/smoke-bomb.js';
const C = fit(['#24313b','#77949b','#d0dde1'],6);
const base = { x:0,y:0,rx:12,ry:15,density:1 };
function volume(cells,opts={},transform={}) {
  const f=createFrame(80,80); if(transform.dither) f.alphaMode='dither';
  const p=painterFor(f); p.place(40,40,transform.flip??false,transform.angle??0);
  smokeVolume(p,cells,C,opts); return f;
}
function shot(fx,t,opts={},padding=0) {
  const [w,h]=fx.meta.size,f=createFrame(w+padding*2,h+padding*2,-padding,-padding);
  const p=painterFor(f);p.place(...fx.meta.origin,opts.flip??false,opts.angle??0);
  fx.draw(p,t,resolveOptions(fx.meta,opts));return f;
}
function digest(mod, opts={}) {
  const f=createFrame(...mod.meta.size),fx=createFx(mod,{x:mod.meta.origin[0],y:mod.meta.origin[1],...opts}),h=createHash('sha256');
  for(let i=0;i<=mod.meta.duration*30;i++){if(i)fx.update(1/30);clearFrame(f);fx.draw(f);h.update(new Uint8Array(f.color.buffer));h.update(new Uint8Array(f.light.buffer));}
  return h.digest('hex');
}
function alphaSum(f) { return f.color.reduce((s,c)=>s+(c>>>24),0); }

test('smoke combines optical density before drawing, is translucent, and emits no light',()=>{
  const a=volume([base]), b=volume([{...base,density:2}]), double=volume([base,base]);
  assert.deepEqual(b.color,double.color,'overlapping densities equal one denser volume, not color overdraw');
  assert.ok(alphaSum(b)>alphaSum(a)); assert.ok(a.color.some(c=>(c>>>24)>0&&(c>>>24)<255));
  assert.ok(a.light.every(c=>c===0));assert.ok(b.light.every(c=>c===0));
  assert.deepEqual(volume([base],{}, {dither:true}).color,a.color,'smoke never becomes a Bayer checkerboard');
  assert.equal(alphaSum(volume([base],{opacity:0})),0);
});

test('smoke receives directional light without changing alpha and supports entrained air',()=>{
  const a=volume([base]), b=volume([base],{lightX:0.6,lightY:0.8});
  assert.notDeepEqual(a.color,b.color);
  assert.deepEqual(a.color.map(c=>c>>>24),b.color.map(c=>c>>>24));
  assert.equal(alphaSum(volume([base,{...base,density:-1}])),0);
  assert.ok(alphaSum(volume([base,{...base,rx:4,ry:5,density:-0.8}]))<alphaSum(a));
  for (const transform of [{flip:true},{angle:.37},{flip:true,angle:-.6}])
    assert.ok(alphaSum(volume([base],{},transform))>0);
});

test('curl authoring produces finite overlapping contributions and rejects invalid dimensions',()=>{
  const cells=[]; smokeCurl(cells,0,0,12,1,4.7,4,1);
  assert.equal(cells.length,15);assert.ok(alphaSum(volume(cells))>0);
  for(const c of cells)for(const n of Object.values(c))assert.ok(Number.isFinite(n));
  assert.throws(()=>smokeCurl([],0,0,12,1,4,0,1),RangeError);
  assert.throws(()=>smokeCurl([],0,0,12,1,4,2,1,129),RangeError);
  for(const cell of [{...base,rx:0},{...base,density:NaN},{...base,x:Infinity}])assert.throws(()=>volume([cell]),RangeError);
  assert.throws(()=>volume([base],{opacity:-1}),RangeError);
  assert.throws(()=>volume([{...base,rx:10000,ry:10000}]),RangeError);
  assert.equal(alphaSum(volume([])),0);
});

test('rising smoke is seekable and has an exact loop seam for seeds, recolors and transforms',()=>{
  for(const opts of [{},{seed:7,wind:-14,density:1.5},{seed:2,wind:22,turbulence:1.5},
    {palette:['#133','#8ca','#ffe'],flip:true,angle:.24},{turbulence:0}]){
    const first=shot(plume,0,opts),end=shot(plume,plume.meta.duration,opts);
    assert.deepEqual(first.color,end.color);assert.deepEqual(first.light,end.light);
    const at=shot(plume,1.27,opts);shot(plume,.4,opts);assert.deepEqual(at.color,shot(plume,1.27,opts).color);
    assert.ok(alphaSum(at)>0);assert.ok(at.light.every(c=>c===0));
  }
  assert.notDeepEqual(shot(plume,.8).color,shot(plume,.8,{seed:7}).color);
  assert.equal(alphaSum(shot(plume,1,{density:0})),0);
});

test('rising smoke fits its canvas for every frame, option extremes and seed variants',()=>{
  for(const opts of [{},{seed:2},{seed:7,wind:-14,turbulence:1.5},{seed:11,wind:22,turbulence:1.5},{flip:true}]){
    for(let i=0;i<120;i++){
      const f=shot(plume,i/30,opts,24),[w,h]=plume.meta.size;
      f.color.forEach((c,j)=>{if(!(c>>>24))return;const x=j%f.w-24,y=Math.floor(j/f.w)-24;
        assert.ok(x>=0&&y>=0&&x<w&&y<h,`plume ${JSON.stringify(opts)} frame ${i}: ${x},${y}`);});
    }
  }
});

test('smoke bomb classic mode preserves all 151 original color and light frames',()=>{
  assert.equal(digest(bomb,{smokeStyle:'classic'}),'71eec0dc559faebea37dbb05fc68685e91cf1e95fea13e295f43c78a22637246');
  assert.notEqual(digest(bomb),digest(bomb,{smokeStyle:'classic'}));
});

test('smoke bomb stays deterministic and ends empty after the final wisps',()=>{
  assert.equal(digest(bomb),digest(bomb));
  for(const opts of [{},{seed:2},{seed:7},{smokeStyle:'classic'}]){
    const fx=createFx(bomb,{x:bomb.meta.origin[0],y:bomb.meta.origin[1],...opts}),f=createFrame(...bomb.meta.size);
    for(let i=0;i<150;i++)fx.update(1/30);fx.draw(f);
    assert.ok(f.color.every(c=>c===0));assert.ok(f.light.every(c=>c===0));
  }
});

test('smoke bomb keeps its complete volume and wisps within the canvas across seeds and mirrors',()=>{
  const [w,h]=bomb.meta.size,margin=32,f=createFrame(w+margin*2,h+margin*2,-margin,-margin);
  for(const seed of [0,2,3,7,11])for(const flip of [false,true]){
    const fx=createFx(bomb,{seed,flip,x:flip?w-bomb.meta.origin[0]:bomb.meta.origin[0],y:bomb.meta.origin[1]});
    for(let i=0;i<=150;i++){
      if(i)fx.update(1/30);clearFrame(f);fx.draw(f);
      f.color.forEach((c,j)=>{if(!(c>>>24))return;const x=j%f.w-margin,y=Math.floor(j/f.w)-margin;
        assert.ok(x>=0&&y>=0&&x<w&&y<h,`bomb seed ${seed}, flip ${flip}, frame ${i}: ${x},${y}`);});
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrame,Painter} from '../build/core/index.js';
import {create,meta,timing,phoenixPoint} from '../build/fx/fire/emberwing-phoenix.js';
const fx=create(meta.options);
function frame(t,impl=fx){const f=createFrame(...meta.size),p=new Painter(f).place(...meta.origin);impl.draw(p,t);return f;}
test('new phoenix is deterministic and reverse-seekable with finite, exact empty endpoints',()=>{
 const a=frame(1.8);frame(4.8);frame(.2);assert.deepEqual(frame(1.8),a);
 for(const t of [0,meta.duration,meta.duration+.1]){const f=frame(t);assert.ok(f.color.every(x=>x===0));assert.ok(f.light.every(x=>x===0));}
 assert.ok(a.color.some(x=>x!==0));
});
test('detached flame wisps rise in the common field rather than following the changing wing',()=>{
 const e=fx.emitters.wisps;let count=0,up=0;
 for(const b of e.particles.filter(p=>p.born>.6&&p.born<2.2).slice(0,160)){
  const q=e.sample(b.born+Math.min(.22,b.life*.6)).find(p=>p.id===b.id);
  assert.ok(q);count++;if(q.y<b.y)up++;
 }
 assert.ok(count>100);assert.ok(up/count>.95,`upward fraction ${up/count}`);
});
test('dash endpoint and terminal emitters share the exact arrival clock and point',()=>{
 const c=phoenixPoint(0,-10,timing.impact);
 for(const name of ['blast','blastFire','afterburn']){
  const e=fx.emitters[name];assert.equal(e.sample(timing.impact-.001).length,0);
  assert.ok(e.particles.every(p=>p.born>=timing.impact));
  assert.ok(e.particles.every(p=>Math.hypot(p.x-c[0],p.y-c[1])<25));
  assert.ok(e.end<meta.duration);
 }
});
test('wing negative space is preserved in the native particle frame',()=>{
 const f=frame(1.8);let filled=0,total=0;
 for(let y=110;y<300;y++)for(let x=65;x<475;x++){total++;if(f.color[y*f.w+x]>>>24>90)filled++;}
 assert.ok(filled/total<.18,`opaque coverage ${filled/total}`);
 assert.ok(filled>1000);
});
test('a different seed changes particles without moving the authored dash destination',()=>{
 const other=create({...meta.options,seed:meta.options.seed+1,particleDensity:.2});
 assert.notDeepEqual(fx.emitters.hot.particles[0],other.emitters.hot.particles[0]);
 assert.deepEqual([other.emitters.blastFire.particles[0].x,other.emitters.blastFire.particles[0].y], [fx.emitters.blastFire.particles[0].x,fx.emitters.blastFire.particles[0].y]);
});

test('bird material never paints long anatomical guide paths',()=>{
 const f=createFrame(...meta.size),p=new Painter(f).place(...meta.origin),original=p.path;let longPaths=0;
 p.path=function(points,...args){if(points.length>8)longPaths++;return original.call(this,points,...args);};
 fx.draw(p,1.8);assert.equal(longPaths,0);
});
test('birthplaces occupy anatomical areas instead of one repeated centerline',()=>{
 const frames=fx.emitters.hot.particles.slice(100,500).map(b=>fx.sourceFrame(b.born,b.id,b.u));
 assert.ok(frames.filter(f=>Math.abs(f.cross)>1).length>frames.length*.35);
 assert.ok(frames.some(f=>f.cross< -2)&&frames.some(f=>f.cross>2));
 assert.ok(new Set(frames.map(f=>Math.floor(f.role*8))).size>=7);
 const b=fx.emitters.hot.particles;assert.ok(Math.max(...b.map(p=>p.size))-Math.min(...b.map(p=>p.size))>4);
 assert.ok(Math.max(...b.map(p=>p.life))-Math.min(...b.map(p=>p.life))>.20);
});

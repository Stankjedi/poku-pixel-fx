import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fractureGlass, glassShardPath, glassVertices, createFrame, createFx, clearFrame } from '../build/core/index.js';
import * as glass from '../build/fx/impacts/glass-shatter.js';
import { loadEffect, renderFrames, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
const bounds = { left: -28, top: -66, right: 28, bottom: -3 }, point = [-8, -37];
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const inside=(poly,x,y)=>poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-7});

test('glass spiderweb cells fit the pane exactly and originate from the impact',()=>{
  for(const seed of [1,7,23,71]) {
    const mesh=fractureGlass(bounds,point,{seed,spokes:12,rings:2});
    near(mesh.cells.reduce((s,c)=>s+c.area,0),(bounds.right-bounds.left)*(bounds.bottom-bounds.top));
    assert.ok(mesh.cells.length>=24);
    for(const c of mesh.cells){
      assert.ok(c.area>0); assert.ok(inside(c.polygon,...c.center));
      for(const [x,y] of c.polygon)assert.ok(x>=bounds.left-1e-8&&x<=bounds.right+1e-8&&y>=bounds.top-1e-8&&y<=bounds.bottom+1e-8);
      if(c.ring===0) assert.ok(c.polygon.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-8));
    }
    for(let y=bounds.top+.173;y<bounds.bottom;y+=1.119)for(let x=bounds.left+.137;x<bounds.right;x+=1.127)
      assert.equal(mesh.cells.filter(c=>inside(c.polygon,x,y)).length,1,'one owner per source point');
    const keys=mesh.cracks.map(edge=>edge.map(p=>p.map(v=>v.toFixed(6)).join(',')).sort().join('|'));
    assert.equal(new Set(keys).size,keys.length,'shared cracks are drawn once');
    assert.ok(Object.isFrozen(mesh)&&Object.isFrozen(mesh.cells[0].polygon[0]));
  }
});
test('glass topology is seeded, bounded and does not mutate inputs',()=>{
  const input=structuredClone(bounds), impact=[...point];
  assert.deepEqual(fractureGlass(bounds,point),fractureGlass(bounds,point));
  assert.notDeepEqual(fractureGlass(bounds,point),fractureGlass(bounds,point,{seed:2}));
  assert.deepEqual(bounds,input);assert.deepEqual(point,impact);
  for(const options of [{seed:NaN},{seed:1e8},{spokes:5},{spokes:33},{spokes:8.2},{rings:0},{rings:6}])assert.throws(()=>fractureGlass(bounds,point,options),RangeError);
  for(const p of [[-28,-20],[30,-40],[0,NaN],[]])assert.throws(()=>fractureGlass(bounds,p),RangeError);
  assert.throws(()=>fractureGlass({...bounds,right:-28},point),RangeError);
});
test('thin shards turn edge-on, collide at the real supporting point, and settle without floor penetration',()=>{
  const shape=[[-10,-2],[12,-3],[-7,5]], launch={x:0,y:-50,vx:76,vy:-40,spin:3,tumbleSpeed:8};
  const path=glassShardPath(shape,launch), frozen=path.sample(.17);
  assert.ok(path.impacts.length>=1&&path.impacts.length<=3);
  for(let i=0;i<900;i++){
    const pose=path.sample(i/360),v=glassVertices(shape,pose);
    assert.ok(v.every(p=>p[1]<=1e-7),`no penetration at ${i/360}`);
  }
  for(const h of path.impacts){
    const v=glassVertices(shape,path.sample(h.time));
    assert.ok(v.some(p=>Math.hypot(p[0]-h.x,p[1]-h.y)<1e-6),'actual contacting vertex');
    assert.ok(h.speed>0);assert.equal(h.y,0);
  }
  const end=path.sample(2.5);assert.ok(end.resting);near(end.flatten,.16);near(end.vx,0);near(end.vy,0);
  assert.deepEqual(path.sample(.17),frozen);assert.deepEqual(path.sample(5),end);
  assert.deepEqual(path.impacts,glassShardPath(shape,launch).impacts);
  const flat=glassVertices(shape,{...frozen,angle:0,tumble:Math.PI/2,flatten:1});
  assert.ok(Math.max(...flat.map(p=>p[0]))-Math.min(...flat.map(p=>p[0]))<1e-8,'pane can turn edge-on');
  const original=path.sample(.17);original.x=1e4;assert.notEqual(path.sample(.17).x,1e4);
});
test('glass path rejects invalid bakes and samples',()=>{
  const shape=[[-1,-2],[1,2]],launch={x:0,y:-12,vx:40,vy:-20};
  for(const opts of [{duration:0},{duration:13},{gravity:0},{drag:-1},{bounce:1},{friction:-1},{ground:Infinity}])assert.throws(()=>glassShardPath(shape,launch,opts),RangeError);
  for(const t of [-1,NaN,Infinity])assert.throws(()=>glassShardPath(shape,launch).sample(t),RangeError);
  assert.throws(()=>glassShardPath([],launch),RangeError);
  assert.throws(()=>glassShardPath(shape,{...launch,spin:NaN}),RangeError);
});
function shot(time,options={},fps=120,pad=0){
  const [w,h]=glass.meta.size,f=createFrame(w+pad*2,h+pad*2,-pad,-pad),fx=createFx(glass,{x:glass.meta.origin[0],y:glass.meta.origin[1],...options});
  const steps=Math.round(time*fps);if(steps)for(let i=0;i<steps;i++)fx.update(time/steps);fx.draw(f);return f;
}
const hash=f=>createHash('sha256').update(new Uint8Array(f.color.buffer)).digest('hex');
test('glass animation preserves transparency, never emits light and is frame partition independent',()=>{
  for(const t of [.1,.3,.4,.6,.9,1.3,2.3]){
    const f=shot(t);assert.ok(f.light.every(c=>c===0),'reflected highlights are not glowing gas');
    assert.equal(hash(f),hash(shot(t)));
    for(const fps of [30,60,144])assert.equal(hash(f),hash(shot(t,{},fps)));
  }
  const face=shot(.1);const center=(glass.meta.origin[1]-30)*face.w+glass.meta.origin[0];
  assert.ok(face.color[center]>>>24>20&&face.color[center]>>>24<100,'pane face stays translucent');
  assert.notEqual(hash(shot(.7)),hash(shot(.7,{seed:2})));
  assert.notEqual(hash(shot(.7)),hash(shot(.7,{palette:['#34272c','#97746a','#fff5df']})));
  for(const t of [glass.meta.duration,glass.meta.duration+1])assert.ok(shot(t).color.every(c=>c===0));
});
test('contact metadata and crack onset share the exact glass strike time',()=>{
  const fx=createFx(glass,{force:1.3});assert.equal(fx.contacts.length,1);const c=fx.contacts[0];
  assert.equal(c.at,glass.GLASS_CONTACT_TIME);assert.equal(c.material,'glass');assert.equal(c.strength,1.3);assert.deepEqual(c.position,point);
  assert.deepEqual(fx.shake,[0,0],'glass does not silently add heavy camera shake');
  assert.equal(hash(shot(.1)),hash(shot(.299)),'pane is still intact before contact');
  assert.notEqual(hash(shot(.299)),hash(shot(.3)),'strike begins on the contact frame');
});
test('all glass frames stay in raw declared bounds across seeds, force and mirror extremes',()=>{
  for(const options of [{},{seed:2},{seed:7},{seed:9,spokes:18,force:1.35},{seed:13,spokes:8,force:.5},{flip:true}]){
    const [w,h]=glass.meta.size,pad=24,f=createFrame(w+pad*2,h+pad*2,-pad,-pad),fx=createFx(glass,{x:glass.meta.origin[0],y:glass.meta.origin[1],...options});
    for(let i=0;i<=Math.round(glass.meta.duration*30);i++){
      if(i)fx.update(1/30);clearFrame(f);fx.draw(f);
      for(let j=0;j<f.color.length;j++)if(f.color[j]>>>24){const x=j%f.w-pad,y=Math.floor(j/f.w)-pad;assert.ok(x>=0&&y>=0&&x<w&&y<h,`seed ${options.seed} frame ${i}: ${x},${y}`);}
    }
  }
});
test('glass exports fixed pivot, glass material and exact contact under mirroring',async()=>{
  const effect=await loadEffect('impacts/glass-shatter'),r=renderFrames(effect,{options:{flip:true,cameraMotion:0}}),s=spriteSheet(effect,r,'glass-shatter');
  const contact=s.json.meta.pokuFx.contacts[0];assert.equal(contact.at,glass.GLASS_CONTACT_TIME);assert.equal(contact.material,'glass');assert.deepEqual(contact.position,[8,-37]);assert.deepEqual(contact.normal,[1,0]);
  assert.ok(r.frames.at(-1).clear.every(v=>v===0),'terminal export frame is empty');
});

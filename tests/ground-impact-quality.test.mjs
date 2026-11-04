import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroundImpact, impactKick2D, defineImpactContact2D, transformImpactContact2D, impactContactAge2D,
  createFx, createAct, createFrame, clearFrame, Painter, fit, sceneCameraOffset, flightEndpointAtContact } from '../build/core/index.js';
import { loadEffect, renderFrames, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
import * as salvo from '../build/fx/projectiles/missile-salvo.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const palette=fit(salvo.meta.options.ground,6);
const contact=()=>defineImpactContact2D({id:'hit',at:1.1,position:[12,-4],normal:[0,-3],material:'stone',strength:1,radius:22});

test('contact descriptors copy/freeze inputs, normalize normals, and reject malformed facts',()=>{
  const position=[12,-4],normal=[0,-3],c=defineImpactContact2D({...contact(),position,normal});position[0]=88;normal[0]=9;
  assert.deepEqual(c.position,[12,-4]);assert.deepEqual(c.normal,[0,-1]);assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.position)&&Object.isFrozen(c.normal));
  for(const overrides of [{id:''},{at:-1},{at:NaN},{position:[0,Infinity]},{normal:[0,0]},{radius:0},{strength:-1},{material:''}])assert.throws(()=>defineImpactContact2D({...contact(),...overrides}),RangeError);
  close(impactContactAge2D(c,1.1),0);assert.equal(impactContactAge2D(c,1.1-1e-10),0);assert.ok(impactContactAge2D(c,1)<0);
});
test('contact mirror/rotation preserves unit normal and world anchor independently of translation',()=>{
  const c=transformImpactContact2D(contact(),{x:30,y:20,flip:true,angle:Math.PI/2});
  close(c.position[0],34);close(c.position[1],8);close(c.normal[0],1);close(c.normal[1],0);
  assert.equal(c.at,contact().at);assert.equal(c.material,'stone');assert.equal(c.radius,22);
});
test('ground impulse travels outward, rings down, and has no pre-hit/terminal displacement',()=>{
  const g=createGroundImpact({seed:7});
  assert.equal(g.displacement(12,-.1),0);assert.equal(g.displacement(12,g.duration),0);
  assert.equal(g.displacement(55,.02),0);assert.ok(g.displacement(12,.08)<-3);assert.ok(g.displacement(35,.2)<-1);
  assert.ok(Math.abs(g.displacement(12,1))<1);assert.equal(g.displacement(100,.2),0);
  assert.equal(createGroundImpact({strength:0}).displacement(12,.1),0);
});
test('mineral pieces collide, bounce and settle without tunneling; materials change response',()=>{
  const stone=createGroundImpact({seed:17,material:'stone'}),soil=createGroundImpact({seed:17,material:'soil'});
  assert.equal(stone.chunks.length,12);assert.ok(stone.chunks.every(q=>q.path.impacts.length>0));
  assert.notDeepEqual(stone.chunks.map(q=>q.path.impacts),soil.chunks.map(q=>q.path.impacts));
  for(const q of stone.chunks)for(let t=0;t<2.1;t+=1/120){
    const s=q.path.sample(t),c=Math.cos(s.angle),n=Math.sin(s.angle);
    assert.ok(q.vertices.every(([x,y])=>s.y+x*n+y*c<1e-8));
  }
  assert.ok(stone.chunks.every(q=>q.path.sample(2.1).resting));
});
function drawGround(g,t,layer){const f=createFrame(240,160),p=new Painter(f).place(120,110,true,.15);g.draw(p,t,layer,{palette});return f;}
test('ground draws preserve parent painter state, layer separation, seekability and no emitted stone light',()=>{
  const g=createGroundImpact({seed:12}),f=createFrame(240,160),p=new Painter(f).place(120,110,true,.15);p.fade=.4;p.lightK=.3;
  const before=[p.tx,p.ty,p.fx,p.cs,p.sn,p.fade,p.lightK];g.draw(p,.16,'front',{palette});assert.deepEqual(before,[p.tx,p.ty,p.fx,p.cs,p.sn,p.fade,p.lightK]);
  const a=drawGround(g,.25,'back');drawGround(g,1.2,'front');assert.deepEqual(a.color,drawGround(g,.25,'back').color);
  assert.notDeepEqual(a.color,drawGround(g,.25,'front').color);assert.ok(a.light.every(v=>v===0));
  assert.ok(drawGround(g,-1,'back').color.every(v=>v===0));assert.ok(drawGround(g,g.duration,'front').color.every(v=>v===0));
  for(const opts of [{radius:0},{radius:Infinity},{strength:-1},{strength:3},{duration:0},{material:'metal'},{direction:2}])assert.throws(()=>createGroundImpact(opts),RangeError);
});
test('camera impulses are seeded/pure, zero outside their support, and support reduced motion',()=>{
  assert.deepEqual(impactKick2D(-.1),[0,0]);assert.deepEqual(impactKick2D(.55),[0,0]);assert.deepEqual(impactKick2D(.02,0),[0,0]);
  assert.notDeepEqual(impactKick2D(0,1,1),impactKick2D(0,1,2));
  assert.deepEqual(sceneCameraOffset([3,-2],true),[0,0]);assert.deepEqual(sceneCameraOffset([3,-2],false,true),[0,0]);
  assert.deepEqual(sceneCameraOffset([2.6,-1.6]),[3,-2]);
  const fx=createFx(salvo);fx.update(salvo.missileContacts[0].at);const first=fx.shake;assert.notDeepEqual(first,[0,0]);assert.deepEqual(first,fx.shake);
  const still=createFx(salvo,{cameraMotion:0});still.update(fx.t);assert.deepEqual(still.shake,[0,0]);
  const a=createFrame(...salvo.meta.size),b=createFrame(...salvo.meta.size);fx.draw(a);still.draw(b);assert.deepEqual(a.color,b.color);assert.deepEqual(a.light,b.light);
  fx.stop();fx.update(.3);assert.deepEqual(fx.shake,[0,0]);
  const legacy=createFx({meta:{duration:1},draw(){}});assert.deepEqual(legacy.shake,[0,0]);assert.deepEqual(legacy.contacts,[]);
});
test('camera hook validation, looping and contact option resolution are predictable',()=>{
  const mod={meta:{duration:1,loop:true,options:{point:2}},draw(){},contacts:o=>[defineImpactContact2D({...contact(),position:[o.point,0]})],cameraShake:t=>[t,2]};
  const fx=createFx(mod,{point:9,cameraMotion:2});fx.update(1.75);assert.deepEqual(fx.shake,[2,4]);assert.deepEqual(fx.contacts[0].position,[9,0]);
  assert.throws(()=>createFx({...mod,cameraShake:()=>[NaN,0]}).shake,RangeError);
  assert.throws(()=>createFx(mod,{cameraMotion:NaN}).shake,RangeError);
});
test('salvo contacts own exactly the authored landing times and ground anchors',()=>{
  const fx=createFx(salvo);assert.deepEqual(fx.contacts,salvo.missileContacts);
  for(const [i,c]of fx.contacts.entries()){close(c.at,salvo.missileTimings[i].launch+salvo.missileTimings[i].flight);assert.deepEqual(c.position,[salvo.missileTimings[i].target,0]);assert.deepEqual(c.normal,[0,-1]);}
});
test('preview camera moves opaque scene only; raw/transparent exports and fixed pivots are identical',async()=>{
  const fx=await loadEffect('projectiles/missile-salvo'),moving=renderFrames(fx,{fps:10}),still=renderFrames(fx,{fps:10,cameraMotion:0});
  assert.equal(moving.frames.length,still.frames.length);
  assert.ok(moving.frames.some((f,i)=>!Buffer.from(f.color).equals(Buffer.from(still.frames[i].color))));
  for(const [i,f]of moving.frames.entries()){assert.deepEqual(f.clear,still.frames[i].clear);assert.deepEqual(f.raw,still.frames[i].raw);assert.deepEqual(f.light,still.frames[i].light);}
  const bare=renderFrames(fx,{fps:10,bg:'none'});for(const f of bare.frames)assert.deepEqual(f.color,f.clear);
  const a=spriteSheet(fx,moving,'salvo'),b=spriteSheet(fx,still,'salvo');assert.deepEqual(a.png,b.png);assert.deepEqual(a.json.meta.pokuFx.contacts,salvo.missileContacts);
  assert.deepEqual(a.json.meta.pokuFx.pivot,salvo.meta.origin);
});
test('salvo ground controls resolve bounded contacts without modifying fire or legacy defaults',()=>{
  const soil=createFx(salvo,{groundMaterial:'soil',impactStrength:99});assert.ok(soil.contacts.every(c=>c.material==='soil'&&c.strength===1.3));
  const off=createFx(salvo,{impactStrength:0});off.update(1.08);assert.deepEqual(off.shake,[0,0]);
  assert.throws(()=>createFx(salvo,{impactStrength:NaN}),RangeError);assert.throws(()=>createFx(salvo,{groundMaterial:'metal'}),RangeError);
});
test('strongest salvo surface response fits native color bounds for multiple materials and mirrors',()=>{
  const [w,h]=salvo.meta.size,m=24;
  for(const seed of [0,7,23,128])for(const groundMaterial of ['stone','soil'])for(const flip of [false,true]){
    const f=createFrame(w+2*m,h+2*m,-m,-m),fx=createFx(salvo,{x:flip?w-salvo.meta.origin[0]:salvo.meta.origin[0],y:salvo.meta.origin[1],seed,flip,groundMaterial,impactStrength:1.3});
    let last=0;for(let k=0;k<=56;k++){const t=1+k*.05;fx.update(t-last);last=t;fx.draw(clearFrame(f));
      for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
        if(y>=m&&y<h+m&&x===m){x+=w-1;continue;}
        assert.equal(f.color[y*f.w+x]>>>24,0,`${seed}/${groundMaterial}/${flip} at ${t}: ${x-m},${y-m}`);
      }
    }
  }
});
test('exported contacts follow mirror/rotation relative to the actual chosen sprite pivot',async()=>{
  const source=await loadEffect('projectiles/missile-salvo');
  // A short synthetic module isolates metadata placement without rerendering a complete salvo.
  const fx={...source,meta:{...source.meta,duration:.1},mod:{...source.mod,meta:{...source.meta,duration:.1}}};
  const rendered=renderFrames(fx,{fps:10,options:{x:120,y:180,flip:true,angle:Math.PI/2}});
  const sheet=spriteSheet(fx,rendered,'rotated');assert.deepEqual(sheet.json.meta.pokuFx.pivot,[120,180]);
  const exported=sheet.json.meta.pokuFx.contacts;
  close(exported[0].position[0],0);close(exported[0].position[1],24);close(exported[0].normal[0],1);close(exported[0].normal[1],0);
  assert.deepEqual(createFx(salvo,{flip:true,angle:Math.PI/2}).contacts[0].position,[-24,0]);
});

test('authored scene feedback replaces rather than doubles act shake, and reduced motion covers both',()=>{
  const mod={meta:{duration:1},draw(){},act:{poses:[[0,{}],[1,{}]],hits:[{t:.1,shake:.5,amp:12,target:false}]},cameraShake:()=>[3,4]};
  const act=createAct(mod);act.update(.15);assert.deepEqual(act.shake,[3,4]);
  const windup=createAct({...mod,act:{...mod.act,poses:[[-.3,{}],[1,{}]]}});assert.deepEqual(windup.shake,[0,0]);windup.update(.4);assert.deepEqual(windup.shake,[3,4]);
  const still=createAct(mod,{cameraMotion:0});still.update(.15);assert.deepEqual(still.shake,[0,0]);
  const legacy={...mod};delete legacy.cameraShake;
  const classic=createAct(legacy),quiet=createAct(legacy,{cameraMotion:0});classic.update(.15);quiet.update(.15);
  assert.notDeepEqual(classic.shake,[0,0]);assert.deepEqual(quiet.shake,[0,0]);
});
test('padded exports include margin in the pivot, without translating local contact descriptors',async()=>{
  const source=await loadEffect('projectiles/missile-salvo');
  const fx={...source,meta:{...source.meta,duration:.1},mod:{...source.mod,meta:{...source.meta,duration:.1}}};
  const rendered=renderFrames(fx,{fps:10,margin:3,options:{x:120,y:180}}),sheet=spriteSheet(fx,rendered,'padded');
  assert.deepEqual(sheet.json.meta.pokuFx.pivot,[123,183]);assert.deepEqual(sheet.json.meta.pokuFx.contacts[0].position,[-24,0]);
});
test('actual missile nose support reaches its contact exactly, and no metal pixels penetrate earlier',()=>{
  for(const [i,path]of salvo.missilePaths.entries()){
    const pose=path.atDistance(1),contact=salvo.missileContacts[i];
    close(pose.x+pose.dx*10-pose.dy*.5,contact.position[0]);close(pose.y+pose.dy*10+pose.dx*.5,contact.position[1]);
    for(const delta of [1/30,1/120,.001,.000001]){
      const f=createFrame(...salvo.meta.size),fx=createFx(salvo,{x:232,y:204,metal:['#ff00ff']});fx.update(contact.at-delta);fx.draw(f);
      for(let y=204;y<f.h;y++)for(let x=0;x<f.w;x++)assert.notEqual(f.color[y*f.w+x]>>>0,0xffff00ff,`missile ${i} delta ${delta}: ${x},${y}`);
    }
  }
  assert.throws(()=>flightEndpointAtContact([0,0],[0,0],[10,.5]),RangeError);
  assert.throws(()=>flightEndpointAtContact([0,0],[NaN,0],[10,.5]),RangeError);
});

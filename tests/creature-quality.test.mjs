import test from 'node:test';
import assert from 'node:assert/strict';
import {creatureRig2D,renderCreature2D,renderCreatureCanvas2D,drawCreature2D,createFrame,Painter,hex} from '../build/core/index.js';
const species=['fox','cat','owl','dragon'];
const motions=q=>q==='fox'||q==='cat'?['idle','walk','trot']:['idle','fly'];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const near=(a,b,eps=1e-8)=>assert(Math.abs(a-b)<eps,`${a} != ${b}`);
function count(sp){return sp.mask.data.reduce((a,b)=>a+b,0);}
test('quadrupeds and flyers have separate anatomy, not mapped humanoid limbs',()=>{
 for(const q of species){const r=creatureRig2D({species:q});assert.equal(r.legs.length,q==='fox'||q==='cat'?4:0);assert.equal(r.wings.length,q==='fox'||q==='cat'?0:2);assert.equal(r.tail.length,13);assert(r.head[0]>r.root[0]);assert(r.tail.at(-1)[0]<r.root[0]);}
});
test('leg and wing bone lengths remain constant at every sampled phase and size',()=>{
 for(const q of species)for(const m of motions(q))for(const size of[32,96,192])for(let i=0;i<90;i++){
  const r=creatureRig2D({species:q,size},m,i/30);
  for(const l of r.legs){near(dist(l.root,l.joint),l.lengths[0]);near(dist(l.joint,l.ankle),l.lengths[1]);near(dist(l.ankle,l.toe),l.lengths[2]);}
  for(const w of r.wings){near(dist(w.shoulder,w.elbow),w.lengths[0]);near(dist(w.elbow,w.wrist),w.lengths[1]);}
 }
});
test('walk is four-beat and trot uses diagonal pairs, never a humanoid two-foot gait',()=>{
 const leg=(r,name)=>r.legs.find(l=>l.name===name);
 for(const q of['fox','cat'])for(let i=0;i<100;i++){
  const walk=creatureRig2D({species:q},'walk',i/50),trot=creatureRig2D({species:q},'trot',i/50);
  assert.equal(new Set(walk.legs.map(l=>Math.round(l.phase*1000))).size,4);
  assert(walk.legs.filter(l=>l.contact).length>=3);
  near(leg(trot,'nearFront').phase,leg(trot,'farHind').phase);
  near(leg(trot,'farFront').phase,leg(trot,'nearHind').phase);
  assert(trot.legs.filter(l=>l.contact).length>=2);
 }
});
test('stance toes stay on the ground and adding travel speed prevents foot sliding',()=>{
 for(const q of['fox','cat'])for(const motion of['walk','trot'])for(const size of[32,96,192])for(let i=0;i<200;i++){
  const t=i/100,r=creatureRig2D({species:q,size},motion,t),next=creatureRig2D({species:q,size},motion,t+.001);
  for(let j=0;j<r.legs.length;j++){const a=r.legs[j],b=next.legs[j];if(a.contact){near(a.toe[1],-size/96);if(b.contact&&b.phase>a.phase)near(a.toe[0]+r.travelSpeed*t,b.toe[0]+next.travelSpeed*(t+.001));}else assert(a.toe[1]<=-size/96+1e-10);}
 }
});
test('all motions are seekable, deterministic, exactly looping in pixels and keep atlas bounds',()=>{
 for(const q of species)for(const m of motions(q)){
  const period=creatureRig2D({species:q},m).period,base=renderCreature2D({species:q},m);
  for(const t of[0,.125,.5,1]){const a=renderCreature2D({species:q},m,t),b=renderCreature2D({species:q},m,t+period);assert.deepEqual(a.pixels,b.pixels);assert.deepEqual([a.x,a.y,a.w,a.h],[base.x,base.y,base.w,base.h]);assert.deepEqual(a,renderCreature2D({species:q},m,t));}
 }
});
test('reduced motion is a static supported resting pose with no travel speed',()=>{
 for(const q of species)for(const m of motions(q)){const a=renderCreature2D({species:q},m,0,{reducedMotion:true}),b=renderCreature2D({species:q},m,913,{reducedMotion:true});assert.deepEqual(a,b);assert.equal(a.rig.travelSpeed,0);}
});
test('all native sizes retain nonempty, opaque pixel materials inside conservative bounds',()=>{
 for(const q of species)for(const size of[32,48,64,96,192])for(const m of motions(q))for(const t of[0,.375,.75,1.125]){
  const sp=renderCreature2D({species:q,size},m,t);assert(count(sp)>size);
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){const i=y*sp.w+x,c=sp.pixels[i];assert.equal(sp.mask.data[i],c?1:0);if(c){assert.equal(c>>>24,255);assert(x>0&&y>0&&x<sp.w-1&&y<sp.h-1,`${q} ${m} ${size} ${t} clipped`);}}
 }
});
test('connected color masses remain one 8-connected silhouette at native sizes',()=>{
 for(const q of species)for(const size of[32,64,96])for(const m of motions(q))for(const t of[0,.375,.75,1.125]){
  const sp=renderCreature2D({species:q,size},m,t),start=sp.pixels.findIndex(Boolean),seen=new Set([start]),stack=[start];
  while(stack.length){const k=stack.pop(),x=k%sp.w,y=Math.floor(k/sp.w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,v=yy*sp.w+xx;if(xx>=0&&xx<sp.w&&yy>=0&&yy<sp.h&&sp.pixels[v]&&!seen.has(v)){seen.add(v);stack.push(v);}}}
  assert.equal(seen.size,count(sp),`${q} ${m} size ${size} time ${t}: detached pixels`);
 }
});
test('an optional contour touches only external empty cells and preserves every material pixel',()=>{
 for(const q of species){const a=renderCreature2D({species:q},motions(q).at(-1),.375),b=renderCreature2D({species:q,outline:'#ff00ff'},motions(q).at(-1),.375);for(let i=0;i<a.pixels.length;i++){if(a.pixels[i])assert.equal(a.pixels[i],b.pixels[i]);else if(b.pixels[i]){assert.equal(b.pixels[i],hex('#ff00ff')>>>0);assert(a.pixels[i-1]||a.pixels[i+1]||a.pixels[i-a.w]||a.pixels[i+a.w]);}}}
});
test('facing mirrors whole pixel cells exactly and preserves anatomy identity',()=>{
 for(const q of species){const a=renderCreature2D({species:q},motions(q).at(-1),.375),b=renderCreature2D({species:q,facing:'left'},motions(q).at(-1),.375);assert.equal(b.x,-a.x-a.w);for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++)assert.equal(a.pixels[y*a.w+x],b.pixels[y*a.w+a.w-x-1]);near(a.rig.head[0],-b.rig.head[0]);}
});
test('Painter placement and mirror are honored without light leakage',()=>{
 const a=createFrame(400,300),b=createFrame(400,300),p=new Painter(a),q=new Painter(b);p.place(200,200);q.place(200,200,true);drawCreature2D(p,{species:'dragon'},'fly',.375);drawCreature2D(q,{species:'dragon'},'fly',.375);
 for(let y=0;y<300;y++)for(let x=0;x<400;x++)assert.equal(a.color[y*400+x],b.color[y*400+399-x]);assert(a.light.every(n=>n===0));
});
test('all public invalid values fail before allocation or silent fallback',()=>{
 for(const style of[{species:'horse'},{size:31},{size:193},{size:NaN},{facing:'back'},{body:['#fff']},{body:Array(3)},{accent:['#fff',,'#abc']},{outline:'bad'}])assert.throws(()=>renderCreature2D(style));
 for(const t of[NaN,Infinity,1e10])assert.throws(()=>creatureRig2D({},'walk',t));
 for(const [species,m]of[['fox','fly'],['cat','flap'],['owl','walk'],['dragon','trot']])assert.throws(()=>renderCreature2D({species},m));
 assert.throws(()=>renderCreature2D({},'walk',0,{reducedMotion:'yes'}));
});
test('tail tips lag the body and wing elbows flex instead of rotating one rigid triangle',()=>{
 const a=creatureRig2D({species:'dragon'},'fly',.1),b=creatureRig2D({species:'dragon'},'fly',1.05);
 assert.notEqual(a.tail.at(-1)[1]-a.root[1],b.tail.at(-1)[1]-b.root[1]);
 const bend=r=>{const w=r.wings[1];return Math.atan2(w.wrist[1]-w.elbow[1],w.wrist[0]-w.elbow[0])-Math.atan2(w.elbow[1]-w.shoulder[1],w.elbow[0]-w.shoulder[0]);};
 assert(Math.abs(bend(a)-bend(b))>.1);
});

test('wing paths stay continuous through upstroke/downstroke and exact loop boundaries',()=>{
 for(const species of['owl','dragon'])for(const t of[0,.75,1.5]){
  const a=creatureRig2D({species},'fly',t-1e-5),b=creatureRig2D({species},'fly',t+1e-5);
  for(let i=0;i<2;i++)for(const key of['shoulder','elbow','wrist'])assert(dist(a.wings[i][key],b.wings[i][key])<.01);
  for(let i=0;i<6;i++)assert(dist(a.wings[1].tips[i],b.wings[1].tips[i])<.02);
 }
});

test('custom ramps support 3–6 colors, richer large-size shading and explicit bounds',()=>{
 const body=['#313a61','#475b7d','#6889a2','#8cb4c0','#bdd6d1','#e9edd7'];
 for(const species of['fox','cat','owl','dragon'])for(const n of[3,4,5,6])for(const size of[32,64,96]){
  const sp=renderCreature2D({species,size,body:body.slice(0,n),accent:body.slice(0,n)});assert(count(sp)>size);
 }
 for(const body of[[],['#fff','#ccc'],Array(7).fill('#fff')])assert.throws(()=>renderCreature2D({body}));
 const compact=renderCreature2D({species:'fox',size:96,body:[body[0],body[2],body[5]]}),rich=renderCreature2D({species:'fox',size:96,body});
 assert(new Set(rich.pixels).size>new Set(compact.pixels).size);
});

test('64/128/256 canvases contain exact native pixels, never independent fit scaling',()=>{
 for(const side of[64,128,256])for(const species of['fox','cat','owl','dragon'])for(const t of[0,.375,.75,1.125]){
  const motion=species==='fox'?'walk':species==='cat'?'trot':'fly',style={species,size:side/2},q=renderCreatureCanvas2D(style,motion,t,{width:side,height:side}),sp=renderCreature2D(style,motion,t);
  assert.equal(q.w,side);assert.equal(q.h,side);assert.equal(q.sourcePixelsPerScenePixel,1);assert.equal(q.mask.data.reduce((a,b)=>a+b,0),count(sp));
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++)if(sp.pixels[y*sp.w+x])assert.equal(q.pixels[(sp.y+y+q.pivot[1])*side+sp.x+x+q.pivot[0]],sp.pixels[y*sp.w+x]);
 }
 assert.throws(()=>renderCreatureCanvas2D({species:'dragon',size:96},'fly',.375,{width:64,height:64}),/exceeds/);
 for(const canvas of[{width:0,height:64},{width:64.5,height:64},{width:2048,height:2048},{width:64,height:64,pivot:[1.5,50]}])assert.throws(()=>renderCreatureCanvas2D({},'idle',0,canvas));
});
test('different canvas sizes place the same physical creature identically in one scene grid',()=>{
 const style={species:'fox',size:32},a=renderCreatureCanvas2D(style,'walk',.25,{width:64,height:64,pivot:[42,48]}),b=renderCreatureCanvas2D(style,'walk',.25,{width:128,height:128,pivot:[84,96]});
 const points=q=>{const out=[];for(let y=0;y<q.h;y++)for(let x=0;x<q.w;x++)if(q.pixels[y*q.w+x])out.push([x-q.pivot[0],y-q.pivot[1],q.pixels[y*q.w+x]]);return out;};
 assert.deepEqual(points(a),points(b));
});

test('near quadruped limbs keep the same fur base through joints without bright bone stripes',()=>{
 const body=['#463424','#906040','#e0c0a0'],mid=hex(body[1])>>>0,bright=hex(body[2])>>>0;
 for(const species of['fox','cat'])for(const size of[64,96,128])for(const motion of['idle','walk','trot'])for(const t of[0,.125,.375,.75,1.125]){
  const sp=renderCreature2D({species,size,body},motion,t);
  for(const l of sp.rig.legs.filter(l=>l.name.startsWith('near'))){
   const x=Math.round(l.root[0]+(l.joint[0]-l.root[0])*.65),y=Math.round(l.root[1]+(l.joint[1]-l.root[1])*.65);
   assert.equal(sp.pixels[(y-sp.y)*sp.w+x-sp.x],mid,`${species}/${size}/${motion}/${t} shared coat at ${l.name}`);
  }
  assert(!sp.pixels.includes(bright),'raw highlight extreme must not become luminous anatomy lines');
 }
});
test('wing joints and tail do not paint maximum-brightness structural lines',()=>{
 const body=['#304530','#608060','#c0f0c0'],accent=['#654060','#906b86','#f0c0e0'];
 for(const species of['owl','dragon'])for(const size of[32,64,96,128])for(const t of[0,.375,.75,1.125]){
  const sp=renderCreature2D({species,size,body,accent},'fly',t);
  assert(!sp.pixels.includes(hex(body[2])>>>0));assert(!sp.pixels.includes(hex(accent[2])>>>0));
 }
});

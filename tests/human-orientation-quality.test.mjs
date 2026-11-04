import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{humanRig2D,humanViewMotion2D,renderHuman2D,drawHuman2D}from'../build/core/human.js';
import{createFrame,Painter,hex}from'../build/core/index.js';
const views=['front','three-quarter','side','back'],motions=['idle','walk','wave','guard','crouch'],points=['head','neck','chest','pelvis','leftShoulder','rightShoulder','leftElbow','rightElbow','leftHand','rightHand','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle'];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function bones(r){for(const side of['left','right'])for(const[a,b,l]of[['Shoulder','Elbow','upperArm'],['Elbow','Hand','forearm'],['Hip','Knee','thigh'],['Knee','Ankle','shin']])assert(Math.abs(dist(r[side+a],r[side+b])-r.lengths[l])<1e-6);}
test('the three previously reviewed views preserve all baseline pixels',()=>{
 const h=createHash('sha256');for(const view of views.slice(0,3))for(const height of[32,48,72])for(const motion of motions)for(const t of[0,.5]){
  const q=renderHuman2D({view,height,skin:'brown',hair:'swept'},humanViewMotion2D(view,motion,t));h.update(JSON.stringify([q.w,q.h,q.x,q.y]));h.update(new Uint8Array(q.pixels.buffer));
 }
 assert.equal(h.digest('hex'),'a804d3cf034970a9063045ad4cab6ead8dfffc48632099fbfb07f152ddbedbb5');
});
test('left facing mirrors complete pixels, masks and origin without relabeling the rig',()=>{
 for(const view of views)for(const height of[32,48,72])for(const motion of motions)for(const t of[0,.5]){
  const pose=humanViewMotion2D(view,motion,t),right=renderHuman2D({view,height,facing:'right'},pose),left=renderHuman2D({view,height,facing:'left'},pose);
  assert.equal(left.x,-right.x-right.w);assert.equal(left.y,right.y);assert.equal(left.w,right.w);assert.equal(left.h,right.h);
  for(let y=0;y<right.h;y++)for(let x=0;x<right.w;x++){const a=y*right.w+x,b=y*right.w+right.w-1-x;assert.equal(right.pixels[a],left.pixels[b]);assert.equal(right.mask.data[a],left.mask.data[b]);}
  for(const key of points){assert.equal(left.rig[key][0],-right.rig[key][0]);assert.equal(left.rig[key][1],right.rig[key][1]);}
  assert.equal(left.rig.facing,'left');assert.equal(right.rig.facing,'right');assert.deepEqual(left.rig.clamped,right.rig.clamped);assert.deepEqual(left.rig.pose,pose);
  assert.deepEqual(left.rig,humanRig2D({view,height,facing:'left'},pose));
 }
});
test('facing and Painter mirroring compose exactly, including translated custom poses',()=>{
 for(const view of views){const frames=[createFrame(220,180),createFrame(220,180),createFrame(220,180)],pose={...humanViewMotion2D(view,'wave',.25),x:4,y:1};
  drawHuman2D(new Painter(frames[0]).place(110,150),{view,facing:'right'},pose);
  drawHuman2D(new Painter(frames[1]).place(110,150,true),{view,facing:'left'},pose);
  drawHuman2D(new Painter(frames[2]).place(110,150),{view,facing:'left'},pose);
  assert.deepEqual(frames[0].color,frames[1].color);
  for(let y=0;y<180;y++)for(let x=0;x<220;x++)assert.equal(frames[0].color[y*220+x],frames[2].color[y*220+219-x]);
 }
});
test('back presets preserve fixed bone lengths, reachable targets and stable support feet',()=>{
 for(const height of[32,48,72,192])for(const build of['slender','regular','broad'])for(const facing of['left','right'])for(const motion of motions)for(let i=0;i<=80;i++){
  const r=humanRig2D({height,build,facing,view:'back'},humanViewMotion2D('back',motion,i/40));bones(r);assert.deepEqual(r.clamped,[]);
  if(motion!=='walk'){assert(Math.abs(r.leftAnkle[1]+4*r.scale)<1e-6);assert(Math.abs(r.rightAnkle[1]+4*r.scale)<1e-6);}
  else assert(Math.abs(r.leftAnkle[1]+4*r.scale)<1e-6||Math.abs(r.rightAnkle[1]+4*r.scale)<1e-6);
 }
});
test('back art has no eye or front jacket-opening marks across hairstyles and sizes',()=>{
 const eye=hex('#3b3038')>>>0,shirtOpening=hex('#c8b99a')>>>0;
 for(const height of[32,48,72])for(const hair of['crop','bob','curls','swept','bun'])for(const hairColor of['dark','chestnut','gold','silver'])for(const facing of['left','right']){
  const sp=renderHuman2D({view:'back',height,hair,hairColor,facing,outfit:'jacket'});assert(!sp.pixels.includes(eye));assert(!sp.pixels.includes(shirtOpening));
 }
});
test('back sprites are connected, padded, opaque and never receive interior ink',()=>{
 const ink=hex('#ff00ff')>>>0;
 for(const height of[32,48,72])for(const hair of['crop','bob','curls','swept','bun'])for(const motion of motions)for(const facing of['left','right']){
  const pose=humanViewMotion2D('back',motion,.25),sp=renderHuman2D({view:'back',facing,height,hair,outline:null},pose),lined=renderHuman2D({view:'back',facing,height,hair,outline:'#ff00ff'},pose),start=sp.pixels.findIndex(Boolean),seen=new Set([start]),stack=[start];
  while(stack.length){const k=stack.pop();for(const v of[k-1,k+1,k-sp.w,k+sp.w,k-sp.w-1,k-sp.w+1,k+sp.w-1,k+sp.w+1])if(sp.pixels[v]&&!seen.has(v)){seen.add(v);stack.push(v);}}
  assert.equal(seen.size,sp.mask.data.reduce((a,b)=>a+b,0));
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){const i=y*sp.w+x;assert.equal(sp.mask.data[i],sp.pixels[i]?1:0);
   if(sp.pixels[i]){assert.equal(lined.pixels[i],sp.pixels[i]);assert.equal(sp.pixels[i]>>>24,255);}
   else if(lined.pixels[i]){assert.equal(lined.pixels[i],ink);assert(sp.pixels[i-1]||sp.pixels[i+1]||sp.pixels[i-sp.w]||sp.pixels[i+sp.w]);}
   if(lined.pixels[i])assert(x>0&&y>0&&x<sp.w-1&&y<sp.h-1);
  }
 }
});
test('back motion is deterministic, exactly periodic at sampled phases and continuous',()=>{
 for(const motion of motions)for(const facing of['left','right']){
  for(const t of[0,.25,.5,1,1.5]){const a=renderHuman2D({view:'back',facing,height:72},humanViewMotion2D('back',motion,t));assert.deepEqual(a,renderHuman2D({view:'back',facing,height:72},humanViewMotion2D('back',motion,t)));assert.deepEqual(a,renderHuman2D({view:'back',facing,height:72},humanViewMotion2D('back',motion,t+2)));}
  let prev;for(let i=0;i<=40;i++){const r=humanRig2D({view:'back',facing},humanViewMotion2D('back',motion,i/20));if(prev)for(const key of points)assert(dist(r[key],prev[key])<9);prev=r;}
  assert.deepEqual(humanViewMotion2D('back',motion,0,true),humanViewMotion2D('back',motion,1,true));
 }
});
test('invalid facing values reject, and left-facing calls retain all input guards',()=>{
 for(const facing of['back','LEFT',true,null])assert.throws(()=>renderHuman2D({facing}),/facing/);
 for(const style of[{height:31},{view:'overhead'},{cloth:Array(3)},{hair:'unknown'}])assert.throws(()=>renderHuman2D({...style,facing:'left'}));
 for(const pose of[{x:Infinity},{leftKnee:0},{leftHand:[NaN,0]}])assert.throws(()=>renderHuman2D({facing:'left'},pose));
});

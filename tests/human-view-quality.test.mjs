import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{humanRig2D,humanMotion2D,humanViewMotion2D,renderHuman2D,drawHuman2D}from'../build/core/human.js';
import{createFrame,Painter,hex}from'../build/core/index.js';
const views=['three-quarter','side'],motions=['idle','walk','wave','guard','crouch'],dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function bones(r){for(const side of['left','right'])for(const[a,b,len]of[['Shoulder','Elbow','upperArm'],['Elbow','Hand','forearm'],['Hip','Knee','thigh'],['Knee','Ankle','shin']])assert(Math.abs(dist(r[side+a],r[side+b])-r.lengths[len])<1e-6);}
function at(sp,x,y){return sp.pixels[(Math.round(y)-sp.y)*sp.w+Math.round(x)-sp.x];}
test('default front pixels are byte-identical to the reviewed v1 baseline',()=>{
 const hash=createHash('sha256');
 for(const height of[32,48,72])for(const motion of motions)for(const t of[0,.5]){
  const sp=renderHuman2D({height,skin:'brown',hair:'swept'},humanMotion2D(motion,t));hash.update(JSON.stringify([sp.w,sp.h,sp.x,sp.y]));hash.update(new Uint8Array(sp.pixels.buffer));
 }
 assert.equal(hash.digest('hex'),'094caa37152e8b3c32b92b7e47ffd86efc207b87ad5eebbc2731d7ba7f988866');
});
test('directional rigs preserve limb lengths and all preset targets are reachable',()=>{
 for(const view of views)for(const height of[32,48,72,192])for(const build of['slender','regular','broad'])for(const motion of motions)for(let i=0;i<=80;i++){
  const r=humanRig2D({view,height,build},humanViewMotion2D(view,motion,i/40));bones(r);assert.equal(r.view,view);assert.deepEqual(r.clamped,[],`${view}/${height}/${build}/${motion}/${i}`);
 }
 const f=humanRig2D(),q=humanRig2D({view:'three-quarter'}),s=humanRig2D({view:'side'});
 assert(dist(f.leftShoulder,f.rightShoulder)>dist(q.leftShoulder,q.rightShoulder));assert(dist(q.leftShoulder,q.rightShoulder)>dist(s.leftShoulder,s.rightShoulder));
});
test('32/48/72 faces retain the intended eye pixels across skin, hair and clothes',()=>{
 const eye=hex('#3b3038')>>>0;
 for(const view of views)for(const height of[32,48,72])for(const skin of['light','warm','brown','deep'])for(const hair of['crop','bob','curls','swept','bun'])for(const outfit of['shirt','jacket','tunic','sleeveless']){
  const sp=renderHuman2D({view,height,skin,hair,outfit,outline:null}),H=sp.rig.head,s=sp.rig.scale;
  if(view==='side')assert.equal(at(sp,H[0]+3.2*s,H[1]-.5*s),eye,`${view}/${height}/${hair}`);
  else {assert.equal(at(sp,H[0]-.5*s,H[1]+.2*s),eye);if(height>=48)assert.equal(at(sp,H[0]+3.6*s,H[1]+.2*s),eye);}
 }
});
test('directional silhouettes are connected, padded and use only exterior ink',()=>{
 const ink=hex('#ff00ff')>>>0;
 for(const view of views)for(const height of[32,48,72])for(const hair of['crop','bob','curls','swept','bun'])for(const motion of motions)for(const t of[0,.5]){
  const pose=humanViewMotion2D(view,motion,t),sp=renderHuman2D({view,height,hair,outline:null},pose),lined=renderHuman2D({view,height,hair,outline:'#ff00ff'},pose);
  const first=sp.pixels.findIndex(Boolean),seen=new Set([first]),stack=[first];
  while(stack.length){const i=stack.pop();for(const v of[i-1,i+1,i-sp.w,i+sp.w,i-sp.w-1,i-sp.w+1,i+sp.w-1,i+sp.w+1])if(sp.pixels[v]&&!seen.has(v)){seen.add(v);stack.push(v);}}
  assert.equal(seen.size,sp.mask.data.reduce((a,b)=>a+b,0),`${view}/${height}/${hair}/${motion}`);
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){
   const i=y*sp.w+x;assert.equal(sp.mask.data[i],sp.pixels[i]?1:0);
   if(sp.pixels[i])assert.equal(lined.pixels[i],sp.pixels[i],'no ink overwrites a material');
   else if(lined.pixels[i]){assert.equal(lined.pixels[i],ink);assert(sp.pixels[i-1]||sp.pixels[i+1]||sp.pixels[i-sp.w]||sp.pixels[i+sp.w]);}
   if(lined.pixels[i])assert(x>0&&x<sp.w-1&&y>0&&y<sp.h-1,'no border clipping');
  }
 }
});
test('foreground near hand remains in front of foreground far hand at an overlap',()=>{
 for(const view of views)for(const height of[48,72,96]){
  const sp=renderHuman2D({view,height,outline:null},{leftHand:[10,-60],rightHand:[10,-60],armsFront:true}),h=sp.rig.leftHand;
  assert.equal(at(sp,h[0],h[1]),hex('#d7a174')>>>0,'near hand skin shade owns overlap');
 }
});
test('grounded poses stay planted and walking alternates support without both feet airborne',()=>{
 for(const view of views)for(const motion of motions)for(let i=0;i<=80;i++){
  const pose=humanViewMotion2D(view,motion,i/40),r=humanRig2D({view},pose);
  if(motion!=='walk'){assert(Math.abs(r.leftAnkle[1]+4)<1e-6);assert(Math.abs(r.rightAnkle[1]+4)<1e-6);}
  else {assert(r.leftAnkle[1]<=-4+1e-6);assert(r.rightAnkle[1]<=-4+1e-6);assert(Math.abs(r.leftAnkle[1]+4)<1e-6||Math.abs(r.rightAnkle[1]+4)<1e-6);}
 }
});
test('directional motion is seekable, periodic, static when requested and free from joint jumps',()=>{
 for(const view of views)for(const motion of motions){
  for(const t of[0,.25,.5,1,1.5]){
   const a=renderHuman2D({view,height:72},humanViewMotion2D(view,motion,t));assert.deepEqual(a,renderHuman2D({view,height:72},humanViewMotion2D(view,motion,t)));assert.deepEqual(a,renderHuman2D({view,height:72},humanViewMotion2D(view,motion,t+2)));
  }
  assert.deepEqual(humanViewMotion2D(view,motion,0,true),humanViewMotion2D(view,motion,1.7,true));
  let previous;for(let i=0;i<=40;i++){
   const r=humanRig2D({view},humanViewMotion2D(view,motion,i/20));if(previous)for(const key of['head','leftElbow','rightElbow','leftHand','rightHand','leftKnee','rightKnee','leftAnkle','rightAnkle'])assert(dist(r[key],previous[key])<9,`${view}/${motion}/${key}`);previous=r;
  }
 }
});
test('side and three-quarter sprites mirror through the engine Painter without a new drawing path',()=>{
 for(const view of views){const a=createFrame(180,160),b=createFrame(180,160);drawHuman2D(new Painter(a).place(90,135),{view},humanViewMotion2D(view,'wave',.25));drawHuman2D(new Painter(b).place(90,135,true),{view},humanViewMotion2D(view,'wave',.25));
  for(let y=0;y<160;y++)for(let x=0;x<180;x++)assert.equal(a.color[y*180+x],b.color[y*180+179-x]);
 }
});
test('view selectors and time reject invalid inputs and front pose routing stays compatible',()=>{
 assert.throws(()=>renderHuman2D({view:'overhead'}),/view/);assert.throws(()=>humanViewMotion2D('overhead','idle',0),/view/);assert.throws(()=>humanViewMotion2D('side','bad',0),/motion/);assert.throws(()=>humanViewMotion2D('side','idle',NaN),/time/);
 for(const m of motions)assert.deepEqual(humanViewMotion2D('front',m,.25),humanMotion2D(m,.25));
});
test('directional gaze shifts pupils without changing the silhouette',()=>{
 for(const view of views){const a=renderHuman2D({view,height:96},{gaze:-1}),b=renderHuman2D({view,height:96},{gaze:1});assert.deepEqual(a.mask,b.mask);assert.notDeepEqual(a.pixels,b.pixels);}
});

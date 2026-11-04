import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrame,Painter,hex } from '../build/core/index.js';
import { humanRig2D,humanMotion2D,renderHuman2D,drawHuman2D } from '../build/core/human.js';
const motions=['idle','walk','wave','guard','crouch'];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function bones(r){
 for(const side of ['left','right']){
  for(const [a,b,length] of [['Shoulder','Elbow','upperArm'],['Elbow','Hand','forearm'],['Hip','Knee','thigh'],['Knee','Ankle','shin']])assert(Math.abs(dist(r[side+a],r[side+b])-r.lengths[length])<1e-6,`${side} ${length} fixed`);
 }
}
test('2D human anatomy landmarks are ordered and proportions scale coherently',()=>{
 for(const height of [32,48,72,96,128,192])for(const build of ['slender','regular','broad']){
  const r=humanRig2D({height,build});assert(r.head[1]<r.neck[1]);assert(r.neck[1]<r.chest[1]);assert(r.chest[1]<r.pelvis[1]);assert(r.pelvis[1]<r.leftKnee[1]);assert(r.leftKnee[1]<r.leftAnkle[1]);
  assert(r.leftShoulder[0]<r.rightShoulder[0]);assert(r.leftHip[0]<r.rightHip[0]);bones(r);
  assert(Math.abs(r.lengths.upperArm/height-18.2/96)<1e-12);
 }
});
test('all built-in motion targets stay reachable for all supported builds',()=>{
 for(const motion of motions)for(const build of ['slender','regular','broad'])for(let i=0;i<=80;i++){
  const r=humanRig2D({build},humanMotion2D(motion,i/40));bones(r);assert.deepEqual(r.clamped,[],`${motion} ${build} t=${i/40}`);
 }
});
test('idle, wave, guard and crouch keep both foot contacts fixed',()=>{
 for(const motion of motions.filter(m=>m!=='walk'))for(let i=0;i<=80;i++){
  const pose=humanMotion2D(motion,i/40),r=humanRig2D({},pose);
  assert(Math.abs(r.leftAnkle[1]+4)<1e-6);assert(Math.abs(r.rightAnkle[1]+4)<1e-6);
 }
});
test('unreachable and coincident targets clamp without changing bone lengths',()=>{
 const rest=humanRig2D();
 for(const pose of [{leftHand:[1000,-1000],rightFoot:[-1000,1000]},{leftHand:rest.leftShoulder},{leftFoot:rest.leftHip}]){
  const r=humanRig2D({},pose);bones(r);assert(r.clamped.length>0);for(const key of ['leftElbow','rightElbow','leftKnee','rightKnee'])assert(r[key].every(Number.isFinite));
 }
});
test('deterministic render and exact two-second pose and pixel loop',()=>{
 for(const motion of motions){
  const style={height:96,hair:'bob'};
  for(const t of [0,.25,.5,1,1.5]){
   const a=renderHuman2D(style,humanMotion2D(motion,t)),b=renderHuman2D(style,humanMotion2D(motion,t));assert.deepEqual(a,b);
   assert.deepEqual(renderHuman2D(style,humanMotion2D(motion,t+2)),a);
  }
 }
});
test('union contour never overwrites interior pixels or creates part-border panels',()=>{
 const ink=hex('#ff00ff')>>>0;
 for(const motion of motions){
  const pose=humanMotion2D(motion,.4),base=renderHuman2D({outline:null},pose),lined=renderHuman2D({outline:'#ff00ff'},pose);
  assert.equal(base.w,lined.w);assert.equal(base.h,lined.h);
  for(let i=0;i<base.pixels.length;i++){
   if(base.pixels[i])assert.equal(lined.pixels[i],base.pixels[i],'all material pixels unchanged');
   else if(lined.pixels[i]){assert.equal(lined.pixels[i],ink);assert(base.pixels[i-1]||base.pixels[i+1]||base.pixels[i-base.w]||base.pixels[i+base.w]);}
  }
 }
});
test('all sizes, hair styles and motion samples remain inside padded bounds with mask parity',()=>{
 for(const height of [32,48,72,96,192])for(const hair of ['crop','bob','curls','swept','bun'])for(const motion of motions)for(const t of [0,.5,1]){
  const sp=renderHuman2D({height,hair},humanMotion2D(motion,t));let count=0;
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){
   const i=y*sp.w+x;assert.equal(sp.mask.data[i],sp.pixels[i]?1:0);
   if(sp.pixels[i]){count++;assert(x>0&&y>0&&x<sp.w-1&&y<sp.h-1,`${height}/${hair}/${motion}`);assert.equal(sp.pixels[i]>>>24,255);}
  }
  assert(count>height*2);
 }
});
test('front arms preserve hands over the torso in a guard',()=>{
 const pose=humanMotion2D('guard',0),sp=renderHuman2D({height:96,outline:null},pose),behind=renderHuman2D({height:96,outline:null},{...pose,armsFront:false});
 assert.notDeepEqual(sp.pixels,behind.pixels);
 for(const hand of [sp.rig.leftHand,sp.rig.rightHand]){
  const x=Math.round(hand[0])-sp.x,y=Math.round(hand[1])-sp.y,c=sp.pixels[y*sp.w+x];
  assert([hex('#bc805d')>>>0,hex('#d7a174')>>>0,hex('#e5b685')>>>0].includes(c),'visible hand is skin, not torso');
 }
});
test('faces use independent readable eye color across skin, hair and sizes',()=>{
 const eye=hex('#3b3038')>>>0;
 for(const height of [32,48,72,96,128])for(const skin of ['light','warm','brown','deep'])for(const hairColor of ['dark','chestnut','gold','silver']){
  const sp=renderHuman2D({height,skin,hairColor,outline:null});const H=sp.rig.head,s=sp.rig.scale;
  const yy=Math.round(H[1]+.2*s)-sp.y;
  for(const dx of [-2.8,2.6])assert.equal(sp.pixels[yy*sp.w+Math.round(H[0]+dx*s)-sp.x],eye,`${height}/${skin}/${hairColor}`);
 }
});
test('motion joints move continuously at 20fps, reduced motion is static',()=>{
 for(const motion of motions){let prev;
  for(let i=0;i<=40;i++){
   const r=humanRig2D({},humanMotion2D(motion,i/20));
   if(prev)for(const k of ['head','leftElbow','rightElbow','leftHand','rightHand','leftKnee','rightKnee','leftAnkle','rightAnkle'])assert(dist(r[k],prev[k])<9,`${motion} ${k} jump`);
   prev=r;
  }
  assert.deepEqual(humanMotion2D(motion,0,true),humanMotion2D(motion,10,true));
 }
});
test('draw integration respects painter placement and whole-cell mirror',()=>{
 const a=createFrame(180,160),b=createFrame(180,160);const p=new Painter(a),q=new Painter(b);p.place(90,135);q.place(90,135,true);
 drawHuman2D(p,{height:96},humanMotion2D('wave',0));drawHuman2D(q,{height:96},humanMotion2D('wave',0));
 for(let y=0;y<160;y++)for(let x=0;x<180;x++)assert.equal(a.color[y*180+x],b.color[y*180+179-x]);
});
test('invalid public inputs fail explicitly rather than corrupting geometry or allocating huge sprites',()=>{
 for(const style of [{height:31},{height:193},{height:NaN},{skin:'unknown'},{hair:'unknown'},{hairColor:'bad'},{build:'bad'},{cloth:['#fff']},{cloth:Array(3)},{trousers:['#fff',,'#aaa']},{trousers:['#abc','#def','bad']},{outline:'wat'}])assert.throws(()=>renderHuman2D(style));
 for(const pose of [{leftElbow:3},{rightKnee:0},{x:Infinity},{x:5000},{leftHand:[0,NaN]},{rightFoot:[1]},{leftFoot:'bad'}])assert.throws(()=>renderHuman2D({},pose));
 assert.throws(()=>humanMotion2D('bad',0));assert.throws(()=>humanMotion2D('idle',NaN));
 assert.throws(()=>renderHuman2D({height:192},{lean:4096}),/lean must/);
});
test('unoutlined native sprites remain one eight-connected silhouette at the smallest size',()=>{
 for(const height of [32,48,96])for(const motion of motions)for(const t of [0,.5,1,1.5]){
  const sp=renderHuman2D({height,outline:null},humanMotion2D(motion,t)),start=sp.pixels.findIndex(Boolean),seen=new Set([start]),stack=[start];
  while(stack.length){const k=stack.pop();for(const v of [k-1,k+1,k-sp.w,k+sp.w,k-sp.w-1,k-sp.w+1,k+sp.w-1,k+sp.w+1])if(sp.pixels[v]&&!seen.has(v)){seen.add(v);stack.push(v);}}
  assert.equal(seen.size,sp.mask.data.reduce((a,b)=>a+b,0),`${height}/${motion}/${t}`);
 }
});

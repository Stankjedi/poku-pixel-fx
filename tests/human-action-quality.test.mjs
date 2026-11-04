import test from'node:test';import assert from'node:assert/strict';
import{humanAction2D,humanLimbTarget2D,HUMAN_ACTION_TIMING,humanRig2D,renderHuman2D,hex}from'../build/core/index.js';
const views=['front','side','back','three-quarter'],actions=['run','jump'],keys=['head','leftElbow','rightElbow','leftHand','rightHand','leftKnee','rightKnee','leftAnkle','rightAnkle'];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function boneCheck(r){for(const side of['left','right'])for(const[a,b,len]of[['Shoulder','Elbow','upperArm'],['Elbow','Hand','forearm'],['Hip','Knee','thigh'],['Knee','Ankle','shin']])assert(Math.abs(dist(r[side+a],r[side+b])-r.lengths[len])<1e-6);}
test('forward-kinematic targets choose the matching pole through a straight arm',()=>{
 const r=humanRig2D();for(const bend of[-2,-.5,-.0001,0,.0001,.5,2]){const q=humanLimbTarget2D(r.leftShoulder,-.4,bend,r.lengths.upperArm,r.lengths.forearm),p=humanRig2D({}, {leftHand:q.target,leftElbow:q.pole});boneCheck(p);assert(dist(p.leftHand,q.target)<.001);assert(dist(p.leftElbow,[r.leftShoulder[0]+Math.sin(-.4)*18.2,r.leftShoulder[1]+Math.cos(-.4)*18.2])<.05);}
 assert(humanLimbTarget2D([0,0],Number.MAX_VALUE,Number.MAX_VALUE,18,16).target.every(Number.isFinite));
 for(const q of[[Array(2),0,0,2,2],[[0,NaN],0,0,2,2],[[0,0],Infinity,0,2,2],[[0,0],0,0,0,2],[[0,0],0,0,2,513]])assert.throws(()=>humanLimbTarget2D(...q));
});
test('run loops exactly at decimal sample phases and exposes both contact and flight intervals',()=>{
 for(const view of views){let ground=0,air=0;for(let i=0;i<80;i++){const t=i/100,a=humanAction2D('run',t,{view}),b=humanAction2D('run',t+.8,{view});assert.deepEqual(a,b);assert(!a.done&&a.loop);if(a.airborne)air++;else ground++;}assert(ground>air&&air>0);}
});
test('jump is one-shot, has a complete event order and holds the initial rest after completion',()=>{
 for(const view of views){const rest=humanAction2D('jump',0,{view}),end=humanAction2D('jump',2,{view});assert(end.done&&!end.loop);assert.deepEqual(rest.pose,end.pose);assert.deepEqual(renderHuman2D({view},rest.pose).pixels,renderHuman2D({view},end.pose).pixels);assert.deepEqual(humanAction2D('jump',-1,{view}).pose,rest.pose);
  assert.equal(humanAction2D('jump',.1,{view}).phase,'anticipation');assert.equal(humanAction2D('jump',.21,{view}).phase,'takeoff');assert.equal(humanAction2D('jump',.54,{view}).phase,'flight');assert.equal(humanAction2D('jump',.9,{view}).phase,'landing');assert.equal(humanAction2D('jump',1.1,{view}).phase,'recovery');
  assert(humanAction2D('jump',.54,{view}).rootY<-18);assert(humanAction2D('jump',.94,{view}).rootY>6);
 }
 assert.equal(HUMAN_ACTION_TIMING.jump.takeoff,.24);assert.equal(HUMAN_ACTION_TIMING.jump.landing,.84);
});
test('all actions retain bone lengths and reachable endpoints across views, builds and heights',()=>{
 for(const view of views)for(const build of['slender','regular','broad'])for(const height of[32,48,72,192])for(const action of actions)for(let i=0;i<=120;i++){
  const style={view,build,height},a=humanAction2D(action,i/100,style),r=humanRig2D(style,a.pose);boneCheck(r);assert.deepEqual(r.clamped,[],`${view}/${build}/${height}/${action}/${i}`);
 }
});
test('contact flags agree with feet, jump feet stay planted on the ground and pelvis stays balanced',()=>{
 for(const view of views)for(const action of actions)for(let i=0;i<=120;i++){
  const a=humanAction2D(action,i/100,{view}),r=humanRig2D({view},a.pose);assert.equal(a.airborne,!a.contacts.left&&!a.contacts.right);
  for(const side of['left','right']){if(a.contacts[side])assert(Math.abs(r[`${side}Ankle`][1]+4)<1e-5);else assert(r[`${side}Ankle`][1]<=-4+1e-5,'airborne foot does not penetrate ground');}
  if(action==='jump'&&!a.airborne){assert(r.pelvis[0]>=Math.min(r.leftAnkle[0],r.rightAnkle[0]));assert(r.pelvis[0]<=Math.max(r.leftAnkle[0],r.rightAnkle[0]));}
 }
});
test('phase boundaries have no joint teleportation, including arm bend sign changes and loop seams',()=>{
 for(const view of views)for(const action of actions)for(const t of action==='run'?[.256,.4,.656,.8]:[.06,.12,.18,.24,.42,.54,.84,1.04,1.2]){
  const a=humanRig2D({view},humanAction2D(action,t-1e-7,{view}).pose),b=humanRig2D({view},humanAction2D(action,t+1e-7,{view}).pose);for(const key of keys)assert(dist(a[key],b[key])<.01,`${view}/${action}/${t}/${key}`);
 }
});
test('native 32/48/72 action sprites remain connected, opaque and padded',()=>{
 for(const view of views)for(const height of[32,48,72])for(const action of actions)for(const t of[0,.12,.22,.32,.54,.78,.9,1.1]){
  const sp=renderHuman2D({view,height},humanAction2D(action,t,{view,height}).pose),start=sp.pixels.findIndex(Boolean),seen=new Set([start]),stack=[start];
  while(stack.length){const k=stack.pop();for(const v of[k-1,k+1,k-sp.w,k+sp.w,k-sp.w-1,k-sp.w+1,k+sp.w-1,k+sp.w+1])if(sp.pixels[v]&&!seen.has(v)){seen.add(v);stack.push(v);}}
  assert.equal(seen.size,sp.mask.data.reduce((a,b)=>a+b,0));
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++)if(sp.pixels[y*sp.w+x]){assert(x>0&&y>0&&x<sp.w-1&&y<sp.h-1);assert.equal(sp.pixels[y*sp.w+x]>>>24,255);}
 }
});
test('actions retain exterior-only contours without drawing black limb panels',()=>{
 const ink=hex('#ff00ff')>>>0;for(const view of views)for(const action of actions)for(const t of[.22,.54,.9]){const pose=humanAction2D(action,t,{view}).pose,a=renderHuman2D({view,outline:null},pose),b=renderHuman2D({view,outline:'#ff00ff'},pose);for(let i=0;i<a.pixels.length;i++){if(a.pixels[i])assert.equal(a.pixels[i],b.pixels[i]);else if(b.pixels[i]){assert.equal(b.pixels[i],ink);assert(a.pixels[i-1]||a.pixels[i+1]||a.pixels[i-a.w]||a.pixels[i+a.w]);}}}
});
test('action authoring stays canonical across facing; reduced motion is a static supported rest',()=>{
 for(const view of views)for(const action of actions){assert.deepEqual(humanAction2D(action,.54,{view,facing:'left'}),humanAction2D(action,.54,{view,facing:'right'}));const a=humanAction2D(action,0,{view},true),b=humanAction2D(action,.7,{view},true);assert.deepEqual(a.pose,b.pose);assert(!a.airborne&&!b.airborne&&a.contacts.left&&a.contacts.right);}
});
test('actions are seekable without hidden state and invalid public inputs reject',()=>{
 for(const action of actions){const a=humanAction2D(action,.37,{view:'side'});humanAction2D(action,500,{view:'back'});assert.deepEqual(a,humanAction2D(action,.37,{view:'side'}));}
 assert.throws(()=>humanAction2D('fly',0));assert.throws(()=>humanAction2D('run',Infinity));for(const style of[{height:20},{view:'overhead'},{facing:'bad'},{cloth:Array(3)}])assert.throws(()=>humanAction2D('jump',0,style));
});

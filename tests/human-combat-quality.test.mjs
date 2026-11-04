import test from'node:test';import assert from'node:assert/strict';
import{humanCombat2D,humanHandTip2D,humanContactPixel2D,HUMAN_COMBAT_TIMING,humanRig2D,renderHuman2D,transformImpactContact2D,hex}from'../build/core/index.js';
const views=['front','three-quarter','side','back'],actions=['punch','block','hit'],sizes=[32,48,72],points=['head','neck','chest','pelvis','leftShoulder','rightShoulder','leftElbow','rightElbow','leftHand','rightHand','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle'];
const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function connected(sp){const start=sp.pixels.findIndex(Boolean),seen=new Set([start]),stack=[start];while(stack.length){const i=stack.pop(),x=i%sp.w,y=Math.floor(i/sp.w);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const xx=x+dx,yy=y+dy,n=yy*sp.w+xx;if(xx>=0&&yy>=0&&xx<sp.w&&yy<sp.h&&sp.pixels[n]&&!seen.has(n)){seen.add(n);stack.push(n);}}}return seen.size===sp.mask.data.reduce((a,b)=>a+b,0);}
function filledNear(sp,p){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=Math.round(p[0])-sp.x+dx,y=Math.round(p[1])-sp.y+dy;if(x>=0&&y>=0&&x<sp.w&&y<sp.h&&sp.pixels[y*sp.w+x])return true;}return false;}
test('combat one-shots clamp and share exactly the same start/end ready pose',()=>{
 for(const view of views)for(const height of sizes)for(const facing of['left','right']){
  const style={view,height,facing},ready=humanCombat2D('punch',0,style).pose;for(const action of actions){const timing=HUMAN_COMBAT_TIMING[action];for(const time of[-10,0,timing.duration,timing.duration+10]){const q=humanCombat2D(action,time,style);assert.deepEqual(q.pose,ready);assert.equal(q.phase,'ready');assert.equal(q.loop,false);assert.equal(q.done,time>=timing.duration);assert.equal(q.contactActive,false);}}
 }
});
test('combat bones stay fixed, endpoints reachable, feet grounded and pelvis supported',()=>{
 for(const view of views)for(const build of['slender','regular','broad'])for(const height of[32,48,72,192])for(const action of actions)for(let i=0;i<=110;i++){
  const style={view,build,height},q=humanCombat2D(action,i/100,style),r=humanRig2D(style,q.pose);assert.deepEqual(r.clamped,[],`${view}/${build}/${action}/${i}`);
  for(const side of['left','right'])for(const[a,b,l]of[['Shoulder','Elbow','upperArm'],['Elbow','Hand','forearm'],['Hip','Knee','thigh'],['Knee','Ankle','shin']])assert(Math.abs(d(r[side+a],r[side+b])-r.lengths[l])<1e-6);
  assert(Math.abs(r.leftAnkle[1]+4*r.scale)<1e-6);assert(Math.abs(r.rightAnkle[1]+4*r.scale)<1e-6);assert(r.pelvis[0]>r.leftAnkle[0]&&r.pelvis[0]<r.rightAnkle[0]);assert.deepEqual(q.contacts,{left:true,right:true});
 }
});
test('phase boundaries are continuous and ordinary frames have no arm/leg teleports',()=>{
 for(const view of views)for(const action of actions){const timing=HUMAN_COMBAT_TIMING[action],style={view};
  for(const t of[0,timing.windup,timing.contact,.22,timing.holdEnd,timing.duration]){const a=humanRig2D(style,humanCombat2D(action,t-1e-7,style).pose),b=humanRig2D(style,humanCombat2D(action,t+1e-7,style).pose);for(const key of points)assert(d(a[key],b[key])<.001,`${view}/${action}/${t}/${key}`);}
  let prev;for(let i=0;i<=1100;i++){const r=humanRig2D(style,humanCombat2D(action,i/1000,style).pose);if(prev)for(const key of points)assert(d(prev[key],r[key])<1.3,`${view}/${action}/${i}/${key}`);prev=r;}
 }
});
test('authored contact is fixed, matches its actual tip/chest at cue time and overlays painted pixels',()=>{
 for(const view of views)for(const height of sizes)for(const facing of['left','right'])for(const action of actions){const style={view,height,facing},at=HUMAN_COMBAT_TIMING[action].contact,q=humanCombat2D(action,at,style),r=humanRig2D(style,q.pose),sp=renderHuman2D(style,q.pose);
  assert(q.contact);assert.deepEqual(q.contact.position,q.anchor);assert.equal(q.contact.at,at);assert.equal(q.contactAge,0);assert.equal(q.contactActive,true);assert(filledNear(sp,q.contact.position));
  const expected=q.anchorName==='chest'?r.chest:humanHandTip2D(r,q.anchorName.startsWith('left')?'left':'right');assert(d(q.anchor,expected)<1e-9);
  assert.deepEqual(q.contact,humanCombat2D(action,0,style).contact);assert.deepEqual(q.contact,humanCombat2D(action,10,style).contact);assert(Object.isFrozen(q.contact));assert(Object.isFrozen(q.contact.position));assert(Object.isFrozen(q.contact.normal));
  assert.equal(humanCombat2D(action,at-.01,style).contactActive,false);assert.equal(humanCombat2D(action,at+.061,style).contactActive,false);
 }
});
test('facing mirrors anchors/normals while canonical authored poses and hand identities stay the same',()=>{
 for(const view of views)for(const action of actions)for(const t of[0,.2,.34,.5,1.1]){const a=humanCombat2D(action,t,{view,height:72}),b=humanCombat2D(action,t,{view,height:72,facing:'left'});
  assert.deepEqual(a.pose,b.pose);assert.equal(a.anchorName,b.anchorName);assert(Math.abs(a.anchor[0]+b.anchor[0])<1e-9);assert.equal(a.anchor[1],b.anchor[1]);assert(Math.abs(a.contact.position[0]+b.contact.position[0])<1e-9);assert.equal(a.contact.position[1],b.contact.position[1]);assert.equal(a.contact.normal[0],-b.contact.normal[0]);
  const moved=transformImpactContact2D(a.contact,{x:100,y:120,flip:true});assert(Math.abs(moved.position[0]-(100+b.contact.position[0]))<1e-9);assert.equal(moved.position[1],120+b.contact.position[1]);
 }
});
test('combat silhouettes remain connected and padded across sizes, appearances, views and actions',()=>{
 const appearances=[{hair:'parted',faceShape:'square'},{hair:'ponytail',faceShape:'long',outfit:'sweater'},{hair:'shaved',facialHair:'beard',outfit:'overalls'}];
 for(const appearance of appearances)for(const view of views)for(const height of sizes)for(const action of actions)for(const t of[0,.1,.2,.34,.5,.7,1.1]){
  const style={...appearance,view,height,outline:null},q=humanCombat2D(action,t,style),sp=renderHuman2D(style,q.pose);assert(connected(sp),JSON.stringify({appearance,view,height,action,t}));for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){const i=y*sp.w+x;assert.equal(sp.mask.data[i],sp.pixels[i]?1:0);if(sp.pixels[i]){assert.equal(sp.pixels[i]>>>24,255);assert(x>0&&y>0&&x<sp.w-1&&y<sp.h-1);}}
 }
});
test('combat foreground overlaps never acquire per-part contour ink',()=>{
 const ink=hex('#ff00ff')>>>0;for(const view of views)for(const height of sizes)for(const action of actions)for(const t of[.2,.34,.5]){const style={view,height},q=humanCombat2D(action,t,style),a=renderHuman2D({...style,outline:null},q.pose),b=renderHuman2D({...style,outline:'#ff00ff'},q.pose);for(let i=0;i<a.pixels.length;i++){if(a.pixels[i])assert.equal(a.pixels[i],b.pixels[i]);else if(b.pixels[i]){assert.equal(b.pixels[i],ink);assert(a.pixels[i-1]||a.pixels[i+1]||a.pixels[i-a.w]||a.pixels[i+a.w]);}}}
});
test('combat cue positions and poses scale once, stay deterministic and accept random seeking',()=>{
 for(const view of views)for(const action of actions)for(const t of[.7,.2,1.2,-1,.34]){const canonical=humanCombat2D(action,t,{view,height:96});for(const height of sizes){const q=humanCombat2D(action,t,{view,height});assert.deepEqual(q.pose,canonical.pose);assert(d(q.anchor,canonical.anchor.map(x=>x*height/96))<1e-6);assert.deepEqual(q,humanCombat2D(action,t,{view,height}));}}
});
test('reduced motion holds ready with no impact cue and invalid inputs fail explicitly',()=>{
 for(const view of views)for(const action of actions)for(const time of[0,.34,2]){const q=humanCombat2D(action,time,{view},true);assert.deepEqual(q.pose,humanCombat2D(action,0,{view}).pose);assert.equal(q.contact,null);assert.equal(q.contactAge,null);assert.equal(q.contactActive,false);assert.equal(q.phase,'ready');}
 for(const action of['kick','',null])assert.throws(()=>humanCombat2D(action,0));for(const t of[NaN,Infinity,-Infinity])assert.throws(()=>humanCombat2D('punch',t));for(const style of[{view:'up'},{height:31},{faceShape:'triangle'},{facing:'back'}])assert.throws(()=>humanCombat2D('punch',0,style));assert.throws(()=>humanHandTip2D(humanRig2D(),'wrong'));
});

test('raster attachment returns an occupied cell and uses pixel-cell reflection',()=>{
 for(const view of views)for(const height of sizes)for(const action of actions){
  const at=HUMAN_COMBAT_TIMING[action].contact,style={view,height},a=humanCombat2D(action,at,style),b=humanCombat2D(action,at,{...style,facing:'left'}),sa=renderHuman2D(style,a.pose),sb=renderHuman2D({...style,facing:'left'},b.pose);
  const pa=humanContactPixel2D(sa,a.contact.position),pb=humanContactPixel2D(sb,b.contact.position);assert(pa);assert(pb);
  assert.equal(pb[0],-pa[0]-1);assert.equal(pb[1],pa[1]);assert(sa.pixels[(pa[1]-sa.y)*sa.w+pa[0]-sa.x]);assert(sb.pixels[(pb[1]-sb.y)*sb.w+pb[0]-sb.x]);
  assert.equal(a.contact.normal[0],action==='punch'?-1:1);assert.equal(b.contact.normal[0],action==='punch'?1:-1);
  assert.equal(humanContactPixel2D(sa,[10000,10000]),null);
 }
 const sp=renderHuman2D();for(const point of[[NaN,0],[0,Infinity],Array(2),[0]])assert.throws(()=>humanContactPixel2D(sp,point));
});

test('matched-size punch and hit cues meet at the same ready chest height on one floor',()=>{
 for(const view of views)for(const height of sizes)for(const build of['slender','regular','broad']){
  const style={view,height,build},a=humanCombat2D('punch',.34,style),b=humanCombat2D('hit',.1,{...style,facing:'left'});
  assert(Math.abs(a.contact.position[1]-b.contact.position[1])<1e-6);
  const attackerX=40,defenderX=attackerX+a.contact.position[0]-b.contact.position[0];
  assert(Math.abs(attackerX+a.anchor[0]-defenderX-b.anchor[0])<1e-6);
  assert(Math.abs(.34-HUMAN_COMBAT_TIMING.hit.contact-.24)<1e-12);
 }
});

test('closed-hand geometry is opt-in, validated and leaves relaxed legacy pixels untouched',()=>{
 for(const view of views)for(const height of sizes){
  const style={view,height};let visibleDifference=false;
  // At small sizes a subpixel change can quantize identically in one pose.
  // The option must remain visibly distinct across the gesture, not every frame.
  for(const t of[.28,.34,.44,.56]){const pose=humanCombat2D('punch',t,style).pose;assert.equal(pose.fists,true);const a=renderHuman2D(style,pose),b=renderHuman2D(style,{...pose,fists:false});if(a.pixels.length!==b.pixels.length||a.pixels.some((v,i)=>v!==b.pixels[i]))visibleDifference=true;}
  assert(visibleDifference,`${view}/${height}`);assert.deepEqual(renderHuman2D(style,{}).pixels,renderHuman2D(style,{fists:false}).pixels);
 }

 assert.throws(()=>humanRig2D({}, {fists:'yes'}),/fists/);
});
test('broad-view jab and recovery keep the fist near the chest instead of dipping to the waist',()=>{
 for(const view of['front','back'])for(const height of sizes)for(const build of['slender','regular','broad'])for(let i=20;i<=90;i++){
  const style={view,height,build},q=humanCombat2D('punch',i/100,style),r=humanRig2D(style,q.pose);assert(q.anchor[1]<=r.chest[1]+2*r.scale,`${view}/${height}/${build}/${i}`);
 }
});

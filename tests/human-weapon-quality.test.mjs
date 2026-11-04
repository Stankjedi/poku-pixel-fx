import test from'node:test';import assert from'node:assert/strict';
import{humanWeapon2D,renderHumanWeapon2D,drawHumanWeapon2D,humanGrip2D,HUMAN_WEAPON_TIMING,humanRig2D,renderHuman2D,humanContactPixel2D,createFrame,Painter,hex}from'../build/core/index.js';
const views=['front','three-quarter','side','back'],kinds=['sword','bow'],sizes=[32,48,72],points=['head','chest','pelvis','leftShoulder','rightShoulder','leftElbow','rightElbow','leftHand','rightHand','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle'];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function pixel(sp,p){const x=p[0]-sp.x,y=p[1]-sp.y;return x>=0&&y>=0&&x<sp.w&&y<sp.h?sp.pixels[y*sp.w+x]:0;}
function connected(sp){const first=sp.pixels.findIndex(Boolean),seen=new Set([first]),stack=[first];while(stack.length){const i=stack.pop(),x=i%sp.w,y=Math.floor(i/sp.w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*sp.w+xx;if(xx>=0&&yy>=0&&xx<sp.w&&yy<sp.h&&sp.pixels[j]&&!seen.has(j)){seen.add(j);stack.push(j);}}}return seen.size===sp.mask.data.reduce((a,b)=>a+b,0);}
function mirrored(a,b){assert.equal(b.x,-a.x-a.w);assert.equal(b.y,a.y);assert.equal(b.w,a.w);assert.equal(b.h,a.h);for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){assert.equal(a.pixels[y*a.w+x],b.pixels[y*a.w+a.w-x-1]);assert.equal(a.mask.data[y*a.w+x],b.mask.data[y*a.w+a.w-x-1]);}}
test('weapon choreography retains fixed bones, reachable grips and planted feet',()=>{
 for(const view of views)for(const build of['slender','regular','broad'])for(const height of[32,48,72,192])for(const kind of kinds)for(let i=0;i<=140;i++){
  const style={view,build,height},q=humanWeapon2D(kind,i/100,style),r=humanRig2D(style,q.pose);assert.deepEqual(r.clamped,[],`${view}/${build}/${kind}/${i}`);
  for(const side of['left','right'])for(const[a,b,l]of[['Shoulder','Elbow','upperArm'],['Elbow','Hand','forearm'],['Hip','Knee','thigh'],['Knee','Ankle','shin']])assert(Math.abs(dist(r[side+a],r[side+b])-r.lengths[l])<1e-6);
  assert.equal(q.pose.fists,true);assert(Math.abs(r.leftAnkle[1]+4*r.scale)<1e-6);assert(Math.abs(r.rightAnkle[1]+4*r.scale)<1e-6);assert(dist(q.geometry.grip,humanGrip2D(r,q.geometry.hand))<1e-9);
 }
});
test('weapon one-shots clamp, sword returns ready and bow finishes unloaded',()=>{
 for(const view of views)for(const kind of kinds){const style={view},d=HUMAN_WEAPON_TIMING[kind].duration,a=humanWeapon2D(kind,0,style),b=humanWeapon2D(kind,d,style);assert.deepEqual(a.pose,b.pose);assert.equal(b.done,true);assert.equal(b.projectile,null);assert.equal(b.loop,false);assert.equal(b.phase,kind==='sword'?'ready':'unloaded');assert.deepEqual(humanWeapon2D(kind,-10,style).pose,a.pose);assert.deepEqual(humanWeapon2D(kind,100,style).pose,b.pose);if(kind==='bow'){assert(a.geometry.loaded);assert(!b.geometry.loaded);}}
});
test('joint and grip paths are continuous at phase boundaries and around the side shoulder',()=>{
 for(const view of views)for(const kind of kinds){const style={view};for(const t of[0,.28,.4,.44,.52,.66,.7,.9,1.2,1.4]){const a=humanWeapon2D(kind,t-1e-7,style),b=humanWeapon2D(kind,t+1e-7,style),ra=humanRig2D(style,a.pose),rb=humanRig2D(style,b.pose);for(const key of points)assert(dist(ra[key],rb[key])<.003,`${view}/${kind}/${key}/${t}`);assert(dist(a.geometry.grip,b.geometry.grip)<.003);}
  let prev;for(let i=0;i<=1400;i++){const q=humanWeapon2D(kind,i/1000,style),r=humanRig2D(style,q.pose);if(prev)for(const key of points)assert(dist(prev[key],r[key])<1.5,`${view}/${kind}/${i}/${key}`);prev=r;}
 }
});
test('bow nock follows drawing palm until release, then exactly one arrow leaves',()=>{
 for(const view of views)for(const height of sizes)for(const facing of['left','right']){
  const style={view,height,facing};for(const t of[0,.1,.3,.4,.699999]){const q=humanWeapon2D('bow',t,style);assert(q.geometry.loaded);assert.equal(q.projectile,null);assert(dist(q.geometry.nock,q.geometry.drawGrip)<1e-9);}
  const pre=humanWeapon2D('bow',.7-1e-10,style),release=humanWeapon2D('bow',.7,style),later=humanWeapon2D('bow',.8,style);assert(!release.geometry.loaded);assert(release.projectile);assert(dist(pre.geometry.drawGrip,release.projectile.tail)<1e-6);assert(dist(pre.geometry.arrowTip,release.projectile.tip)<1e-6);assert(dist(pre.geometry.nock,release.geometry.nock)<1e-6);assert(dist(release.projectile.tip,later.projectile.tip)>0);assert(Math.abs(dist(release.projectile.tail,release.projectile.tip)-dist(later.projectile.tail,later.projectile.tip))<1e-6);
 }
});
test('palms own hilt and string intersections, including mirrored and back-view art',()=>{
 for(const view of views)for(const height of sizes)for(const facing of['left','right'])for(const kind of kinds)for(const t of[0,.28,.44,.6,.72,1.1]){
  const style={view,height,facing,outline:null},q=renderHumanWeapon2D(kind,t,style),body=renderHuman2D(style,q.sample.pose),grips=[q.sample.geometry.grip,...(kind==='bow'?[q.sample.geometry.drawGrip]:[])];
  for(const grip of grips){const p=humanContactPixel2D(body,grip);assert(p,JSON.stringify({view,height,facing,kind,t}));assert.equal(pixel(q.actor,p),pixel(body,p));}
 }
});
test('actor/held material is connected, each released projectile stays separate and all buffers are padded',()=>{
 for(const view of views)for(const height of sizes)for(const kind of kinds)for(const t of[0,.14,.28,.4,.44,.6,.7,.76,.95,1.2,1.4]){
  const q=renderHumanWeapon2D(kind,t,{view,height,outline:null});for(const sp of[q.actor,q.projectile].filter(Boolean)){
   assert(connected(sp),JSON.stringify({view,height,kind,t,projectile:sp===q.projectile}));for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){const i=y*sp.w+x;assert.equal(sp.mask.data[i],sp.pixels[i]?1:0);if(sp.pixels[i]){assert.equal(sp.pixels[i]>>>24,255);assert(x>0&&y>0&&x<sp.w-1&&y<sp.h-1);}}
  }
 }
});
test('one union contour never recolors body/weapon/string interior pixels',()=>{
 const ink=hex('#ff00ff')>>>0;for(const view of views)for(const height of sizes)for(const kind of kinds)for(const t of[0,.28,.44,.6,.72]){
  const a=renderHumanWeapon2D(kind,t,{view,height,outline:null}).actor,b=renderHumanWeapon2D(kind,t,{view,height,outline:'#ff00ff'}).actor;assert.deepEqual([a.x,a.y,a.w,a.h],[b.x,b.y,b.w,b.h]);for(let i=0;i<a.pixels.length;i++){if(a.pixels[i])assert.equal(a.pixels[i],b.pixels[i]);else if(b.pixels[i]){assert.equal(b.pixels[i],ink);assert(a.pixels[i-1]||a.pixels[i+1]||a.pixels[i-a.w]||a.pixels[i+a.w]);}}
 }
});
test('weapon geometry, cues and both raster layers mirror coherently',()=>{
 for(const view of views)for(const height of sizes)for(const kind of kinds)for(const t of[0,.28,.44,.6,.72,1.1]){
  const style={view,height},a=renderHumanWeapon2D(kind,t,style),b=renderHumanWeapon2D(kind,t,{...style,facing:'left'});mirrored(a.actor,b.actor);assert.deepEqual(a.sample.pose,b.sample.pose);if(a.projectile)mirrored(a.projectile,b.projectile);
  for(const key of['grip','tip','direction','upperTip','lowerTip','nock','drawGrip','arrowTip'])if(a.sample.geometry[key]){assert(Math.abs(a.sample.geometry[key][0]+b.sample.geometry[key][0])<1e-8,key);assert(Math.abs(a.sample.geometry[key][1]-b.sample.geometry[key][1])<1e-8,key);}
  assert(Math.abs(a.sample.cue.position[0]+b.sample.cue.position[0])<1e-8);assert(Math.abs(a.sample.cue.position[1]-b.sample.cue.position[1])<1e-8);
 }
});
test('sample cues are frozen, deterministic, scale once and correspond to the authored release/slash',()=>{
 for(const view of views)for(const kind of kinds)for(const height of sizes){const t=HUMAN_WEAPON_TIMING[kind].cue,style={view,height},a=humanWeapon2D(kind,t,style),b=humanWeapon2D(kind,t,{view,height:96});assert(Object.isFrozen(a.cue));assert(Object.isFrozen(a.cue.position));assert(a.cueActive);assert.deepEqual(a,humanWeapon2D(kind,t,style));assert(dist(a.cue.position,b.cue.position.map(x=>x*height/96))<1e-6);assert(dist(a.cue.position,a.geometry.tip)<1e-6);assert.deepEqual(a.pose,b.pose);assert.equal(humanWeapon2D(kind,t-.1,style).cueActive,false);assert.equal(humanWeapon2D(kind,t+.1,style).cueActive,false);}
});
test('Painter placement/double mirror work and reduced motion emits neither cue nor projectile',()=>{
 for(const view of views)for(const kind of kinds){const a=createFrame(320,200),b=createFrame(320,200);drawHumanWeapon2D(new Painter(a).place(160,160),kind,.8,{view,height:72});drawHumanWeapon2D(new Painter(b).place(160,160,true),kind,.8,{view,height:72,facing:'left'});assert.deepEqual(a.color,b.color);
  const r0=humanWeapon2D(kind,0,{view},true),r1=humanWeapon2D(kind,1,{view},true);assert.deepEqual(r0.pose,r1.pose);assert.deepEqual(r0.geometry,r1.geometry);assert.equal(r1.cue,null);assert.equal(r1.projectile,null);assert(!r1.cueActive);
 }
 for(const kind of['axe',null])assert.throws(()=>humanWeapon2D(kind,0));for(const t of[NaN,Infinity])assert.throws(()=>humanWeapon2D('bow',t));for(const style of[{height:31},{view:'overhead'},{facing:'up'}])assert.throws(()=>renderHumanWeapon2D('sword',0,style));assert.throws(()=>humanGrip2D(humanRig2D(),'wrong'));
});

test('sword blade heel stays joined to its guard through every sampled slash/recovery frame',()=>{
 for(const view of views)for(const height of sizes)for(let i=0;i<=60;i++){const t=i*.02,sp=renderHumanWeapon2D('sword',t,{view,height,outline:null}).actor;assert(connected(sp),`${view}/${height}/${t}`);}
});

test('64x64 and 128x128 native held-actor canvases contain every material pixel without scaling bitmaps',()=>{
 for(const size of[64,128])for(const view of views)for(const kind of kinds)for(const t of[0,.2,.28,.4,.44,.6,.7,.9,1.2,1.4]){
  const sp=renderHumanWeapon2D(kind,t,{view,height:size*.5625}).actor,ox=Math.floor(size*.44),oy=Math.floor(size*.875);
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++)if(sp.pixels[y*sp.w+x]){const xx=x+sp.x+ox,yy=y+sp.y+oy;assert(xx>0&&yy>0&&xx<size-1&&yy<size-1,`${size}/${view}/${kind}/${t}/${xx},${yy}`);}
 }
});
test('changing canvas padding alone preserves a shared scene pixel grid',()=>{
 for(const view of views)for(const kind of kinds){
  const a=createFrame(64,64),b=createFrame(128,128),style={view,height:36};
  // Projectiles belong to their own layer; compare the held actor only.
  const sp=renderHumanWeapon2D(kind,.6,style).actor;
  for(const[f,ox,oy]of[[a,28,56],[b,56,112]]){const p=new Painter(f).place(ox,oy);for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++)if(sp.pixels[y*sp.w+x])p.px(sp.x+x,sp.y+y,sp.pixels[y*sp.w+x]);}
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(a.color[y*64+x],b.color[(y+56)*128+x+28]);
 }
});

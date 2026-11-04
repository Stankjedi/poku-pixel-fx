import test from 'node:test';import assert from 'node:assert/strict';
import{humanWeapon2D,renderHumanWeapon2D,humanCombat2D,humanRig2D,HUMAN_WEAPON_TIMING,createFrame,Painter,hex}from'../build/core/index.js';
const views=['front','three-quarter','side','back'];const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
test('sword weight shifts through supported hips, without changing grounded foot positions',()=>{
 for(const view of views){const style={view,height:96},qs=[0,.28,.34,.44,.56,.78,1.2].map(t=>humanWeapon2D('sword',t,style)),rs=qs.map(q=>humanRig2D(style,q.pose));
  assert(rs[1].pelvis[0]<rs[0].pelvis[0]-2);assert(rs[3].pelvis[0]>rs[1].pelvis[0]+7);
  for(const r of rs){assert(r.pelvis[0]>r.leftAnkle[0]&&r.pelvis[0]<r.rightAnkle[0]);assert.deepEqual(r.clamped,[]);for(const foot of['leftAnkle','rightAnkle'])assert(distance(r[foot],rs[0][foot])<1e-7);}
  // Preparation is clearly raised; contact lies ahead of the holding shoulder.
  const hand=qs[1].geometry.hand;assert(qs[1].geometry.grip[1]<rs[1].head[1]);assert(qs[3].geometry.grip[0]>rs[3][`${hand}Shoulder`][0]+25);
 }
});
test('sword contact holds briefly and recovery gathers by a different route',()=>{
 for(const view of views){const style={view},a=humanWeapon2D('sword',.44,style),hold=humanWeapon2D('sword',.46,style);assert.deepEqual(a.pose,hold.pose);assert.deepEqual(a.geometry,hold.geometry);
  const prep=humanWeapon2D('sword',.28,style),gather=humanWeapon2D('sword',.94,style);assert(gather.geometry.grip[1]>prep.geometry.grip[1]+20);assert.equal(HUMAN_WEAPON_TIMING.sword.follow,.56);
 }
});
test('blade stays constant length and is aligned with the forearm at contact',()=>{
 for(const view of views)for(const height of[36,72,96])for(const facing of['right','left'])for(const t of[0,.28,.4,.44,.56,.94]){
  const style={view,height,facing},q=humanWeapon2D('sword',t,style),r=humanRig2D(style,q.pose);assert(Math.abs(distance(q.geometry.grip,q.geometry.tip)-37*r.scale)<1e-7);
  if(t===.44){const elbow=r[`${q.geometry.hand}Elbow`],hand=r[`${q.geometry.hand}Hand`],len=distance(elbow,hand),d=q.geometry.direction;assert(((hand[0]-elbow[0])*d[0]+(hand[1]-elbow[1])*d[1])/len>.98);}
 }
});
test('default sword art has a material edge, not a thick contour around the blade',()=>{
 const style={view:'side',height:72},q=renderHumanWeapon2D('sword',.44,style),plain=renderHumanWeapon2D('sword',.44,{...style,outline:null}),ink=hex('#252633')>>>0,grip=q.sample.geometry.grip;
 for(let y=0;y<q.actor.h;y++)for(let x=0;x<q.actor.w;x++)if(q.actor.x+x>grip[0]+8){const i=y*q.actor.w+x;assert.notEqual(q.actor.pixels[i],ink);assert.equal(q.actor.pixels[i],plain.actor.pixels[i]);}
});
test('combat transfers weight before extension and returns the fist before hips settle',()=>{
 for(const view of views){const a=humanCombat2D('punch',.2,{view}),b=humanCombat2D('punch',.34,{view}),c=humanCombat2D('punch',.72,{view}),ready=humanCombat2D('punch',0,{view});
  assert(b.pose.x-a.pose.x>=7);assert(c.pose.x>ready.pose.x);
  for(const q of[a,b,c])for(const hand of['leftHand','rightHand'])assert(q.pose[hand].every(Number.isFinite));
  // Blocking yields slightly after its cue rather than freezing as a rigid statue.
  assert(humanCombat2D('block',.5,{view}).pose.x<humanCombat2D('block',.36,{view}).pose.x);
 }
});
test('64 and 128 canvases share exactly the same 36px actor and pixel grid',()=>{
 for(const view of views)for(const t of[0,.28,.4,.44,.56,.78,1.2]){
  const sp=renderHumanWeapon2D('sword',t,{view,height:36}).actor,frames=[createFrame(64,64),createFrame(128,128)];
  for(const[i,f]of frames.entries()){const p=new Painter(f).place(28+i*32,56+i*32);for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++)if(sp.pixels[y*sp.w+x])p.px(sp.x+x,sp.y+y,sp.pixels[y*sp.w+x]);}
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(frames[0].color[y*64+x],frames[1].color[(y+32)*128+x+32]);
 }
});

test('blade interior is hole-free and its exposed steel is four-connected at native resolutions',()=>{
 const steel=new Set(['#536974','#a4b8bd','#dae2dd','#738993'].map(c=>hex(c)>>>0));
 for(const view of views)for(const height of[32,36,48,72,96,128,192])for(let frame=0;frame<=60;frame++){
  const q=renderHumanWeapon2D('sword',frame*.02,{view,height,outline:null}),a=q.actor,g=q.sample.geometry,seen=new Set();let exposedComponents=0;
  for(let j=0;j<a.pixels.length;j++)if(steel.has(a.pixels[j])&&!seen.has(j)){
   let exposed=false,stack=[j];seen.add(j);
   while(stack.length){const k=stack.pop(),x=k%a.w,y=Math.floor(k/a.w),dx=x+a.x+.5-g.grip[0],dy=y+a.y+.5-g.grip[1];
    exposed ||= dx*g.direction[0]+dy*g.direction[1]>8*height/96;
    for(const[xx,yy]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const n=yy*a.w+xx;if(xx>=0&&xx<a.w&&yy>=0&&yy<a.h&&steel.has(a.pixels[n])&&!seen.has(n)){seen.add(n);stack.push(n);}}
   }
   // The small heel can be separated by the gold guard; the exposed blade cannot.
   if(exposed)exposedComponents++;
  }
  assert.equal(exposedComponents,1,`${view}/${height}/${frame}: detached blade cells`);
  for(let y=1;y<a.h-1;y++)for(let x=1;x<a.w-1;x++){const j=y*a.w+x;assert(a.pixels[j]||![j-1,j+1,j-a.w,j+a.w].every(k=>steel.has(a.pixels[k])),`${view}/${height}/${frame}: blade pinhole`);}
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurlFlow2D,createCinematicParticles2D,createFrame,Painter} from '../build/core/index.js';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const draw=(emitter,t)=>{const f=createFrame(160,160),p=new Painter(f).place(80,80);emitter.draw(p,t);return f;};
const base={count:24,seed:17,palette:['#fff2c1','#ff9b36','#a72e27'],duration:.4,life:[.4,.7],speed:[18,32],style:'ribbon',size:[3,7],emission:0};

test('shared curl field is deterministic, spatially coherent and snapshots its options',()=>{
 const drift=[3,-9],a=createCurlFlow2D({seed:41,scale:23,strength:35,drift}),b=createCurlFlow2D({seed:41,scale:23,strength:35,drift:[3,-9]});
 const q=a(12.3,-7.4,.8);drift[0]=1000;assert.deepEqual(a(12.3,-7.4,.8),q);assert.deepEqual(b(12.3,-7.4,.8),q);
 const close=a(12.301,-7.401,.8);assert.ok(Math.hypot(close[0]-q[0],close[1]-q[1])<.1);
 assert.notDeepEqual(createCurlFlow2D({seed:42})(12.3,-7.4,.8),q);
 for(const x of[-30.2,7.1,18.4]){
  const h=.001,dx1=a(x+h,12.3,.2),dx0=a(x-h,12.3,.2),dy1=a(x,12.3+h,.2),dy0=a(x,12.3-h,.2);
  near((dx1[0]-dx0[0]+dy1[1]-dy0[1])/(2*h),0,.002);
 }
});
test('flow trajectories match constant acceleration and drag solutions',()=>{
 for(const drag of[0,.8]){
  const e=createCinematicParticles2D({...base,count:1,duration:0,life:1,source:[1,2],speed:0,gravity:8,drag,flow:()=>[12,-4]});
  for(const t of[0,.001,.3333,.73,.999]){
   const q=e.sample(t)[0];
   const v=drag?(1-Math.exp(-drag*t))/drag:t, p=drag?(t-v)/drag:t*t/2;
   near(q.x,1+12*p);near(q.y,2+4*p);near(q.vx,12*v);near(q.vy,4*v);
  }
 }
});
test('field callbacks are baked once and render order cannot change paths',()=>{
 let calls=0,force=10,sources=0;
 const e=createCinematicParticles2D({...base,source:()=>{sources++;return[0,0];},flow:(x,y,t)=>{calls++;return[force+Math.sin(y),-7+Math.cos(x+t)];}});
 assert.equal(sources,base.count);assert.ok(calls>base.count);const before=calls,frame=draw(e,.5),state=e.sample(.5);
 force=1000;e.sample(.1);draw(e,.8);assert.deepEqual(e.sample(.5),state);assert.deepEqual(draw(e,.5),frame);assert.equal(calls,before);
 assert.deepEqual(e.sample(e.end),[]);assert.ok(draw(e,e.end).color.every(c=>c===0));
});
test('reported velocity is the derivative of the interpolated force trajectory',()=>{
 const e=createCinematicParticles2D({...base,count:1,duration:0,life:1,flow:createCurlFlow2D({seed:19})});
 for(const t of[.02313,.4,.54321,.81234]){const h=1e-6,q=e.sample(t)[0],a=e.sample(t-h)[0],b=e.sample(t+h)[0];near((b.x-a.x)/(2*h),q.vx,2e-5);near((b.y-a.y)/(2*h),q.vy,2e-5);}
});
test('wispy width keeps palette and direct-time identity while breaking uniform capsule sides',()=>{
 const e=createCinematicParticles2D({...base,ribbonProfile:'wispy',flow:createCurlFlow2D({seed:3})}),a=draw(e,.5);
 e.sample(.9);assert.deepEqual(draw(e,.5),a);assert.ok(a.color.some(Boolean));assert.ok(a.light.every(c=>c===0));
 const smooth=createCinematicParticles2D({...base,flow:createCurlFlow2D({seed:3})});assert.notDeepEqual(a.color,draw(smooth,.5).color);
 const legacy=createCinematicParticles2D(base),explicit=createCinematicParticles2D({...base,ribbonProfile:'smooth'});
 for(const t of[.1,.3,.7])assert.deepEqual(draw(legacy,t),draw(explicit,t));
 const opts={...base,ribbonProfile:'wispy'},snap=createCinematicParticles2D(opts),f=draw(snap,.5);opts.ribbonProfile='smooth';assert.deepEqual(draw(snap,.5),f);
});
test('flow guards invalid inputs and its memory budget before calling a field',()=>{
 for(const patch of[{flow:4},{flow:()=>[0,0],curl:{amplitude:0,frequency:1}},{flowStep:.01},{flow:()=>[0,0],flowStep:0},
  {flow:()=>[NaN,0]},{flow:()=>[0]},{flow:()=>[0,0],flowStep:Infinity},{style:'ember',ribbonProfile:'wispy'},{ribbonProfile:'bad'}])
  assert.throws(()=>createCinematicParticles2D({...base,...patch}),RangeError);
 let calls=0;assert.throws(()=>createCinematicParticles2D({...base,count:8192,life:3,flow:()=>{calls++;return[0,0];}}),/budget/);assert.equal(calls,0);
 const empty=createCinematicParticles2D({...base,count:0,flow:()=>{throw Error('must not call');}});assert.deepEqual(empty.sample(.1),[]);
 for(const o of[null,[],3,{seed:-1},{seed:1.5},{scale:0},{scale:NaN},{strength:-1},{drift:[Infinity,0]},{drift:[0]}])assert.throws(()=>createCurlFlow2D(o),RangeError);
 assert.throws(()=>createCurlFlow2D()(Infinity,0,0),RangeError);
});

test('large drag uses bounded stable substeps instead of amplifying motion',()=>{
 const e=createCinematicParticles2D({...base,count:1,duration:0,life:1,speed:100,angle:0,spread:0,drag:100,flowStep:1/30,flow:()=>[0,0]});
 for(const t of[.005,.05,.5,.99]){const q=e.sample(t)[0];near(q.x,(1-Math.exp(-100*t)),5e-5);near(q.vx,100*Math.exp(-100*t),.005);assert.ok(q.x>=0&&q.x<=1.00001);}
 let calls=0;assert.throws(()=>createCinematicParticles2D({...base,count:1,life:1,drag:1e308,flow:()=>{calls++;return[0,0];}}),/budget/);assert.equal(calls,0);
});

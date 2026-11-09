import test from 'node:test';
import assert from 'node:assert/strict';
import {createFracture2D, createFrame, Painter, PAL} from '../build/core/index.js';
const options = {polygon:[[-20,-20],[15,-25],[24,4],[7,25],[-19,18]],palette:PAL.ice,count:19,seed:17,release:.3};
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const area=poly=>Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2);
function inside(poly,q){return poly.every((p,i)=>{const n=poly[(i+1)%poly.length];return(n[0]-p[0])*(q[1]-p[1])-(n[1]-p[1])*(q[0]-p[0])>=-1e-7})}
test('convex fracture partitions the original area into unequal bounded cells with stable identities',()=>{
 for(const seed of[0,17,0xffffffff])for(const count of[2,19,64]){
  const f=createFracture2D({...options,seed,count});assert.equal(f.pieces.length,count);
  near(f.pieces.reduce((s,p)=>s+p.area,0),f.area);near(f.area,area(options.polygon));
  assert.ok(new Set(f.pieces.map(p=>p.vertices.length)).size>1||count===2);
  assert.ok(new Set(f.pieces.map(p=>p.area.toFixed(2))).size>count/2);
  for(const q of f.sample(.2)){for(const p of q.points)assert.ok(inside(options.polygon,p));near(area(q.points),f.pieces[q.id].area);}
 }
 const cw=createFracture2D({...options,polygon:options.polygon.slice().reverse()});assert.deepEqual(cw.sample(.6),createFracture2D(options).sample(.6));
});
test('release keeps exact geometry; afterward rigid pieces rotate and follow gravity with no scale loss',()=>{
 const f=createFracture2D(options),before=f.sample(.3-1e-8),at=f.sample(.3),after=f.sample(.3+1e-8);
 for(const q of at){assert.deepEqual(q.points,before[q.id].points);near(q.position[0],after[q.id].position[0],1e-5);assert.deepEqual(before[q.id].velocity,[0,0]);}
 for(const t of[.35,.6,.9])for(const q of f.sample(t)){
  near(area(q.points),f.pieces[q.id].area);assert.ok(q.angle!==0);const dt=1e-6, a=f.sample(t-dt)[q.id],b=f.sample(t+dt)[q.id];
  near((b.position[0]-a.position[0])/(2*dt),q.velocity[0],1e-5);near((b.position[1]-a.position[1])/(2*dt),q.velocity[1],1e-5);
 }
 assert.ok(f.sample(.9).some(q=>q.velocity[1]>0));assert.deepEqual(f.sample(f.end),[]);
});
test('fracture snapshots caller inputs, allows direct seeking and emits no light',()=>{
 const o=structuredClone(options),f=createFracture2D(o),saved=f.sample(.65);o.polygon[0].fill(999);o.palette.fill('#000');
 const q=f.sample(.65);q[0].position.fill(999);q[0].points[0].fill(999);f.sample(3);f.sample(-10);assert.deepEqual(f.sample(.65),saved);
 assert.ok(Object.isFrozen(f)&&Object.isFrozen(f.pieces)&&Object.isFrozen(f.pieces[0].vertices[0]));
 const frame=createFrame(180,180),p=new Painter(frame).place(90,90);f.draw(p,.65);assert.ok(frame.color.some(Boolean));assert.ok(frame.light.every(c=>!c));
 assert.deepEqual(f.sample(.65),createFracture2D(options).sample(.65));assert.notDeepEqual(f.sample(.65),createFracture2D({...options,seed:18}).sample(.65));
});
test('invalid shapes including self-crossing stars and numeric controls fail explicitly',()=>{
 const star=Array.from({length:5},(_,i)=>[Math.cos(i*4*Math.PI/5)*20,Math.sin(i*4*Math.PI/5)*20]);
 for(const patch of[{polygon:star},{polygon:[[0,0],[2,0],[1,0]]},{polygon:[[0,0],[2,0],[1,1],[2,2],[0,2]]},
  {polygon:[[0,0],[600,0],[0,1]]},{polygon:[[0,0],[0,0],[1,1]]},{polygon:null},{palette:[]},{count:1},{count:65},{seed:-1},
  {release:Infinity},{release:1e308},{life:[0,1]},{life:null},{speed:[-1,2]},{gravity:null},{drag:-1},{impulse:[NaN,0]}])
   assert.throws(()=>createFracture2D({...options,...patch}),RangeError);
 assert.throws(()=>createFracture2D(null),RangeError);
 const f=createFracture2D(options);assert.throws(()=>f.sample(Infinity),RangeError);assert.throws(()=>f.draw({},.5,{cracks:2}),RangeError);
});
test('small translated cells retain inside centroids and translation-invariant area/pivots',()=>{
 const polygon=[[500,500],[500.011,500],[500.011,500.011],[500,500.011]],f=createFracture2D({...options,polygon,count:64,seed:0});
 const local=createFracture2D({...options,polygon:polygon.map(([x,y])=>[x-500,y-500]),count:64,seed:0});
 near(f.pieces.reduce((a,p)=>a+p.area,0),.011**2,1e-12);
 for(const p of f.pieces){assert.ok(inside(polygon,p.center));near(p.center[0]-500,local.pieces[p.id].center[0],1e-9);near(p.center[1]-500,local.pieces[p.id].center[1],1e-9);}
 for(const patch of[{palette:Array(3)},{palette:[{toString(){return '#fff'}}]},{polygon:Array(3)},{impulse:Array(2)}])assert.throws(()=>createFracture2D({...options,...patch}),RangeError);
});

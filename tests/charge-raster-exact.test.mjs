import test from 'node:test';import assert from 'node:assert/strict';
import{createChargeVolume2D,createFrame,Painter,PAL}from'../build/core/index.js';
import{createChargeVolume2D as original}from'./fixtures/charge-volume-original.mjs';
const factories=[original,createChargeVolume2D];
const capture=(v,s,points)=>{let bounds,values=[];v.draw({shade(...args){bounds=args.slice(0,4);const fn=args[4];values=points.map(([x,y])=>{const o={c:0,a:1,l:0,k:0};fn(x,y,o);return o});}},s);return{bounds,values}};
test('charge raster keeps original states, shader bounds and floating outputs across seeds and extremes',()=>{
 for(const seed of[0,1,17,218,0x80000000,0xffffffff]){
  const [a,b]=factories.map(f=>f({seed,palette:PAL.ice}));
  for(let n=0;n<100;n++){
   const s={time:Math.sin(n*13.1)*3600,position:[Math.sin(n)*17,Math.cos(n)*13],size:[.001+(n%23)*5,.002+(n%19)*6],angle:Math.sin(n*7)*1e6,opacity:(n%11)/10,progress:(n%17)/16,id:n%4===0?8191:n};
   const points=Array.from({length:27},(_,i)=>[s.position[0]+Math.sin(i*13.8+n)*s.size[0]*1.4,s.position[1]+Math.cos(i*3.7+n)*s.size[1]*1.4]);
   assert.deepEqual(b.sample(s),a.sample(s));assert.deepEqual(capture(b,s,points),capture(a,s,points));
  }
  for(const size of[[Number.MIN_VALUE,128],[128,Number.MIN_VALUE],[128,128]])for(const angle of[0,Math.PI/2,1e300]){
   const s={time:-3600,position:[0,0],size,angle,id:8191},points=[[0,0],[.5,.5],[1.17,0],[-1.17,0],[1e300,-1e300]];
   assert.deepEqual(capture(b,s,points),capture(a,s,points));
  }
 }
});
test('charge raster preserves overlapping batches and both buffers through reverse, skip and repeated draws',()=>{
 for(const seed of[1,218,0xffffffff])for(const order of[[0,1,2,3],[3,1,0,2],[2,2,0,3]]){
  const vs=factories.map(f=>f({seed,palette:PAL.arcane}));
  for(const time of[.15,.9,.4,.9,1.3,.01]){
   const frames=vs.map(v=>{const f=createFrame(128,128),p=new Painter(f).place(64,64);f.color.fill(0x611d170a);f.light.fill(0x00050403);
    for(const id of order)v.draw(p,{time:time+id*.071,position:[id*3.5-5,id*2-3],size:[18+id*3,13+id],angle:id*.7,opacity:.7,progress:time%1,id});return f;});
   assert.deepEqual(frames[1].color,frames[0].color);assert.deepEqual(frames[1].light,frames[0].light);
  }
 }
});
test('retained and nested shade callbacks keep their own exact draw geometry',()=>{
 const palette=PAL.fire,states=[{time:.12,position:[0,0],size:[19,11],id:1},{time:.57,position:[4,-7],size:[7,18],id:2}];
 const result=factory=>{const v=factory({palette,seed:218}),callbacks=[];v.draw({shade(...args){callbacks.push(args);v.draw({shade(...inner){callbacks.push(inner)}},states[1]);}},states[0]);
  v.draw({shade(){}},{...states[0],time:1,id:8191});return callbacks.reverse().map(args=>{const fn=args[4];return{bounds:args.slice(0,4),values:Array.from({length:80},(_,i)=>{const o={c:0,a:1,l:0,k:0};fn(Math.sin(i)*25,Math.cos(i*7)*25,o);return o})}});};
 assert.deepEqual(result(createChargeVolume2D),result(original));
});

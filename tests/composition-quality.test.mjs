import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chain, createFx, createFrame, clearFrame, painterFor, enableHDRLight, hex } from '../build/core/index.js';
import { loadEffect } from '../build-tools/tools/lib/fxlib.mjs';
import * as fireballThrow from '../build/fx/moves/fireball-throw.js';
const WHITE = 0xffffffff, RED = 0xff0000ff;
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
const mark = { meta: { duration: 2, loop: true }, draw(p) { p.px(0,0,WHITE); p.light(0,0,WHITE,.4); } };
const move = (cues, duration=4) => ({ meta: { duration }, create: chain(cues) });
const render = (mod, t=0, options={}) => {
  const f = createFrame(96,80); enableHDRLight(f);
  const fx = createFx(mod, { x:48, y:40, ...options }); fx.update(t); fx.draw(f); return f;
};

test('initial cues are drawn immediately and update(0) does not recreate or advance them', () => {
  let made=0, steps=0;
  const mod=move([{fx:{...mark, create(){made++;return {draw:mark.draw,update(){steps++}}}}}]);
  const fx=createFx(mod,{x:5,y:5}),f=createFrame(10,10);
  fx.draw(f); assert.equal(f.color[55],WHITE);fx.update(0);fx.draw(clearFrame(f));
  assert.equal(made,1);assert.equal(steps,0);assert.equal(f.color[55],WHITE);
});

test('decimal cue boundaries activate and retire on the exact outer clock frame', () => {
  const f=render(move([{fx:mark,t:.95,x:4}]),.95);
  assert.equal(f.color[40*96+52],WHITE);
  const end=render(move([{fx:mark,until:.95}]),.95);
  assert.ok(end.color.every(v=>v===0));assert.ok(end.light.every(v=>v===0));
  assert.ok(render(move([{fx:mark,t:.95}]),.95-1e-6).color.every(v=>v===0));
});

test('a large update forwards only active time and creates each cue at most once', () => {
  let made=0,time=0;
  const fx={meta:{duration:3},create(){made++;return {update(dt){time+=dt},draw(){}}}};
  const seq=chain([{fx,t:.25,until:.75}])({});seq.update(1);seq.update(2);
  assert.equal(made,1);close(time,.5);
});

test('parent mirror and rotation transform child offsets and reverse local angles', () => {
  let observed;
  const child={meta:{duration:2},draw(p){observed=[p.tx,p.ty,p.fx,Math.atan2(p.sn,p.cs)];}};
  render(move([{fx:child,x:10,y:4,angle:.4}]),0,{x:40,y:30,flip:true,angle:Math.PI/2});
  close(observed[0],36);close(observed[1],20);assert.equal(observed[2],-1);close(observed[3],Math.PI/2-.4);
});

function transform(x,y,flip,angle) {
  const s=flip?-1:1,c=Math.cos(angle),n=Math.sin(angle);
  return [s*c,s*n,-n,c,x,y];
}
function mul(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
test('three-level nested transforms match independent affine multiplication for every flip', () => {
  for(const a of [false,true])for(const b of [false,true])for(const c of [false,true]){
    let observed;
    const leaf={...mark,draw:p=>{observed=[p.toX(0,0),p.toY(0,0),p.toX(2,3),p.toY(2,3)]}};
    const inner=move([{fx:leaf,x:3,y:-2,flip:c,angle:.23}]);
    const outer=move([{fx:inner,x:9,y:5,flip:b,angle:-.56}]);
    render(outer,0,{x:40,y:30,flip:a,angle:.74});
    const m=mul(mul(transform(40,30,a,.74),transform(9,5,b,-.56)),transform(3,-2,c,.23));
    [m[4],m[5],m[0]*2+m[2]*3+m[4],m[1]*2+m[3]*3+m[5]].forEach((v,i)=>close(v,observed[i]));
  }
});

test('nested drawing restores all parent placement, style and layer even if the child throws', () => {
  const f=createFrame(20,20), p=painterFor(f).place(8,9,true,.24);
  p.fade=.45;p.lightK=.3;p.particleStyle='classic';p.layer='back';
  const fields=['tx','ty','fx','cs','sn','fade','lightK','particleStyle','layer'];
  const state=()=>Object.fromEntries(fields.map(k=>[k,p[k]]));const before=state();
  const emptyBack=createFx(mark,{particleStyle:'refined'});emptyBack.draw(f,'back',p);
  assert.deepEqual(state(),before);
  const bad=createFx({...mark,draw(q){q.place(100,100);q.fade=0;q.lightK=0;q.particleStyle='refined';throw Error('deliberate');}});
  assert.throws(()=>bad.draw(f,'front',p),/deliberate/);assert.deepEqual(state(),before);
});

test('back and front layers stay separated and do not contaminate a parent continuation', () => {
  const back=hex('#123456')>>>0,front=hex('#abcdef')>>>0;
  const child={...mark,drawBack(p){p.px(0,0,back)},draw(p){p.px(1,0,front)}};
  const seq=chain([{fx:child}])({});
  const parent={meta:{duration:2},drawBack(p){seq.drawBack(p);assert.equal(p.layer,'back');assert.equal(p.particleStyle,'classic');p.px(2,0,RED)},draw:p=>seq.draw(p)};
  const fx=createFx(parent,{x:5,y:5,particleStyle:'classic'}),f=createFrame(12,12);
  fx.draw(f,'back');assert.equal(f.color[65],back);assert.equal(f.color[66],0);assert.equal(f.color[67],RED);
  fx.draw(f,'front');assert.equal(f.color[66],front);
});

test('parent and child light multiply before accumulation without dimming unrelated light', () => {
  const f=createFrame(96,80);enableHDRLight(f);painterFor(f).light(3,3,RED,.7);
  const neighbor=f.light[3*96+3],hdrNeighbor=f.hdrLight[3*(3*96+3)];
  const fx=createFx(move([{fx:mark,light:.5}]),{x:48,y:40,light:.3});fx.draw(f);
  assert.equal(f.light[3*96+3],neighbor);assert.equal(f.hdrLight[3*(3*96+3)],hdrNeighbor);
  close(f.hdrLight[3*(40*96+48)],.4*.5*.3);
  const dark=render(move([{fx:mark,light:.5}]),0,{light:0});
  assert.ok(dark.color.some(v=>v!==0));assert.ok(dark.light.every(v=>v===0));assert.ok(dark.hdrLight.every(v=>v===0));
});

test('stop fades nested color and light exactly once per level', () => {
  const mod=move([{fx:move([{fx:mark}])}]);
  const f=createFrame(96,80);enableHDRLight(f);const fx=createFx(mod,{x:48,y:40});
  fx.stop();fx.update(.15);fx.draw(f);
  assert.equal(f.color[40*96+48]>>>24,128);close(f.hdrLight[3*(40*96+48)],.2);
  fx.update(.15);fx.draw(clearFrame(f));assert.ok(f.color.every(v=>v===0));assert.ok(f.light.every(v=>v===0));
});

test('particle style is inherited through chains and an explicit cue style overrides it', () => {
  const styles=[];const child={...mark,draw:p=>styles.push(p.particleStyle)};
  render(move([{fx:move([{fx:child},{fx:child,particleStyle:'refined'}])}]),0,{particleStyle:'classic'});
  assert.deepEqual(styles,['classic','refined']);
});

test('palette fallback and explicit cue seed reach simulated construction and are resampled', () => {
  const seen=[];const child={meta:{duration:2,options:{palette:['#111','#555','#fff']}},create:o=>{seen.push(o);return {draw(){}}}};
  createFx(move([{fx:child},{fx:child,palette:['#f00'],seed:123}]),{palette:['#00f'],seed:8});
  assert.deepEqual(seen[0].palette,['#0000ff','#0000ff','#0000ff']);assert.equal(seen[0].seed,8);
  assert.deepEqual(seen[1].palette,['#ff0000','#ff0000','#ff0000']);assert.equal(seen[1].seed,123);
});

test('cue fades preserve coverage and fade only their own color and HDR light', () => {
  const mod=move([{fx:mark,t:.2,until:1.2,fadeIn:.2,fadeOut:.4},{fx:mark,x:8}]);
  const start=render(mod,.2),enter=render(mod,.3),hold=render(mod,.5),leave=render(mod,1);
  assert.equal(start.color[40*96+48],0);
  assert.equal(enter.color[40*96+48]>>>24,128);close(enter.hdrLight[3*(40*96+48)],.2);
  assert.equal(hold.color[40*96+48]>>>24,255);
  assert.equal(leave.color[40*96+48]>>>24,128);close(leave.hdrLight[3*(40*96+48)],.2);
  for(const f of [start,enter,hold,leave]){assert.equal(f.color[40*96+56],WHITE);close(f.hdrLight[3*(40*96+56)],.4)}
  assert.equal(render(mod,1.2).color[40*96+48],0);
});

test('overlapping cue fades and natural endpoints are deterministic; unbounded loops stay visible', () => {
  const short={...mark,meta:{duration:.4,loop:false}};
  const mod=move([{fx:short,fadeIn:.4,fadeOut:.4}]);
  assert.equal(render(mod,.2).color[40*96+48]>>>24,64);
  assert.ok(render(mod,.4).color.every(v=>v===0));
  assert.equal(render(move([{fx:mark,fadeOut:.4}]),1.2).color[40*96+48],WHITE);
});

test('trajectory callbacks retain move-time semantics and draws are repeatable', () => {
  const seen=[];const mod=move([{fx:mark,t:.25,x:t=>{seen.push(t);return t*10}}]);
  const fx=createFx(mod,{x:40,y:30}),f=createFrame(96,80);fx.update(.5);fx.draw(f);
  const first=f.color.slice();fx.draw(clearFrame(f));assert.deepEqual(f.color,first);seen.forEach(t=>close(t,.5));
});

test('invalid cue times and fade durations are rejected before drawing', () => {
  for(const bad of [{t:-1},{t:NaN},{until:-1},{until:NaN},{t:1,until:.5},{fadeIn:-1},{fadeIn:Infinity},{fadeOut:NaN}])
    assert.throws(()=>chain([{fx:mark,...bad}])({}),RangeError);
});

const originalBytes=readFileSync(new URL('./fixtures/chain-composition-before.json',import.meta.url));
const before=JSON.parse(originalBytes);
const fixedTick=JSON.parse(readFileSync(new URL('./fixtures/chain-composition-fixed-tick.json',import.meta.url),'utf8'));
// Preserve the original evidence. Its single update(t) used ceil(t*120) equal
// subdivisions, so it encoded a different simulation step length at every t.
assert.equal(createHash('sha256').update(originalBytes).digest('hex'),fixedTick.provenance.originalFixtureSha256);
for(const [id,reference] of Object.entries(before))test(`${id}: reviewed fixed-tick composition is identical across host frame rates`,async()=>{
  const e=await loadEffect(id),{canvas:_oldCanvas,...times}=reference,reviewed=fixedTick.effects[id];
  const {origin,size}=reviewed.canvas;
  for(const [time,originalHash] of Object.entries(times)){
    const expected=reviewed.frames[time];assert.equal(expected.originalHash,originalHash);
    for(const fps of [null,30,60,144,165]){
      const fx=createFx(e.mod,{x:origin[0],y:origin[1]}),f=createFrame(...size);
      if(fps===null)fx.update(+time);
      else for(let elapsed=0;elapsed<+time-1e-12;){const dt=Math.min(1/fps,+time-elapsed);fx.update(dt);elapsed+=dt;}
      fx.draw(f);
      assert.equal(createHash('sha256').update(f.color).update(f.light).digest('hex'),expected.hash,`t=${time}, host=${fps??'single update'}`);
    }
  }
});

test('polished fireball move is deterministic, honors zero light, recolors and ends empty', () => {
  const renderMove=(time,options={})=>{
    const f=createFrame(...fireballThrow.meta.size);enableHDRLight(f);
    const fx=createFx(fireballThrow,{x:fireballThrow.meta.origin[0],y:fireballThrow.meta.origin[1],...options});
    fx.update(time);fx.draw(f);return f;
  };
  for(const time of [.1,.94,.95,.98,1.41,2,fireballThrow.meta.duration]){
    const a=renderMove(time),b=renderMove(time);
    assert.deepEqual(a.color,b.color);assert.deepEqual(a.light,b.light);
    const dark=renderMove(time,{light:0});assert.ok(dark.light.every(v=>v===0));assert.ok(dark.hdrLight.every(v=>v===0));
    if(time===1.41||time===2)assert.ok(a.color.some(v=>v!==0),'impact must be inside the test canvas');
  }
  const base=renderMove(.5),tinted=renderMove(.5,{palette:['#001122','#00ccff','#ffffff']});
  assert.notDeepEqual(base.color,tinted.color);
  const end=renderMove(fireballThrow.meta.duration);assert.ok(end.color.every(v=>v===0));assert.ok(end.light.every(v=>v===0));
});

test('matched cue crossfades conserve local HDR illumination instead of flashing twice', () => {
  const mod=move([{fx:mark,until:1.1,fadeOut:.1},{fx:mark,t:1,fadeIn:.1}]);
  for(const t of [1,1.025,1.05,1.075,1.1]){
    const f=render(mod,t);close(f.hdrLight[3*(40*96+48)],.4);
  }
});

test('classic fireball preserves its original launch and reviewed fixed-tick impact across 205 frames', async () => {
  const {renderFrames}=await import('../build-tools/tools/lib/fxlib.mjs');
  const r=renderFrames(await loadEffect('moves/fireball-throw'),{diagnostics:true,options:{choreography:'classic'}});
  const expected=fixedTick.fireballClassic,hash=createHash('sha256'),prefix=createHash('sha256');
  for(const [i,frame] of r.frames.entries()){
    hash.update(frame.clear).update(frame.light);
    if(i<expected.unchangedPrefix.frames)prefix.update(frame.clear).update(frame.light);
  }
  assert.equal(r.n,205);assert.equal(r.n,expected.frames);
  assert.equal(hash.digest('hex'),expected.hash);
  assert.equal(prefix.digest('hex'),expected.unchangedPrefix.hash,expected.unchangedPrefix.reason);
});

test('the restored ice-lance release frame stays inside its expanded canvas', async () => {
  const e=await loadEffect('moves/ice-lance-throw'),[w,h]=e.meta.size,pad=24;
  assert.deepEqual(e.meta.size,[324,136]);assert.deepEqual(e.meta.origin,[96,134]);
  for(const time of [.8,.8+1/120,.85,1.14]){
    const fx=createFx(e.mod,{x:e.meta.origin[0],y:e.meta.origin[1]}),f=createFrame(w+2*pad,h+2*pad,-pad,-pad);
    fx.update(time);fx.draw(f);let visible=0;
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      if((f.color[y*f.w+x]>>>24)<=16)continue;visible++;
      assert.ok(x>=pad&&x<pad+w&&y>=pad&&y<pad+h,`pixel (${x-pad},${y-pad}) is outside at ${time}`);
    }
    assert.ok(visible>0);
  }
});


test('ice-lance release and burst retain all color pixels across seeds, mirrors and live frame rates', async () => {
  const e=await loadEffect('moves/ice-lance-throw'),[w,h]=e.meta.size,pad=24;
  const frame=createFrame(w+pad*2,h+pad*2,-pad,-pad);
  for(const fps of [30,60,120])for(const seed of [0,1,2,3,7,8,13,33,60,92,142,186,255])for(const flip of [false,true]){
    const fx=createFx(e.mod,{x:flip?w-e.meta.origin[0]:e.meta.origin[0],y:e.meta.origin[1],seed,flip});
    for(let i=0;i<=Math.ceil(e.meta.duration*fps);i++){
      if(i)fx.update(1/fps);fx.draw(clearFrame(frame));
      for(let j=0;j<frame.color.length;j++){
        if(!(frame.color[j]>>>24))continue;
        const x=j%frame.w-pad,y=Math.floor(j/frame.w)-pad;
        assert.ok(x>=0&&x<w&&y>=0&&y<h,`seed ${seed}, ${fps} fps, flip ${flip}, frame ${i}: pixel ${x},${y}`);
      }
    }
  }
});

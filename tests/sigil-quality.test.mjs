import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { projectSigilPath, sigilArc } from '../build/core/sigil.js';
import { createFrame, painterFor, resolveOptions, createFx, clearFrame } from '../build/core/fx.js';
import * as rune from '../build/fx/arcane/rune-circle.js';

function shot(t, options = {}, padding = 0, layer) {
  const [w,h] = rune.meta.size, f=createFrame(w+2*padding,h+2*padding,-padding,-padding), p=painterFor(f);
  p.place(...rune.meta.origin,options.flip??false,options.angle??0);const o=resolveOptions(rune.meta,options);
  if(layer!=='front')rune.drawBack(p,t,o);if(layer!=='back')rune.draw(p,t,o);return f;
}
function digest(options={}) {
  const h=createHash('sha256');for(let i=0;i<=120;i++){const f=shot(i/30,options);h.update(new Uint8Array(f.color.buffer));h.update(new Uint8Array(f.light.buffer));}return h.digest('hex');
}

test('projected sigil paths retain physical depth independently of screen height',()=>{
  const pts=[[-4,-6],[4,6]],a=projectSigilPath(pts,{x:20,y:30,perspective:.25,height:13});
  assert.equal(a.length,2);assert.equal(a[0].back,true);assert.equal(a[1].back,false);
  assert.deepEqual(a[0].points,[ [16,15.5],[20,17] ]);assert.deepEqual(a[1].points,[[20,17],[24,18.5]]);
  assert.equal(a[0].from,0);assert.equal(a[0].to,.5);assert.equal(a[1].from,.5);assert.equal(a[1].to,1);
  const raised=projectSigilPath([[-4,-6,2],[4,6,8]],{perspective:.25});
  assert.deepEqual(raised[0].points.at(-1),[0,-5]);assert.deepEqual(raised[1].points[0],[0,-5]);
  assert.equal(raised[1].back,false,'a raised foreground stroke must not be mistaken for background');
});

test('multiple sigil depth crossings are split without false connecting chords',()=>{
  const runs=projectSigilPath([[-10,-5],[-5,5],[5,-5],[10,5]],{height:10});
  assert.equal(runs.length,4);assert.deepEqual(runs.map(r=>r.back),[true,false,true,false]);
  for(let i=1;i<runs.length;i++){assert.deepEqual(runs[i-1].points.at(-1),runs[i].points[0]);assert.equal(runs[i-1].to,runs[i].from);}
  assert.equal(runs[0].from,0);assert.equal(runs.at(-1).to,1);
  const reversed=projectSigilPath([[2,0],[0,2]],{rotation:Math.PI/2,perspective:.5});
  assert.ok(Math.abs(reversed[0].points[0][0])<1e-10);assert.equal(reversed[0].points[0][1],1);
});

test('sigil arc chords meet tolerance, preserve exact closure, and support clockwise strokes',()=>{
  for(const radius of [1,7,51,120])for(const tolerance of [.05,.18,.8]){
    const pts=sigilArc(radius,0,Math.PI*2,tolerance);assert.deepEqual(pts[0],pts.at(-1));
    for(let i=1;i<pts.length;i++){const mid=[(pts[i-1][0]+pts[i][0])/2,(pts[i-1][1]+pts[i][1])/2];assert.ok(radius-Math.hypot(...mid)<=tolerance+1e-10);}
    assert.ok(pts.length<=1024);assert.ok(pts.length>=5);
  }
  const clockwise=sigilArc(12,0,-Math.PI);assert.ok(clockwise[1][1]<0);assert.ok(Math.abs(clockwise.at(-1)[0]+12)<1e-10);
  assert.deepEqual(sigilArc(0),[[0,0]]);assert.deepEqual(projectSigilPath([[1,1],[1,1]]),[]);
  assert.ok(sigilArc(1,0,Math.PI*2,10).length>=5,'a loose tolerance must not collapse a closed circle');
});

test('sigil geometry rejects invalid or unbounded work without silently weakening tolerance',()=>{
  for(const p of [{perspective:-1},{perspective:1.1},{height:Infinity},{rotation:NaN}]) assert.throws(()=>projectSigilPath([[0,0],[1,1]],p),RangeError);
  for(const p of [[[0,0],[NaN,1]],[[0,0,Infinity]],Array.from({length:1025},()=>[0,0])])assert.throws(()=>projectSigilPath(p),RangeError);
  assert.throws(()=>projectSigilPath([[1e308,1e308]],{x:1e308}),RangeError);
  for(const a of [[-1],[1,0,Infinity],[1,0,7],[1,0,1,0],[1e12,0,6,1e-9]])assert.throws(()=>sigilArc(...a),RangeError);
});

test('rune classic mode retains all 121 original color and light frames',()=>{
  assert.equal(digest({runeStyle:'classic'}),'a41305298a65ccaada04f25a648207e58d087a314b99f0f0e7618cc7ad2e492a');
  assert.notEqual(digest(),digest({runeStyle:'classic'}));
});

test('engraved runes are seekable, recolorable, seeded and exactly periodic in both layers',()=>{
  for(const options of [{},{seed:2},{seed:11,flip:true},{palette:['#224','#a67','#fce'],angle:.12}]){
    for(const t of [0,.25,1,3.5])for(const layer of ['back','front',undefined]){
      const a=shot(t,options,0,layer),b=shot(t+4,options,0,layer);assert.deepEqual(a.color,b.color);assert.deepEqual(a.light,b.light);
    }
    const a=shot(.8,options);shot(1.7,options);assert.deepEqual(a.color,shot(.8,options).color);
  }
  assert.notDeepEqual(shot(1).color,shot(1,{seed:7}).color);
  assert.notDeepEqual(shot(1).color,shot(1,{palette:['#321','#b87','#fed']}).color);
});

test('quarter-turn geometry also closes immediately around the seam, not only at wrapped t=duration',()=>{
  const d=(a,b)=>a.color.reduce((n,c,i)=>n+(c!==b.color[i]?1:0),0), frames=Array.from({length:120},(_,i)=>shot(i/30));
  const seam=d(frames.at(-1),frames[0]),deltas=frames.slice(1).map((f,i)=>d(f,frames[i])).sort((a,b)=>a-b);
  assert.ok(seam<deltas[Math.floor(deltas.length*.95)]*1.2,`${seam} seam changed pixels versus p95 ${deltas[Math.floor(deltas.length*.95)]}`);
});

test('engraved silhouette stays inside native bounds for every frame and seeds',()=>{
  for(const options of [{},{seed:2},{seed:7},{seed:11,flip:true}])for(let i=0;i<=120;i++){
    const f=shot(i/30,options,24);f.color.forEach((c,j)=>{if(!(c>>>24))return;const x=j%f.w-24,y=Math.floor(j/f.w)-24;
      assert.ok(x>=0&&y>=0&&x<rune.meta.size[0]&&y<rune.meta.size[1],`frame ${i}, ${x},${y}`);});
  }
});

test('rune runtime honors light zero, palette overrides and graceful stop',()=>{
  const f=createFrame(...rune.meta.size), fx=createFx(rune,{x:rune.meta.origin[0],y:rune.meta.origin[1],light:0});
  fx.update(.8);fx.draw(f);assert.ok(f.color.some(Boolean));assert.ok(f.light.every(c=>c===0));
  fx.stop();fx.update(.31);clearFrame(f);fx.draw(f);assert.ok(f.color.every(c=>c===0));assert.ok(f.light.every(c=>c===0));assert.equal(fx.done(),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFrame3D, compositeFrame3D, color3D, Painter3D, createFx3D, blackHole3D,
} from '../build/3d/index.js';

function snap(seed, t, yaw = 0.68) {
  const frame = createFrame3D(128, 96);
  const painter = new Painter3D(frame, { yaw, elevation: 0.5, zoom: 1.25, target: [0, 2.1, 0] });
  const fx = createFx3D(blackHole3D, { seed });
  fx.seek(t);
  painter.begin('#05030d');
  fx.draw(painter);
  return compositeFrame3D(frame, new Uint8ClampedArray(frame.w * frame.h * 4));
}

test('black hole exports real scene geometry and its metadata', () => {
  assert.equal(blackHole3D.meta.id, 'shadow/black-hole-3d');
  assert.ok(blackHole3D.meta.duration > 5);
  const pix = snap(42, 2.4);
  const bg = [5, 3, 13, 255];
  let nonBG = 0;
  for (let i = 0; i < pix.length; i += 4)
    if (pix[i] !== bg[0] || pix[i + 1] !== bg[1] || pix[i + 2] !== bg[2]) nonBG++;
  assert.ok(nonBG > 500, `expected visible 3D accretion geometry; got ${nonBG} changed pixels`);
});

test('black hole seed gives identical captures, different seed changes orbital debris', () => {
  assert.deepEqual(snap(17, 2.4), snap(17, 2.4));
  assert.notDeepEqual(snap(17, 2.4), snap(18, 2.4));
});

test('black hole changes silhouette when orbiting camera', () => {
  assert.notDeepEqual(snap(42, 3.1, 0.3), snap(42, 3.1, 1.5));
});

test('deterministic fixed-step simulation survives 30Hz and 120Hz stepping', () => {
  const a = createFx3D(blackHole3D, { seed: 39 });
  const b = createFx3D(blackHole3D, { seed: 39 });
  for (let i = 0; i < 75; i++) a.update(1 / 30);
  for (let i = 0; i < 300; i++) b.update(1 / 120);
  const draw = fx => {
    const frame = createFrame3D(96, 72);
    const painter = new Painter3D(frame, {yaw:0.5,elevation:0.5,zoom:1.2,target:[0,2.1,0]});
    painter.begin('#05030d'); fx.draw(painter);
    return frame.color;
  };
  assert.deepEqual(draw(a), draw(b));
});

test('opaque horizon occludes luminous material behind it', () => {
  const frame = createFrame3D(100, 100);
  const p = new Painter3D(frame, {yaw:0.65,elevation:0.45,zoom:1,target:[0,2.1,0]});
  p.begin('#05030d');
  p.glow([0,2.1,0], 2, '#ffffff', 1);
  p.point([0,2.1,0], 0.75, '#ff00ff', 1, 1);
  const mid = p.project([0,2.1,0]);
  const i = Math.floor(mid.y) * frame.w + Math.floor(mid.x);
  assert.ok(frame.light[i] !== 0);
  p.sphere([0,2.1,0], 1.1, '#080513', '#291146');
  assert.equal(frame.light[i], 0);
  assert.equal(frame.color[i], color3D('#080513'));
});

test('lens warp is local and preserves packed pixel colors', () => {
  const frame = createFrame3D(128, 96);
  const p = new Painter3D(frame, {yaw:0,elevation:0.3,zoom:1,target:[0,2.1,0]});
  p.begin('#05030d');
  for (let j=0;j<18;j++) p.point([2*Math.cos(j),2.1,2*Math.sin(j)],0.18,j%2?'#ff00dd':'#77eeff',1,0.3);
  const before = frame.color.slice();
  p.lensWarp([0,2.1,0],1.15,3.2,1.5);
  const center = p.project([0,2.1,0]);
  const outside = 0;
  assert.equal(frame.color[outside], before[outside]);
  assert.ok(frame.color.some((v,i)=>v!==before[i]),'lensing should reproject nearby colored material');
});

test('black hole emits presentation cues without duplication', () => {
  const fx=createFx3D(blackHole3D);
  fx.update(1.1);
  assert.deepEqual(fx.drainCues().map(c=>c.type),['flash','shake','sound']);
  assert.deepEqual(fx.drainCues(),[]);
  fx.seek(6.1);
  assert.deepEqual(fx.drainCues(),[]);
  assert.equal(fx.stage(),'COLLAPSE');
});

test('one-shot ends visually empty, and restart returns to initial stage', () => {
  const fx=createFx3D(blackHole3D);
  fx.seek(7);
  assert.ok(fx.done());
  const frame=createFrame3D(100,72), p=new Painter3D(frame);
  p.begin('#05030d'); fx.draw(p);
  assert.ok(frame.color.every(c=>c===color3D('#05030d')));
  assert.ok(frame.light.every(c=>c===0));
  fx.restart();
  assert.equal(fx.stage(),'CONDENSE');
  assert.ok(!fx.done());
});

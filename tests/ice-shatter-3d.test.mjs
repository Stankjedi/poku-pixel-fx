import test from "node:test";
import assert from "node:assert/strict";
import { createFrame3D, Painter3D, createFx3D, Fragments3D, transformFragment3D, restingRotation3D, iceShatter3D } from "../build/3d/index.js";

const mesh = {
  vertices: [[-0.3,-0.3,-0.2],[0.3,-0.3,-0.2],[0,0.8,-0.1],[0,-0.2,0.3]],
  faces: [[0,2,1],[0,1,3],[1,2,3],[2,0,3]],
};
const camera = { yaw: 0.68, elevation: 0.49, zoom: 1.2, target: [0,1.1,0] };
function render(fx, yaw = camera.yaw, size = [160,112]) {
  const frame = createFrame3D(...size), p = new Painter3D(frame, { ...camera, yaw });
  p.begin("#0a1525"); fx.draw(p);
  return { color: frame.color.slice(), light: frame.light.slice(), depth: frame.depth.slice() };
}
function at(t, seed = 8713) { const fx = createFx3D(iceShatter3D, {seed}); fx.seek(t); return fx; }

test("ice fracture is deterministic across seek, frame partition and repeated draws", () => {
  const a = createFx3D(iceShatter3D), b = createFx3D(iceShatter3D);
  for(let i=0;i<66;i++) a.update(1/30);
  for(let i=0;i<264;i++) b.update(1/120);
  assert.deepEqual(render(a),render(b));
  assert.deepEqual(render(a),render(at(2.2)));
  assert.deepEqual(render(a),render(a));
  assert.notDeepEqual(render(at(1.5,1)).color,render(at(1.5,2)).color);
});

test("fracture preserves volume and the same pre-fracture pieces, with visible camera parallax", () => {
  const solid = render(at(0.75)), impact = render(at(0.9667)), flight = render(at(1.3));
  const occupied = r => [...r.depth].filter(Number.isFinite).length;
  assert.ok(occupied(solid) > 250);
  assert.ok(occupied(impact) > occupied(solid) * 0.7);
  assert.notDeepEqual(solid.color, flight.color);
  assert.notDeepEqual(render(at(1.4),0.2).color,render(at(1.4),1.5).color);
});

test("ice cues fire once at the real fracture and seek stays silent", () => {
  const fx = createFx3D(iceShatter3D); fx.update(0.95);
  assert.deepEqual(fx.drainCues(),[]); fx.update(0.02);
  assert.deepEqual(fx.drainCues().map(c=>c.type),["hit","flash","shake","sound"]);
  fx.update(1); assert.deepEqual(fx.drainCues(),[]);
  fx.seek(2); assert.deepEqual(fx.drainCues(),[]);
});

test("one-shot begins and ends empty, including emission and depth", () => {
  for(const t of [0,4.6]) {
    const result=render(at(t)), empty=render({draw(){}});
    assert.deepEqual(result,empty);
  }
  assert.equal(at(4.6).done(),true);
});

test("fragments tumble, contact their lowest real vertex, then settle without floor penetration", () => {
  const fragments = new Fragments3D(0.02);
  const body = fragments.spawn({mesh,position:[0,1.4,0],velocity:[2,3,1],rotation:[0.1,0.4,0.2],angularVelocity:[2,3,4],palette:["#123","#def"],life:6,meltStart:0.7});
  const rotations=[];
  for(let i=0;i<540;i++) {
    fragments.update(1/120);
    const vertices=mesh.vertices.map(v=>transformFragment3D(v,body.position,body.rotation,fragments.scale(body)));
    assert.ok(Math.min(...vertices.map(v=>v[1]))>=0.02-1e-9);
    if(i%60===0) rotations.push([...body.rotation]);
  }
  assert.notDeepEqual(rotations[0],rotations[1]);
  assert.equal(body.resting,true);
  const settled=[...body.rotation]; fragments.update(1/120);
  assert.deepEqual(body.rotation,settled);
  const bottom=mesh.vertices.map(v=>transformFragment3D(v,body.position,body.rotation,fragments.scale(body))[1]);
  assert.ok(bottom.filter(y=>Math.abs(y-0.02)<1e-8).length>=3, "resting contact uses a full face, not a balanced tip");
});

test("automatic support orientation places a complete face below every other vertex", () => {
  for(const current of [[0,0,0],[2,1,3],[-1,4,-2]]) {
    const rotation=restingRotation3D(mesh,current);
    const ys=mesh.vertices.map(v=>transformFragment3D(v,[0,0,0],rotation)[1]);
    const min=Math.min(...ys);
    assert.ok(ys.filter(y=>Math.abs(y-min)<1e-8).length>=3);
  }
});

test("fragments expire, respect capacity, validate dt and keep rendering pure", () => {
  const system=new Fragments3D(0,1),spec={mesh,position:[0,2,0],velocity:[0,0,0],palette:["#123","#abc"],life:1};
  assert.ok(system.spawn(spec)); assert.equal(system.spawn(spec),undefined);
  assert.throws(()=>system.update(-1),RangeError);
  assert.throws(()=>system.update(NaN),RangeError);
  const before=structuredClone(system.list),f=createFrame3D(64,64),p=new Painter3D(f);
  system.draw(p); system.draw(p); assert.deepEqual(system.list,before);
  system.update(1); assert.equal(system.list.length,0);
});

test("custom palette length is safe and the effect remains isolated from 2D", () => {
  for(const palette of [[],["#0af"],["#123","#fff"]]) {
    const fx=createFx3D(iceShatter3D,{palette});fx.seek(1.5);
    assert.ok(render(fx).depth.some(Number.isFinite));
  }
});


test("complete default animations fit the preview at several seeds", () => {
  for (const seed of [0, 42, 8713]) {
    const fx = createFx3D(iceShatter3D, {seed});
    for (let n = 0; n < 92; n++) {
      const frame = render(fx, camera.yaw, [120, 84]);
      for (let x = 0; x < 120; x++) {
        assert.equal(frame.depth[x], -Infinity);
        assert.equal(frame.depth[83 * 120 + x], -Infinity);
      }
      for (let y = 0; y < 84; y++) {
        assert.equal(frame.depth[y * 120], -Infinity);
        assert.equal(frame.depth[y * 120 + 119], -Infinity);
      }
      fx.update(1 / 20);
    }
  }
});

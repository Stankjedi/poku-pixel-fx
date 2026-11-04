import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFrame3D, Painter3D, createFx3D, color3D, createDischarge3D, drawDischarge3D, dischargePulse3D, forkedLightning3D, enableHDRLight } from "../build/3d/index.js";
const camera = { yaw: 0.68, elevation: 28 * Math.PI / 180, zoom: 1.35, target: [0, 2.6, 0] };
const spec = {start: [-1.8, 6.2, -0.6], end: [0.8, 0.05, 0.3], seed: 7361, branches: 7, roughness: 0.23};
function render(fx, yaw = camera.yaw, size = [200,160]) {
  const frame = createFrame3D(...size), p = new Painter3D(frame, {...camera, yaw});
  enableHDRLight(frame); p.begin("#0a1525"); fx.draw(p);
  return frame;
}
function at(t, opts = {}) { const fx=createFx3D(forkedLightning3D, opts); fx.seek(t); return fx; }
const occupied = f => [...f.depth].filter(Number.isFinite).length;
const light = f => f.hdrLight.reduce((sum,v)=>sum+v,0);

test("channel topology is seeded, anchored, irregular, truly 3D and independent of draw time", () => {
  const tree=createDischarge3D(spec);
  assert.deepEqual(tree,createDischarge3D(spec));
  assert.notDeepEqual(tree,createDischarge3D({...spec,seed:7362}));
  assert.deepEqual(tree[0].points[0],spec.start);
  assert.deepEqual(tree[0].points.at(-1),spec.end);
  assert.equal(tree[0].points.length,33);
  assert.equal(tree.length,13);
  assert.ok(tree.some(c=>c.generation===2));
  for (let i=0;i<tree.length;i++) {
    const c=tree[i]; assert.equal(c.distances[0],0); assert.equal(c.distances.at(-1),1);
    assert.ok(c.distances.every((v,j)=>j===0||v>c.distances[j-1]));
    assert.ok(c.points.flat().every(Number.isFinite));
    if(i) {
      assert.ok(c.parent<i);
      assert.deepEqual(c.points[0],tree[c.parent].points[c.attachment]);
      assert.ok(c.strength<tree[c.parent].strength);
      assert.ok(c.rootDistance>tree[c.parent].rootDistance);
    }
  }
  const zs=tree.flatMap(c=>c.points.map(p=>p[2]));
  assert.ok(Math.max(...zs)-Math.min(...zs)>1.5);
  const lengths=new Set(tree.slice(1).map(c=>c.length.toFixed(2)));
  assert.ok(lengths.size>8,"forks must not become identical radial spokes");
});

test("channels handle degenerate and bounded input without runaway subdivision", () => {
  assert.deepEqual(createDischarge3D({start:[1,2,3],end:[1,2,3]}),[]);
  assert.throws(()=>createDischarge3D({start:[NaN,0,0],end:[1,1,1]}),RangeError);
  for(const detail of [-100,2,3,NaN,Infinity,100]) {
    const tree=createDischarge3D({...spec,detail,branches:100});
    assert.ok(tree.length<=21); assert.ok(tree[0].points.length<=129);
    assert.ok(tree.every(c=>c.points.flat().every(Number.isFinite)));
  }
  assert.equal(createDischarge3D({...spec,branches:0}).length,1);
});

test("leader growth is monotone, branches start at their attached junction and do not mutate", () => {
  const tree=createDischarge3D(spec), before=structuredClone(tree), calls=[];
  const p={line(...args){calls.push(args);}};
  const child=tree[1];
  drawDischarge3D(p,tree,{progress:child.rootDistance-0.001,stroke:1});
  assert.ok(calls.every(([a])=>!child.points.slice(1).some(b=>a===b)));
  calls.length=0;
  drawDischarge3D(p,tree,{progress:child.rootDistance+0.03,stroke:1});
  assert.ok(calls.some(([a])=>a===child.points[0]));
  assert.deepEqual(tree,before);
  const frame=createFrame3D(200,160), painter=new Painter3D(frame,camera), counts=[];
  for(const progress of [0,0.1,0.25,0.5,1,1.6]) {
    painter.begin(); drawDischarge3D(painter,tree,{progress}); counts.push(occupied(frame));
  }
  assert.equal(counts[0],0);
  assert.ok(counts.every((n,i)=>i===0||n>=counts[i-1]));
});

test("return strokes have sharp sampled peaks and real dark intervals, not a steady sine", () => {
  const strokes=[0.64,0.94,1.39];
  assert.equal(dischargePulse3D(0.639,strokes),0);
  assert.equal(dischargePulse3D(0.65,strokes),1);
  assert.ok(dischargePulse3D(0.6667,strokes)>0.97);
  assert.ok(dischargePulse3D(1.32,strokes)<0.02);
  assert.ok(dischargePulse3D(1.4,strokes)>0.7);
  for(const args of [[NaN,strokes],[1,strokes,0],[1,strokes,NaN]]) assert.equal(dischargePulse3D(...args),0);
});

test("discharge rendering is palette-crisp, depth-tested, pure and safe with custom palettes", () => {
  const tree=createDischarge3D(spec), palette=["#123","#45a","#acf","#fff"];
  const frame=createFrame3D(120,100), p=new Painter3D(frame,camera); p.begin("#000");
  drawDischarge3D(p,tree,{palette,emission:0});
  assert.ok(occupied(frame)>0);
  assert.ok([...frame.color].every(c=>new Set([color3D("#000"),...palette.map(color3D)]).has(c)));
  p.begin("#000"); frame.depth.fill(100); drawDischarge3D(p,tree);
  assert.ok([...frame.color].every(c=>c===color3D("#000")));
  assert.ok(frame.light.every(c=>c===0));
  for(const palette of [[],["#0cf"]]) {
    p.begin(); drawDischarge3D(p,tree,{palette}); assert.ok(occupied(frame)>0);
  }
  for(const options of [{stroke:0,residual:0},{progress:0},{radius:0}]) {
    p.begin(); drawDischarge3D(p,tree,options); assert.equal(occupied(frame),0);
  }
});

test("effect is deterministic across update partitions, seek, repeat draw and restart", () => {
  const a=createFx3D(forkedLightning3D),b=createFx3D(forkedLightning3D);
  for(let i=0;i<43;i++) a.update(1/30);
  for(let i=0;i<172;i++) b.update(1/120);
  assert.deepEqual(render(a),render(b));
  assert.deepEqual(render(a),render(at(43/30)));
  assert.deepEqual(render(a),render(a));
  a.restart();a.seek(43/30);assert.deepEqual(render(a),render(b));
  assert.notDeepEqual(render(at(0.66,{seed:0})).color,render(at(0.66,{seed:1})).color);
});

test("strokes change current not geometry, show parallax, and extinguish rather than persist", () => {
  const strong=render(at(0.65)),late=render(at(1.32)),final=render(at(1.4));
  assert.ok(occupied(strong)>200);
  assert.ok(light(strong)>light(late)*8);
  assert.ok(occupied(final)>occupied(late)*3);
  assert.notDeepEqual(render(at(0.65),0.1).color,render(at(0.65),1.3).color);
  assert.deepEqual(render(at(0)),render({draw(){}}));
  assert.deepEqual(render(at(2.6)),render({draw(){}}));
  assert.equal(at(2.6).done(),true);
});

test("cue timing matches exactly three return strokes and scrubbing stays silent", () => {
  const fx=createFx3D(forkedLightning3D); fx.update(0.63);assert.deepEqual(fx.drainCues(),[]);
  fx.update(0.02);assert.deepEqual(fx.drainCues().map(c=>c.type),["flash","hit","sound"]);
  fx.update(1);assert.equal(fx.drainCues().length,6);fx.update(1);assert.deepEqual(fx.drainCues(),[]);
  fx.seek(1.4);assert.deepEqual(fx.drainCues(),[]);
});

test("default animated silhouettes remain within preview margins across seeds and times", () => {
  for(const seed of [0,42,7361,98765]) for(let i=0;i<78;i++) {
    const f=render(at(i/30,{seed}));
    for(let y=0;y<f.h;y++) for(let x=0;x<f.w;x++) if(Number.isFinite(f.depth[y*f.w+x])) {
      assert.ok(x>1&&x<f.w-2&&y>1&&y<f.h-2,`seed=${seed} time=${i/30} pixel=${x},${y}`);
    }
  }
});

test("short palettes and bounded options are safe, and 3D does not import the 2D core", () => {
  for(const palette of [[],["#acf"],["#246","#fff"]]) assert.ok(occupied(render(at(0.65,{palette})))>0);
  assert.equal(occupied(render(at(0.65,{intensity:0}))),0);
  for(const filename of ["src/3d/discharge.ts","src/3d/effects/forked-lightning.ts"]) {
    const source=readFileSync(new URL("../"+filename,import.meta.url),"utf8");
    assert.ok(!source.includes("/core/")); assert.ok(!source.includes("Math.random"));
  }
});

test("reviewed leader, stroke, dark interval and orbited captures retain exact buffers", async () => {
  const {createHash}=await import("node:crypto");
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/discharge-3d-render.json",import.meta.url),"utf8"));
  const hash=a=>createHash("sha256").update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest("hex");
  for(const sample of fixture.samples) {
    const frame=render(at(sample.time,{seed:sample.seed}),sample.yaw);
    for(const key of ["color","light","depth","hdrLight"]) assert.equal(hash(frame[key]),sample[key],`${key} at ${sample.time}, seed ${sample.seed}, yaw ${sample.yaw}`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createFrame, clearFrame, createFx, composite } from '../build/core/index.js';
import { atlasMetadata, edgeFade, exportLayout2D, frameDurationMs, resolveEffectExport } from '../build/render/export.js';
import { loadEffect, renderSequence, renderFrames, spriteSheet, createContactSheet, contactSheet } from '../build-tools/tools/lib/fxlib.mjs';
import { createLayerSheet } from '../build-tools/tools/lib/layers.mjs';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { writeVideos } from '../build-tools/tools/lib/video.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
async function temporary(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'poku-export-contract-'));
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const cli = (tool, args, env) => spawnSync(process.execPath, [`build-tools/tools/${tool}.mjs`, ...args],
  { cwd: root, encoding: 'utf8', timeout: 30_000, env: env ?? process.env });
const equalBytes = (a, b) => assert.deepEqual(Buffer.from(a), Buffer.from(b));

test('atlas copy preserves all four PNG channels, including unassociated RGB at zero alpha', () => {
  const rgba = new Uint8ClampedArray([91,27,44,0, 255,64,32,128]);
  const fx = { id: 'test/alpha', file: '', meta: { size: [2,1], origin: [0,0], fps: 30, loop: false }, mod: {} };
  const result = spriteSheet(fx, { w: 2, h: 1, n: 1, fps: 30, frames: [{ t: 0, color: rgba, clear: rgba }] }, 'alpha');
  equalBytes(decodePNG(result.png).rgba, rgba);
});

test('asymmetric export reflects every arrow pixel and its pivot; cardinal rotation fits pixel edges', async () => {
  const effect = await loadEffect('projectiles/arrow');
  const a = renderFrames(effect, { diagnostics: true }), b = renderFrames(effect, { diagnostics: true, options: { flip: true } });
  assert.deepEqual(a.pivot, [92,16]); assert.deepEqual(b.pivot, [20,16]);
  for (let i = 0; i < a.n; i++) for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    assert.equal(a.frames[i].raw[y * a.w + x], b.frames[i].raw[y * b.w + b.w - 1 - x]);
    const p = (y * a.w + x) * 4, q = (y * b.w + b.w - 1 - x) * 4;
    equalBytes(a.frames[i].clear.subarray(p,p+4), b.frames[i].clear.subarray(q,q+4));
  }
  const r = exportLayout2D([112,32], [92,16], { angle: Math.PI / 2 });
  assert.deepEqual([r.w,r.h,r.pivot], [32,112,[16,92]]);
  const explicit = exportLayout2D([112,32], [92,16], { flip: true, x: 50, y: 20, margin: 3 });
  assert.deepEqual(explicit.pivot, [53,23]);
});

test('frame duration rounding is cumulative for integer and fractional rates', () => {
  for (const fps of [24,30,60,59.94]) {
    const n = Math.round(fps * 3), sum = Array.from({ length:n }, (_,i) => frameDurationMs(i,fps)).reduce((a,b)=>a+b,0);
    assert.equal(sum, Math.round(n * 1000 / fps));
    const json = atlasMetadata({ id: 'test/time', animationName:'time', image:'time.png', w:1,h:1,n,fps,loop:false,columns:10,pivot:[0,0] });
    assert.equal(json.frames.reduce((s,f)=>s+f.duration,0), sum);
    assert.equal(json.meta.pokuFx.durationMs, sum);
  }
});

test('browser-safe export plan and CLI stream give identical RGBA and metadata settings', async () => {
  const effect = await loadEffect('projectiles/arrow'), input = { seed:17, options:{flip:true,palette:['#221144','#6666bb','#ccbbee','#ffffff']} };
  const r = renderSequence(effect,input), plan = resolveEffectExport(effect.meta,input), {layout} = plan;
  const f = createFrame(layout.w,layout.h,layout.ox,layout.oy), fx = createFx(effect.mod,plan.options);
  let i = 0;
  for (const actual of r.frames) {
    if (i++) fx.update(1 / plan.fps);
    fx.draw(clearFrame(f)); edgeFade(f,plan.settings.edgeFade);
    equalBytes(actual.clear,composite(f,new Uint8ClampedArray(layout.w*layout.h*4),null));
    assert.equal(actual.raw,undefined); assert.equal(actual.light,undefined);
  }
  const sheet = spriteSheet(effect,r,'arrow');
  assert.deepEqual(sheet.json.meta.pokuFx.settings,plan.settings);
  assert.deepEqual(sheet.json.meta.pokuFx.pivot,layout.pivot);
});

test('stream consumers match collected output and only retain sampled contact cells', async () => {
  const effect = await loadEffect('projectiles/arrow'), stream = renderSequence(effect), collected = renderFrames(effect);
  const contact = createContactSheet(effect,stream,{max:4,zoom:1});
  let count = 0; for (const f of stream.frames) contact.push(f,count++);
  assert.equal(count,stream.n);
  equalBytes(contact.png(), contactSheet(effect,collected,{max:4,zoom:1}));
  equalBytes(spriteSheet(effect,stream,'arrow').png,spriteSheet(effect,collected,'arrow').png);
  assert.ok(renderFrames(effect,{diagnostics:true}).frames.every(f=>f.raw && f.light));
});

test('separate game layers preserve straight color coverage and HDR values above one in little-endian form', () => temporary(dir => {
  const meta = { size:[4,4],origin:[1,1],duration:0,fps:30,loop:false,bg:'none',options:{seed:1} };
  const fx = { id:'test/layers',file:'',meta,mod:{meta,draw(p){p.dot(0,0,0xff2010ff,.5);p.light(1,0,0xffffffff,4);}} };
  const r = renderSequence(fx,{layers:true,edgeFade:false}), sink = createLayerSheet(join(dir,'layers'),fx,r);
  try { for(const f of r.frames) sink.push(f); sink.finish(); } finally { sink.abort(); }
  const json = JSON.parse(readFileSync(join(dir,'layers.layers.json'),'utf8')), raw = readFileSync(join(dir,'layers.emission.f32'));
  const decoded = decodePNG(readFileSync(join(dir,'layers.color.png')));
  assert.deepEqual([...decoded.rgba.subarray((1*4+1)*4,(1*4+1)*4+4)],[255,16,32,128]);
  for (let c=0;c<3;c++) assert.equal(raw.readFloatLE(((1*4+2)*3+c)*4),4);
  assert.equal(json.meta.pokuFx.layers.emission.format,'float32-le');
  assert.equal(raw.length,json.meta.size.w*json.meta.size.h*12);
  assert.equal(readdirSync(dir).some(n=>n.startsWith('.poku-layers-')),false);
}));

test('CLI reports unmatched IDs and requested missing encoders as failures', () => temporary(dir => {
  const missing = cli('render',['missing/no-effect','--sheet','--out',dir]);
  assert.notEqual(missing.status,0); assert.match(missing.stderr,/일치하는 이펙트가 없습니다/);
  for (const [tool,args] of [
    ['render',['projectiles/arrow','--gif','--out',dir]],
    ['act',['melee/sword-slash','--mp4','--seconds','.1','--out',join(dir,'act.mp4')]],
  ]) {
    const result=cli(tool,args,{...process.env,PATH:dir,TMPDIR:dir});
    assert.notEqual(result.status,0); assert.match(result.stderr,/ffmpeg/);
    assert.doesNotMatch(result.stdout,/->/);
  }
}));

test('ACT sheet metadata names the actual PNG next to its JSON', () => temporary(dir => {
  const base=join(dir,'scene');
  const result=cli('act',['melee/sword-slash','--sheet','--seconds','.1','--hold','0','--fps','12','--no-actor','--no-target','--out',base+'.png']);
  assert.equal(result.status,0,result.stderr);
  const json=JSON.parse(readFileSync(base+'.sheet.json','utf8'));
  assert.equal(json.meta.image,basename(base)+'.sheet.png');
  assert.ok(existsSync(join(dir,json.meta.image)));
  assert.equal(json.frames.reduce((sum,frame)=>sum+frame.duration,0),Math.round(json.frames.length*1000/12));
  assert.equal(json.meta.pokuFx.settings.background,'transparent');
}));

test('3D game atlas exports transparent color, exact HDR size and continuous camera/timeline metadata', () => temporary(dir => {
  const file=join(dir,'frost.png');
  const result=cli('render-3d',['frost','--atlas','--layers','--frames','3','--fps','30','--width','32','--height','24','--out',file]);
  assert.equal(result.status,0,result.stderr);
  const json=JSON.parse(readFileSync(join(dir,'frost.json'),'utf8'));
  const layers=JSON.parse(readFileSync(join(dir,'frost.layers.json'),'utf8'));
  assert.equal(json.meta.pokuFx.settings.output,'game-atlas-3d');
  assert.equal(json.meta.pokuFx.settings.cameraMotion,false); assert.equal(json.meta.pokuFx.settings.grid,false);
  assert.equal(json.meta.pokuFx.settings.background,'transparent');
  assert.deepEqual(json.meta.pokuFx.timeSamples,[0,1/30,2/30]);
  assert.ok(Array.isArray(json.meta.pokuFx.settings.timeline.cues));
  const color=decodePNG(readFileSync(join(dir,layers.meta.image)));
  assert.ok(color.rgba.some((v,i)=>i%4===3&&v===0));
  assert.equal(readFileSync(join(dir,layers.meta.pokuFx.layers.emission.image)).length,color.width*color.height*12);
  assert.deepEqual(json.meta.pokuFx.pivot,layers.meta.pokuFx.pivot);
}));

test('multiple video formats consume a reusable frame generator once and preserve each staged snapshot', () => temporary(dir => {
  const log=join(dir,'calls.jsonl');
  writeFileSync(join(dir,'ffmpeg'),`#!${process.execPath}\n`+`
const fs=require('node:fs'),args=process.argv.slice(2);
if(args.includes('-version')) process.exit(0);
const raw=args.find(a=>a.endsWith('frames.rgba'));
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify([...fs.readFileSync(raw)])+'\\n');
fs.writeFileSync(args.at(-1),'encoded');
`,{mode:0o755});
  let iterations=0,produced=0;
  const r={w:1,h:1,fps:30,n:4,frames:{*[Symbol.iterator](){iterations++;const color=new Uint8ClampedArray(4);for(let i=0;i<4;i++){color.set([i,10,20,255]);produced++;yield {color};}}}};
  const oldPath=process.env.PATH,oldTmp=process.env.TMPDIR;
  try {
    process.env.PATH=dir;process.env.TMPDIR=dir;
    assert.equal(writeVideos([{file:join(dir,'a.gif'),scale:2},{file:join(dir,'a.mp4'),scale:3}],r),true);
  } finally {
    if(oldPath===undefined)delete process.env.PATH;else process.env.PATH=oldPath;
    if(oldTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=oldTmp;
  }
  assert.equal(iterations,1);assert.equal(produced,4);
  const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls.length,3);
  for(const bytes of calls)assert.deepEqual(bytes,[0,10,20,255,1,10,20,255,2,10,20,255,3,10,20,255]);
  assert.equal(readdirSync(dir).some(n=>n.startsWith('poku-video-')),false);
}));

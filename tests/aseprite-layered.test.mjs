import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createAsepriteImportScript, importLayeredAsepriteFiles } from '../build-tools/tools/lib/aseprite-bridge.mjs';
import { importAsepriteSheet, asepriteSocketFrames } from '../build-tools/tools/lib/aseprite-data.mjs';
import { emissionProxy, restoreEmissionProxy } from '../build-tools/tools/lib/hdr-edit.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';
import { createSpriteClip2D, createFrame, painterFor, enableHDRLight } from '../build/core/index.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const temporary=async fn=>{const dir=mkdtempSync(join(tmpdir(),'poku-layered-'));try{return await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}};

test('Aseprite slice keys preserve source-canvas sockets and per-frame direction/visibility',()=>{
  const meta={slices:[
    {name:'socket:grip',data:JSON.stringify({pokuSocket:{frames:{0:{angle:.25,visible:true},1:{angle:.75,visible:false}}}}),keys:[
      {frame:0,bounds:{x:-2,y:3,w:4,h:2},pivot:{x:1.5,y:.5}},
      {frame:1,bounds:{x:3,y:4,w:2,h:2},pivot:{x:1,y:1}}]},
    {name:'socket:muzzle',keys:[{frame:0,bounds:{x:1,y:1,w:1,h:1},pivot:{x:0,y:0}}]},
    {name:'socket:muzzle.direction',keys:[{frame:0,bounds:{x:1,y:5,w:1,h:1},pivot:{x:0,y:0}}]},
  ]};
  const frames=asepriteSocketFrames(meta,3);
  assert.deepEqual(frames[0].grip,{x:-.5,y:3.5,angle:.25,visible:true});
  assert.deepEqual(frames[1].grip,{x:4,y:5,angle:.75,visible:false});
  assert.equal(frames[2].grip.x,4);assert.equal(frames[0].muzzle.angle,Math.PI/2);
  assert.throws(()=>asepriteSocketFrames({slices:[meta.slices[0],meta.slices[0]]},3),/unique/);
});

test('HDR proxy preserves untouched float32 exactly; edited alpha weights emission once',()=>{
  const original=new Float32Array([9.12345,.0123456,.25,0,0,0]),proxy=emissionProxy(original);
  assert.deepEqual(restoreEmissionProxy(proxy.rgba,proxy.rgba,original,proxy.scale),original);
  const edited=proxy.rgba.slice();edited.set([255,0,0,128],4);
  const result=restoreEmissionProxy(edited,proxy.rgba,original,proxy.scale);
  assert.deepEqual(result.slice(0,3),original.slice(0,3));
  assert.ok(Math.abs(result[3]-proxy.scale*128/255)<1e-6);
  assert.equal(result[4],0);assert.equal(result[5],0);
  assert.throws(()=>emissionProxy(new Float32Array([Infinity,0,0])),/finite/);
});

test('real channel files round-trip into a clip with exact HDR, independent color coverage, sockets and timing',()=>temporary(dir=>{
  const width=2,height=1,raw=new Float32Array([4.125,.03125,2,0,.75,0, .1234567,6,1,2,0,0]);
  const proxy=emissionProxy(raw),proxyPNG=encodePNG(2,2,proxy.rgba),color=new Uint8Array([11,22,33,0,1,2,3,128,91,83,77,255,5,6,7,0]);
  const colorPNG=encodePNG(2,2,color),rawBytes=Buffer.alloc(raw.length*4);raw.forEach((v,i)=>rawBytes.writeFloatLE(v,i*4));
  const sockets=[{grip:{x:.25,y:.5,angle:0,visible:true,basisX:[1,0],basisY:[0,-1],mirrorPolicy:'reflect'}},
    {grip:{x:1.25,y:.5,angle:Math.PI/2,visible:false,basisX:[0,1],basisY:[1,0],mirrorPolicy:'swap-hand'}}];
  const project={format:'poku-aseprite-project',version:1,effectId:'test/layered',width,height,pivot:[.5,1],fps:10,durationsMs:[75,125],loop:true,
    tags:[{name:'all',from:0,to:1,direction:'forward'}],flattened:false,bakedEmission:false,sockets,
    layers:{columns:1,atlasWidth:2,atlasHeight:2,emissionScale:proxy.scale,emissionSha256:hash(rawBytes),proxySha256:hash(proxyPNG)}};
  const source={frames:[0,1].map((i)=>({filename:`frame ${i}`,frame:{x:0,y:i,w:2,h:1},duration:project.durationsMs[i]})),
    meta:{size:{w:2,h:2},pokuFx:{pivot:project.pivot,socketSamples:sockets},frameTags:project.tags}};
  for(const [name,data]of Object.entries({'bridge.json':JSON.stringify(project),'source.json':JSON.stringify(source),'source.emission.f32':rawBytes,
    'source.emission-proxy.png':proxyPNG,'source.color.png':colorPNG}))writeFileSync(join(dir,name),data);
  const lua=createAsepriteImportScript(project);
  assert.match(lua,/lightLayer\.name="emission"/);assert.match(lua,/socketSlices/);assert.match(lua,/slice\.data=socketData\[key\]/);assert.match(lua,/basisX/);assert.match(lua,/mirrorPolicy/);
  const result=importLayeredAsepriteFiles(dir,join(dir,'source.color.png'),join(dir,'source.json'),join(dir,'source.emission-proxy.png'),join(dir,'source.json'),join(dir,'imported'),{name:'channel-fixture'});
  const clip=createSpriteClip2D(result.data,{loop:true});
  assert.deepEqual(result.data.frames.map(f=>f.durationMs),[75,125]);assert.deepEqual(clip.pivot,[.5,1]);
  for(let i=0;i<2;i++){
    assert.deepEqual(clip.frameEmission(i),raw.slice(i*6,i*6+6));
    assert.deepEqual(new Uint8Array(clip.framePixels(i).buffer),color.slice(i*8,i*8+8));
    assert.deepEqual(clip.frameSockets(i),sockets[i]);
  }
  const frame=enableHDRLight(createFrame(2,1));clip.draw(painterFor(frame).place(.5,1),.01);
  assert.deepEqual(frame.hdrLight,raw.slice(0,6),'zero color alpha does not erase optical energy');
  assert.equal(JSON.parse(readFileSync(join(dir,'imported/import-report.json'),'utf8')).separateEmission,true);
  // A real edit of one proxy cell does not quantize any untouched cell.
  const edited=proxy.rgba.slice();edited.set([255,0,0,128],0);writeFileSync(join(dir,'edited-emission.png'),encodePNG(2,2,edited));
  const changed=importLayeredAsepriteFiles(dir,join(dir,'source.color.png'),join(dir,'source.json'),join(dir,'edited-emission.png'),join(dir,'source.json'),join(dir,'revision'),{name:'edited-fixture'});
  assert.deepEqual(changed.data.frames[1].emission,Array.from(raw.slice(6)));
  assert.ok(Math.abs(changed.data.frames[0].emission[0]-proxy.scale*128/255)<1e-6);
  rawBytes[0]^=1;writeFileSync(join(dir,'source.emission.f32'),rawBytes);
  assert.throws(()=>importLayeredAsepriteFiles(dir,join(dir,'source.color.png'),join(dir,'source.json'),join(dir,'edited-emission.png'),join(dir,'source.json'),join(dir,'rejected')),/sidecars changed/);
}));

test('engine socket sample metadata survives direct PNG/JSON import even without slice metadata',()=>{
  const socket={x:.25,y:-.5,angle:.5,visible:false},png=encodePNG(1,1,new Uint8Array([1,2,3,255]));
  const data=importAsepriteSheet(png,{frames:[{frame:{x:0,y:0,w:1,h:1},duration:50}],meta:{pokuFx:{pivot:[0,0],socketSamples:[{tip:socket}]}}}).data;
  assert.deepEqual(data.frames[0].sockets.tip,socket);
});

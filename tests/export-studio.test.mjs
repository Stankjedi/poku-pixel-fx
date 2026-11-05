import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createAct } from '../build/core/act.js';
import { resolveActDuration, resolveActExport, resolveAssetEvents } from '../build/render/export.js';
import { loadEffect, renderActSequence, renderSequence } from '../build-tools/tools/lib/fxlib.mjs';
import { createAssetBundle } from '../build-tools/tools/lib/asset-bundle.mjs';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const temporary=async fn=>{const dir=mkdtempSync(join(tmpdir(),'poku-export-studio-'));try{return await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}};

const longAct={meta:{name:'Synthetic timeline',size:[4,4],origin:[2,2],duration:10,fps:10,loop:false,bg:'none',options:{}},
  act:{poses:[[-1,{}],[11,{}]],hits:[{t:1,stop:.2,target:false},{t:1,stop:.4,target:false}]},draw(){}};
test('long ACT exports its declared ending and simultaneous freezes; explicit crops are labelled',()=>{
  const fx={id:'test/long-act',file:'',meta:longAct.meta,mod:longAct};
  const bound=resolveActDuration(longAct,{fps:10,hold:0});
  assert.equal(bound.from,-1);assert.equal(bound.end,11);assert.equal(bound.freezeSeconds,.4);
  assert.equal(bound.naturalSeconds,12.4);
  const plan=resolveActExport(longAct,createAct(longAct),{fps:10,hold:0});
  const sequence=renderActSequence(fx,{fps:10,hold:0,actor:false,target:false,bg:'none'});
  const frames=[...sequence.frames];
  assert.equal(frames.length,plan.n);assert.ok(frames.length>81,'no hidden eight second cap');
  assert.equal(frames[0].t,-1);assert.ok(frames.at(-1).t>=11);
  assert.equal(sequence.settings.truncated,false);assert.equal(sequence.settings.termination,'completed');
  const crop=renderActSequence(fx,{fps:10,seconds:2,hold:10,actor:false,target:false,bg:'none'});
  assert.equal(crop.n,21);assert.equal(crop.settings.truncated,true);assert.equal(crop.settings.hold,0);
  assert.equal(crop.settings.termination,'explicit-duration-crop');
});
test('ACT duration handles negative windup once and maximum freezes at loop boundaries',()=>{
  const mod={...longAct,meta:{...longAct.meta,duration:2,loop:true},act:{poses:[[-.5,{}],[2,{}]],hits:[
    {t:-.2,stop:.1,target:false},{t:0,stop:.2,target:false},{t:2,stop:.3,target:false}]}};
  const p=resolveActDuration(mod,{fps:20});
  assert.ok(Math.abs(p.freezeSeconds-.6)<1e-12);
  const counted=resolveActExport(mod,createAct(mod),{fps:20});
  assert.equal(counted.truncated,false);assert.equal(counted.held,0);assert.ok(counted.lastTime>=4-1e-9);
});

test('bounded asset pages reconstruct exact hidden RGB, HDR, trim, pivots, sockets and variable durations',()=>temporary(dir=>{
  const w=4,h=3;
  const make=(x,y,red=77)=>{const color=new Uint8ClampedArray(w*h*4),emission=new Float32Array(w*h*3);
    color.set([red,12,9,0],(y*w+x)*4);color.set([2,240,30,128],(y*w+x+1)*4);emission.set([4.125,.03125,2],(y*w+x+1)*3);
    return{color,emission};};
  const raw=[make(1,1),make(0,0),make(1,1,88),make(0,0,12)];
  raw[3].color.set([1,2,3,0],(h*w-1)*4);
  const frames=raw.map((layers,i)=>({t:[-.1,0,.1,.4][i],durationMs:[45,80,25,100][i],color:layers.color,clear:layers.color,layers,
    pivot:[1.5,2.25],sockets:{grip:{x:2.25,y:1.75,angle:.4,visible:i!==1}}}));
  const fx={id:'test/bundle',file:'',mod:{events:[{id:'contact',at:.1,kind:'contact'}]},meta:{name:'Synthetic channels',loop:false,duration:.4,origin:[1.5,2.25]}};
  const info={w,h,n:frames.length,fps:30,pivot:[1.5,2.25]};
  const sink=createAssetBundle(join(dir,'fixture'),fx,info,{maxTextureSize:6,padding:1,trim:true,deduplicate:true,source:{sourceRevision:'fixture'}});
  try{frames.forEach((f,i)=>sink.push(f,i));sink.finish();}finally{sink.abort();}
  const manifest=JSON.parse(readFileSync(join(dir,'fixture.asset.json'),'utf8'));
  assert.equal(manifest.pages.length,2);assert.equal(manifest.durationMs,250);
  assert.deepEqual(manifest.frames[0].rect,manifest.frames[1].rect,'duplicate storage is reused');
  assert.deepEqual(manifest.frames.map(f=>f.duration),[45,80,25,100]);
  assert.deepEqual(manifest.frames[0].trimOffset,[1,1]);assert.deepEqual(manifest.frames[1].trimOffset,[0,0]);
  assert.equal(manifest.events[0].name,'contact');assert.equal(manifest.events[0].timeMs,125);
  const pages=manifest.pages.map(p=>({rgba:decodePNG(readFileSync(join(dir,p.image))),light:readFileSync(join(dir,p.emission.image)),meta:p}));
  manifest.frames.forEach((frame,i)=>{
    const color=new Uint8ClampedArray(w*h*4),emission=new Float32Array(w*h*3),page=pages[frame.page];
    for(let y=0;y<frame.rect.h;y++)for(let x=0;x<frame.rect.w;x++){
      const src=(frame.rect.y+y)*page.meta.width+frame.rect.x+x,dst=(frame.trimOffset[1]+y)*w+frame.trimOffset[0]+x;
      color.set(page.rgba.rgba.subarray(src*4,src*4+4),dst*4);
      for(let c=0;c<3;c++)emission[dst*3+c]=page.light.readFloatLE((src*3+c)*4);
    }
    assert.deepEqual(color,raw[i].color);assert.deepEqual(emission,raw[i].emission);
    assert.deepEqual(frame.pivot,[1.5,2.25]);assert.deepEqual(frame.sockets,frames[i].sockets);
  });
  for(const f of manifest.files){const bytes=readFileSync(join(dir,f.path));assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);}
  assert.equal(readdirSync(dir).some(f=>f.startsWith('.poku-asset-')),false);
}));
test('asset events use displayed milliseconds through frozen authored time',()=>{
  assert.deepEqual(resolveAssetEvents([{type:'sound',at:.15,value:2}],[{time:0,duration:40},{time:.1,duration:20},{time:.1,duration:60},{time:.4,duration:30}]),
    [{name:'sound',timeMs:120,sourceTime:.15,payload:{type:'sound',at:.15,value:2}}]);
});
test('strict check returns nonzero for an unmatched id instead of a zero-effect success',()=>{
  const result=spawnSync(process.execPath,[join(root,'build-tools/tools/check.mjs'),'missing/no-such-effect'],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/일치하는 이펙트가 없습니다/);assert.doesNotMatch(result.stdout,/0\s*(?:effects|개)/);
});

test('saved projects give browser/CLI identical native channels, camera preview, actors, sockets and contacts',async()=>{
  const {createProject}=await import('../build/authoring/project.js');
  const {createProjectRuntime}=await import('../build/authoring/runtime.js');
  const {createStudioCharacter2D}=await import('../build/core/character-asset.js');
  const {renderProject}=await import('../build-tools/tools/lib/project-render.mjs');
  const {collectAssetEvents,separateFrameLayers}=await import('../build/render/export.js');
  const cases=[
    {id:'status/frozen',kind:'2d',actor:true,target:false,bg:'dark',fps:8,seconds:.5,margin:3,options:{flip:true,angle:Math.PI/2}},
    {id:'melee/sword-slash',kind:'act',actor:true,target:true,bg:'ground',fps:12,seconds:.5,pad:3,cameraMotion:1,options:{flip:true,angle:Math.PI/2}},
    {id:'projectiles/missile-salvo',kind:'2d',actor:false,target:false,bg:'dark',fps:8,seconds:1.2,cameraMotion:1},
    {id:'character/fixture',kind:'character',actor:false,target:false,bg:'none',fps:6,seconds:.5,margin:2,options:{flip:true,angle:Math.PI/2,clip:'walk'},character:createStudioCharacter2D()},
    {id:'status/frozen',kind:'2d',actor:true,target:false,bg:'none',fps:4,seconds:.5,renderProfile:{mode:'cinematic'},
      pixelStyle:{finalColorPolicy:'palette-locked',palette:[0xff000000,0xffffffff,0xff804020],emission:'palette-stepped',quantization:'nearest'},
      edits:[{frame:0,x:0,y:0,color:0xffffffff,channel:'color'},{frame:1,x:1,y:0,color:null,channel:'emission',emission:[2,.5,0]}]},
    ...['object','world','screen'].map(anchor=>({id:'projectiles/missile-salvo',kind:'2d',actor:false,target:false,bg:'dark',fps:8,seconds:1.2,cameraMotion:1,
      margin:3,options:{flip:true,angle:Math.PI/2},pixelStyle:{alpha:'authored-dither',dither:{anchor,pattern:'dispersed8'}},
      edits:Array.from({length:32},(_,i)=>({frame:'all',x:12+i%8,y:12+Math.floor(i/8),color:0x808080ff,channel:'color'}))})),
  ];
  for(const input of cases){
    const p=createProject({...input,seed:9}),run=await renderProject(p,{layers:true,diagnostics:true}),runtime=await createProjectRuntime(p);
    try{
      assert.deepEqual([runtime.width,runtime.height,runtime.frameCount,runtime.origin],[run.sequence.w,run.sequence.h,run.sequence.n,run.sequence.pivot],p.id);
      assert.deepEqual(runtime.contacts,run.sequence.contacts??[],p.id+' contacts');assert.deepEqual(runtime.events,collectAssetEvents(run.fx.mod),p.id+' events');
      let i=0;for(const frame of run.sequence.frames){
        const asset=runtime.render(i/p.fps,i,false,false,'asset'),layers=separateFrameLayers(asset.frame);
        assert.ok(Math.abs(asset.time-frame.t)<1e-9,p.id+' authored time '+i);
        assert.deepEqual(layers.color,frame.layers.color,p.id+' source color '+i);
        assert.deepEqual(layers.emission,frame.layers.emission,p.id+' HDR '+i);
        const actual=runtime.render(i/p.fps,i,false);
        assert.deepEqual(actual.rgba,frame.color,p.id+' preview '+i);
        assert.deepEqual(actual.sockets,frame.sockets,p.id+' socket transform '+i);i++;
      }
    }finally{runtime.dispose();}
  }
});

test('3D bundles retain lighting snapshots and reproduce the camera composite from decoded pages',()=>temporary(async dir=>{
  const {scene3D}=await import('../build-tools/tools/lib/scene3d.mjs');
  const {CinematicCompositor}=await import('../build/render/cinematic.js');
  const {createLayerSheet}=await import('../build-tools/tools/lib/layers.mjs');
  const run=await scene3D('frost',{width:'64',height:'48',frames:'4',fps:'4',cinematic:'true',background:'none',grid:'true','camera-motion':'true'},'atlas');
  const frames=[...run.sequence.frames],sink=createAssetBundle(join(dir,'lighting'),run.effect,run.sequence,{maxTextureSize:128,trim:true,deduplicate:true});
  const layerSink=createLayerSheet(join(dir,'lighting-layers'),run.effect,{...run.sequence,columns:2});
  try{frames.forEach((f,i)=>{sink.push(f,i);layerSink.push(f,i);});sink.finish();layerSink.finish();}finally{sink.abort();layerSink.abort();}
  const layerMeta=JSON.parse(readFileSync(join(dir,'lighting-layers.layers.json'),'utf8'));
  const layerRadiance=readFileSync(join(dir,layerMeta.meta.pokuFx.layers.radiance.image)),layerAO=readFileSync(join(dir,layerMeta.meta.pokuFx.layers.occlusion.image));
  layerMeta.frames.forEach((f,i)=>{for(let y=0;y<run.sequence.h;y++)for(let x=0;x<run.sequence.w;x++){
    const src=(f.frame.y+y)*layerMeta.meta.size.w+f.frame.x+x,dst=y*run.sequence.w+x;
    for(let ch=0;ch<3;ch++)assert.equal(layerRadiance.readFloatLE((src*3+ch)*4),frames[i].layers.radiance[dst*3+ch]);
    assert.equal(layerAO.readFloatLE(src*4),frames[i].layers.occlusion[dst]);
  }});
  const manifest=JSON.parse(readFileSync(join(dir,'lighting.asset.json'),'utf8'));
  assert.ok(frames.some(f=>f.layers.radiance.some(v=>v>0)),'fixture exercises actual world lighting');
  for(const page of manifest.pages){assert.equal(page.radiance.channels,3);assert.equal(page.occlusion.channels,1);}
  const pages=manifest.pages.map(page=>({meta:page,rgba:decodePNG(readFileSync(join(dir,page.image))).rgba,
    emission:readFileSync(join(dir,page.emission.image)),radiance:readFileSync(join(dir,page.radiance.image)),occlusion:readFileSync(join(dir,page.occlusion.image))}));
  manifest.frames.forEach((frame,index)=>{
    const w=run.sequence.w,h=run.sequence.h,color=new Uint32Array(w*h),hdrLight=new Float32Array(w*h*3),radiance=new Float32Array(w*h*3),occlusion=new Float32Array(w*h).fill(1);
    const page=pages[frame.page];
    for(let y=0;y<frame.rect.h;y++)for(let x=0;x<frame.rect.w;x++){
      const src=(frame.rect.y+y)*page.meta.width+frame.rect.x+x,dst=(frame.trimOffset[1]+y)*w+frame.trimOffset[0]+x,c=src*4;
      color[dst]=(page.rgba[c]|page.rgba[c+1]<<8|page.rgba[c+2]<<16|page.rgba[c+3]<<24)>>>0;
      for(let ch=0;ch<3;ch++){hdrLight[dst*3+ch]=page.emission.readFloatLE((src*3+ch)*4);radiance[dst*3+ch]=page.radiance.readFloatLE((src*3+ch)*4);}
      occlusion[dst]=page.occlusion.readFloatLE(src*4);
    }
    assert.deepEqual(hdrLight,frames[index].layers.emission);assert.deepEqual(radiance,frames[index].layers.radiance);assert.deepEqual(occlusion,frames[index].layers.occlusion);
    const rgba=new Uint8ClampedArray(w*h*4);
    new CinematicCompositor().render({w,h,color,light:new Uint32Array(w*h),hdrLight},rgba,{...run.sequence.settings.renderProfile.cinematic,background:null,radiance,occlusion});
    assert.deepEqual(rgba,frames[index].clear,'decoded bundle reproduces 3D preview frame '+index);
  });
  for(const f of manifest.files)assert.equal(createHash('sha256').update(readFileSync(join(dir,f.path))).digest('hex'),f.sha256);
}));

test('lossless atlas trim and dedup include alpha-independent radiance and occlusion-only cells',()=>temporary(dir=>{
  const make=ao=>{const color=new Uint8ClampedArray(16),emission=new Float32Array(12),radiance=new Float32Array(12),occlusion=new Float32Array(4).fill(1);
    radiance[3]=2.5;occlusion[3]=ao;return{color,emission,radiance,occlusion};};
  const raw=[make(.5),make(.4),make(.5)],fx={id:'test/lighting-trim',file:'',mod:{},meta:{duration:.3,loop:false,origin:[0,0]}},info={w:4,h:1,n:3,fps:10};
  const sink=createAssetBundle(join(dir,'trim'),fx,info,{maxTextureSize:6,trim:true,deduplicate:true});
  try{raw.forEach((layers,i)=>sink.push({t:i/10,color:layers.color,clear:layers.color,layers},i));sink.finish();}finally{sink.abort();}
  const manifest=JSON.parse(readFileSync(join(dir,'trim.asset.json'),'utf8'));
  assert.deepEqual(manifest.frames[0].trimOffset,[1,0]);assert.equal(manifest.frames[0].rect.w,3);
  assert.notDeepEqual(manifest.frames[0].rect,manifest.frames[1].rect);assert.deepEqual(manifest.frames[0].rect,manifest.frames[2].rect);
}));

test('color-only project erasing preserves independent optical emission through bundle export',()=>temporary(async dir=>{
  const {createProject}=await import('../build/authoring/project.js');
  const {renderProject}=await import('../build-tools/tools/lib/project-render.mjs');
  const project=createProject({id:'status/frozen',kind:'2d',actor:false,target:false,bg:'none',fps:1,seconds:0,
    pixelStyle:{edgeFade:false},edits:[
      {frame:0,x:0,y:0,color:0xffffffff,channel:'color'},
      {frame:0,x:0,y:0,color:null,channel:'emission',emission:[2,.5,.125]},
      {frame:0,x:0,y:0,color:null,channel:'color'},
    ]});
  const run=await renderProject(project,{layers:true}),frames=[...run.sequence.frames];
  assert.equal(frames.length,1);assert.equal(frames[0].layers.color[3],0);
  assert.deepEqual([...frames[0].layers.emission.slice(0,3)],[2,.5,.125]);
  const sink=createAssetBundle(join(dir,'optical'),run.fx,run.sequence,{maxTextureSize:512,trim:true});
  try{sink.push(frames[0]);sink.finish();}finally{sink.abort();}
  const manifest=JSON.parse(readFileSync(join(dir,'optical.asset.json'),'utf8')),frame=manifest.frames[0],page=manifest.pages[frame.page];
  assert.deepEqual(frame.trimOffset,[0,0]);
  const bytes=readFileSync(join(dir,page.emission.image)),start=((frame.rect.y*page.width+frame.rect.x)*3)*4;
  assert.deepEqual([0,1,2].map(ch=>bytes.readFloatLE(start+ch*4)),[2,.5,.125]);
}));

test('default effect/project bundles declare legacy finishing and cinematic projects preserve their explicit policy',()=>temporary(async dir=>{
  const {createProject}=await import('../build/authoring/project.js');
  const {renderProject}=await import('../build-tools/tools/lib/project-render.mjs');
  const fx=await loadEffect('projectiles/arrow');
  const base={id:fx.id,kind:'2d',actor:false,target:false,bg:'none',fps:1,seconds:0};
  const defaults=await renderProject(createProject(base),{layers:true});
  const cinematic=await renderProject(createProject({...base,renderProfile:{mode:'cinematic'}}),{layers:true});
  const cases=[
    ['effect',fx,renderSequence(fx,{fps:1,seconds:0,actor:false,bg:'none',layers:true}),'legacy'],
    ['project',defaults.fx,defaults.sequence,'legacy'],
    ['cinematic',cinematic.fx,cinematic.sequence,'cinematic'],
  ];
  for(const [name,effect,sequence,expected] of cases){
    const sink=createAssetBundle(join(dir,name),effect,sequence,{maxTextureSize:512,trim:true});
    try{[...sequence.frames].forEach((frame,i)=>sink.push(frame,i));sink.finish();}finally{sink.abort();}
    const manifest=JSON.parse(readFileSync(join(dir,name+'.asset.json'),'utf8'));
    assert.equal(manifest.settings.renderMode,expected,name+' has an explicit source finishing contract');
  }
}));

test('socket bases retain reflection handedness through export rotation',async()=>{
  const {transformExportSockets}=await import('../build/render/export.js');
  const original={grip:{x:3,y:2,angle:0,basisX:[1,0],basisY:[0,1],mirrorPolicy:'reflect'}};
  const transformed=transformExportSockets(original,[1,1],[5,7],{flip:true,angle:Math.PI/2}).grip;
  assert.ok(Math.abs(transformed.x-4)<1e-12);assert.ok(Math.abs(transformed.y-5)<1e-12);
  const determinant=transformed.basisX[0]*transformed.basisY[1]-transformed.basisX[1]*transformed.basisY[0];
  assert.ok(Math.abs(determinant+1)<1e-12);assert.equal(transformed.mirrorPolicy,'reflect');
  assert.deepEqual(original.grip.basisX,[1,0]);
});

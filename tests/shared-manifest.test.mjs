// In-memory API contract tests. No requests, credentials, declarations or uploads leave this process.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'poku-share-test-'));
await build({entryPoints:[join(root,'site/lib/share.ts'),join(root,'site/lib/shared-manifest.ts')],bundle:true,format:'esm',platform:'node',outdir:dir,outExtension:{'.js':'.mjs'},logLevel:'silent'});
const api=await import(pathToFileURL(join(dir,'share.mjs')).href),{sharedPlayback,relinkSharedManifestImage}=await import(pathToFileURL(join(dir,'shared-manifest.mjs')).href);
after(()=>rmSync(dir,{recursive:true,force:true}));
const origin='https://synthetic-fixture.invalid',png=encodePNG(2,1,new Uint8Array([255,0,0,128,0,255,0,255]));
const source=()=>({frames:[
  {frame:{x:0,y:0,w:1,h:1},sourceSize:{w:3,h:2},spriteSourceSize:{x:0,y:0,w:1,h:1},duration:50},
  {frame:{x:1,y:0,w:1,h:1},sourceSize:{w:3,h:2},spriteSourceSize:{x:2,y:1,w:1,h:1},duration:175}],
  meta:{image:'original.png',size:{w:2,h:1},frameTags:[{name:'strike',from:0,to:1,direction:'forward'}],
    pokuFx:{loop:false,pivot:[1.5,2],socketSamples:[{grip:{x:1,y:1,angle:.2}},{grip:{x:2,y:1,angle:.7}}],
      contacts:[{at:.05,type:'impact'}],settings:{project:{seed:123,edits:[{frame:1,x:0,y:0,color:123}]}}}},
  futureMetadata:{keep:['unknown','fields']}});
function bucket(){let serial=0;const objects=new Map();return{objects,failImage:false,conflict:false,
  async put(key,bytes,options){if(this.failImage&&key.startsWith('shared/'))throw new Error('synthetic write failure');
    if(options.onlyIf&&(this.conflict||objects.get(key)?.etag!==options.onlyIf.etagMatches))return null;
    const item={key,bytes:new Uint8Array(bytes).slice(),customMetadata:{...options.customMetadata},etag:`etag-${++serial}`};objects.set(key,item);return{etag:item.etag};},
  async get(key){const item=objects.get(key);return item?{key,customMetadata:{...item.customMetadata},etag:item.etag,body:new Response(item.bytes).body}:null;},
  async list({prefix}){return{objects:[...objects.values()].filter(o=>o.key.startsWith(prefix)).map(o=>({key:o.key,customMetadata:{...o.customMetadata}})),truncated:false};},
  async delete(key){objects.delete(key);}};}
function database(){
  return { released:0, prepare(sql){
    return { bind:()=>({
      first:async()=>({id:'synthetic'}),
      run:async()=>{if(sql.startsWith('UPDATE'))this.released++;},
    }) };
  } };
}
function form(manifest=source()){
  const f=new FormData();f.set('title','Synthetic manifest fixture');f.set('tags','fixture');f.set('rights','yes');
  f.set('file',new Blob([png],{type:'image/png'}),'fixture.png');
  if(manifest)f.set('manifest',new Blob([JSON.stringify(manifest)],{type:'application/json'}),'fixture.json');
  else{f.set('frameWidth','1');f.set('frameHeight','1');f.set('frameCount','2');f.set('fps','144');f.set('loop','no');}
  return f;
}
const request=(body,id,method='POST')=>new Request(`${origin}/api/shared${id?'?id='+id:''}`,{method,headers:{origin},body});
const get=(id,format)=>new Request(`${origin}/api/shared?id=${id}${format?'&format='+format:''}`);

test('upload, title edit, listing, download and deletion retain full original manifest',async()=>{
  const b=bucket(),db=database(),original=source();
  const uploaded=await api.upload(request(form(original)),b,db,'synthetic-owner');assert.equal(uploaded.status,201);const{id}=await uploaded.json();
  assert.equal(b.objects.size,2);assert.deepEqual(await(await api.read(get(id,'manifest'),b,null)).json(),original);
  const listed=await(await api.read(new Request(origin+'/api/shared'),b,'synthetic-owner')).json();
  assert.equal(listed.items.length,1);assert.equal(listed.items[0].manifest,true);assert.equal(listed.items[0].owned,true);
  const f=new FormData();f.set('title','Changed synthetic title');f.set('tags','fixture');
  assert.equal((await api.edit(request(f,id,'PATCH'),b,'synthetic-owner')).status,200);
  assert.deepEqual(await(await api.read(get(id,'manifest'),b,null)).json(),original);
  const playback=sharedPlayback(original,{w:2,h:1});assert.deepEqual(playback.frames.map(f=>f.duration),[50,175]);assert.equal(playback.durationMs,225);
  assert.deepEqual(playback.frames[1].spriteSourceSize,{x:2,y:1,w:1,h:1});assert.equal(playback.loop,false);
  assert.equal((await api.remove(new Request(`${origin}/api/shared?id=${id}`,{method:'DELETE',headers:{origin}}),b,db,'synthetic-owner')).status,200);
  assert.equal(b.objects.size,0);assert.equal(db.released,1);
});
test('conditional edit conflict cleans its new sidecar while retaining the old image/JSON pair',async()=>{
  const b=bucket(),db=database(),uploaded=await api.upload(request(form()),b,db,'owner'),{id}=await uploaded.json();
  const oldKeys=[...b.objects.keys()].sort(),changed=source();changed.frames[1].duration=300;b.conflict=true;
  const f=new FormData();f.set('title','Concurrent fixture');f.set('manifest',JSON.stringify(changed));
  assert.equal((await api.edit(request(f,id,'PATCH'),b,'owner')).status,409);
  assert.deepEqual([...b.objects.keys()].sort(),oldKeys);assert.deepEqual(await(await api.read(get(id,'manifest'),b,null)).json(),source());
});
test('failed image storage removes its staged manifest and releases the quota reservation',async()=>{
  const b=bucket(),db=database();b.failImage=true;
  assert.equal((await api.upload(request(form()),b,db,'owner')).status,503);assert.equal(b.objects.size,0);assert.equal(db.released,1);
});
test('legacy entries explicitly reconstruct balanced timing without claiming original metadata',async()=>{
  const b=bucket(),response=await api.upload(request(form(null)),b,database(),'owner');assert.equal(response.status,201);const{id}=await response.json();
  const json=await(await api.read(get(id,'manifest'),b,null)).json();
  assert.equal(json.meta.pokuFx.reconstructedLegacy,true);assert.equal(json.frames.length,2);
  assert.equal(json.frames.reduce((sum,f)=>sum+f.duration,0),Math.round(2000/144));
});
test('manifest validation supports static frames and rejects inconsistent/multi-page public PNG metadata',()=>{
  const one=source();one.frames=one.frames.slice(0,1);assert.equal(sharedPlayback(one,{w:2,h:1}).animation.frameCount,1);
  const invalid=source();invalid.frames[1].frame.x=2;assert.throws(()=>sharedPlayback(invalid,{w:2,h:1}),/PNG/);
  assert.throws(()=>sharedPlayback({schema:'poku-asset/v1',frames:source().frames,pages:[{},{}]}),/여러 atlas/);
});
test('bulk download relinks PNG filenames without mutating source metadata or file digests',()=>{
  const original=source(),linked=relinkSharedManifestImage(original,'download.png');
  assert.equal(original.meta.image,'original.png');assert.equal(linked.meta.image,'download.png');
  assert.deepEqual(linked.frames,original.frames);assert.deepEqual(linked.futureMetadata,original.futureMetadata);
  const asset={schema:'poku-asset/v1',frames:source().frames,pages:[{image:'page.png',width:2,height:1}],
    files:[{path:'page.png',sha256:'retained-digest',bytes:12}],meta:'opaque authored metadata'};
  const relinked=relinkSharedManifestImage(asset,'asset.png');
  assert.equal(relinked.pages[0].image,'asset.png');assert.equal(relinked.files[0].path,'asset.png');
  assert.equal(relinked.files[0].sha256,'retained-digest');assert.equal(relinked.meta,asset.meta);
});

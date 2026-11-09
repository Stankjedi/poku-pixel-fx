import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {parseGIFBackground,flattenGIFPreviewRGBA} from '../build-tools/tools/lib/gif-background.mjs';
import {parseGenerationPreviewArgs} from '../build-tools/tools/lib/generation-preview.mjs';
import {writeVideos} from '../build-tools/tools/lib/video.mjs';

const hasFFmpeg=spawnSync('ffmpeg',['-version']).status===0;
const args=['--material','fire','--action','burst','--seeds','17','--out','/tmp/not-created-gif-background'];
const run=(exe,args)=>{const r=spawnSync(exe,args,{maxBuffer:128*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;};

test('GIF background is strict, explicit and cannot silently imply a video export',()=>{
 const before=parseGenerationPreviewArgs(args);assert(!Object.hasOwn(before,'gifBackground'));
 assert.equal(parseGenerationPreviewArgs([...args,'--gif','--gif-background','#A1b2C3']).gifBackground,'#a1b2c3');
 assert.throws(()=>parseGenerationPreviewArgs([...args,'--gif-background','#15131d']),/requires --gif/);
 for(const x of ['dark','#fff','ff00ff','#1234567','#12gg56',' #112233','#112233 ',null,undefined,17])assert.throws(()=>parseGIFBackground(x));
 assert.throws(()=>parseGenerationPreviewArgs([...args,'--gif','--gif-background','#000000','--gif-background','#ffffff']));
 const p=parseGIFBackground('#010203');assert.deepEqual(p.rgb,[1,2,3]);assert(Object.isFrozen(p));assert(Object.isFrozen(p.rgb));
});

test('encoded-RGB source-over is exact at alpha boundaries and does not mutate aliased source buffers',()=>{
 const alphas=[0,1,127,128,254,255],storage=new Uint8ClampedArray(8+alphas.length*4+12).fill(99),source=storage.subarray(8,8+alphas.length*4);
 alphas.forEach((a,i)=>source.set([240,130,20,a],i*4));const before=storage.slice(),bg=[21,19,29],out=flattenGIFPreviewRGBA(source,bg);
 assert.notEqual(out.buffer,source.buffer);assert.deepEqual(storage,before);assert.deepEqual(bg,[21,19,29]);
 alphas.forEach((a,i)=>{for(let c=0;c<3;c++)assert.equal(out[i*4+c],Math.floor((source[i*4+c]*a+bg[c]*(255-a))/255+.5));assert.equal(out[i*4+3],255);});
 assert.deepEqual([...out.slice(0,4)],[21,19,29,255]);assert.deepEqual([...out.slice(-4)],[240,130,20,255]);
 for(const rgb of [[],[0,0],[0,0,0,0],[0,0,-1],[0,0,256],[0,0,.5],[0,NaN,0]])assert.throws(()=>flattenGIFPreviewRGBA(source,rgb));
 assert.throws(()=>flattenGIFPreviewRGBA(new Uint8ClampedArray(3),bg));
});

test('real encoded GIF preserves exact small-palette backed pixels, frame order and source data', {skip:!hasFFmpeg},()=>{
 const dir=mkdtempSync(join(tmpdir(),'poku-gif-background-'));
 try{
  const source=new Uint8ClampedArray([255,90,0,0,255,90,0,1,255,90,0,127,255,90,0,128,255,90,0,254,255,90,0,255]);
  const snapshot=source.slice(),opaque=flattenGIFPreviewRGBA(source,[21,19,29]),frames=[{color:opaque},{color:flattenGIFPreviewRGBA(source,[240,240,240])}];
  const file=join(dir,'backed.gif');assert(writeVideos([{file,scale:1}],{w:3,h:2,fps:20,n:2,frames}));
  const raw=run('ffmpeg',['-v','error','-i',file,'-vsync','0','-f','rawvideo','-pix_fmt','rgba','-']);
  assert.deepEqual(raw,Buffer.concat(frames.map(f=>Buffer.from(f.color))));assert.deepEqual(source,snapshot);
  const meta=JSON.parse(run('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',file])).streams[0];
  assert.equal(meta.width,3);assert.equal(meta.height,2);assert.equal(Number(meta.nb_read_frames),2);assert.equal(Number(meta.duration),.1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('public CLI rejects malformed and GIF-less background options before creating output',()=>{
 const dir=mkdtempSync(join(tmpdir(),'poku-gif-background-invalid-'));
 try{for(const flags of [['--gif-background','#15131d'],['--gif','--gif-background','dark'],['--gif','--gif-background','#123'],['--gif','--gif-background','#000000','--gif-background','#ffffff']]){
  const out=join(dir,'bad'),r=spawnSync(process.execPath,['tools/poku.mjs','preview-generation',...args.slice(0,-2),'--out',out,...flags],{encoding:'utf8'});
  assert.equal(r.status,1,r.stdout+r.stderr);assert(!existsSync(out));
 }}finally{rmSync(dir,{recursive:true,force:true});}
});

test('actual generation CLI backs only GIF pixels while preserving all transparent asset files', {skip:!hasFFmpeg,timeout:120000},()=>{
 const dir=mkdtempSync(join(tmpdir(),'poku-gif-background-cli-'));
 try{
  const base=['tools/poku.mjs','preview-generation','--material','fire','--action','burst','--seeds','17','--fire-sparks','short-exposure','--gif'];
  for(const [name,flags]of [['legacy',[]],['backed',['--gif-background','#15131d']]])run(process.execPath,[...base,'--out',join(dir,name),...flags]);
  const a=join(dir,'legacy','seed-17'),b=join(dir,'backed','seed-17');
  for(const file of ['sheet.png','sheet.json','contact.png','project.json','generation.json'])assert.deepEqual(readFileSync(join(a,file)),readFileSync(join(b,file)),file);
  const legacy=JSON.parse(readFileSync(join(dir,'legacy','manifest.json'))),backed=JSON.parse(readFileSync(join(dir,'backed','manifest.json')));
  assert(!Object.hasOwn(legacy.policy,'gifBackground'));assert.equal(backed.policy.gifBackground,'#15131d');assert.match(backed.policy.gifComposition,/encoded-RGB/);
  assert.equal(backed.candidates[0].projectSha256,legacy.candidates[0].projectSha256);
  const file=join(b,'anim.gif'),decoded=run('ffmpeg',['-v','error','-i',file,'-vsync','0','-f','rawvideo','-pix_fmt','rgba','-']);
  const c=backed.candidates[0],[w,h]=c.size;assert.equal(decoded.length,c.frames*w*h*4);
  for(let k=3;k<decoded.length;k+=4)assert.equal(decoded[k],255);
  for(let k=0;k<w*h*4;k+=4)assert.deepEqual([...decoded.subarray(k,k+4)],[21,19,29,255]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
